//! Conversion jobs: one ffmpeg sidecar process per job, progress streamed to the UI as events.
//! The frontend decides the ffmpeg arguments and how many jobs run at once.

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSpec {
    id: String,
    input: String,
    /// Arguments placed before `-i` (e.g. `-ss` for a fast trim seek).
    #[serde(default)]
    input_args: Vec<String>,
    /// Arguments placed after `-i` (codecs, filters, quality).
    #[serde(default)]
    output_args: Vec<String>,
    /// Output folder; defaults to the input's folder.
    output_dir: Option<String>,
    /// Output extension without the dot.
    ext: String,
    /// Expected output duration in seconds, used to turn ffmpeg's out_time into a percentage.
    duration: Option<f64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    id: &'a str,
    percent: Option<f64>,
    speed: Option<f64>,
}

#[derive(Default)]
pub struct Jobs {
    running: Mutex<HashMap<String, CommandChild>>,
    cancelled: Mutex<HashSet<String>>,
    /// Output paths claimed by running jobs, so two jobs never pick the same file name.
    reserved: Mutex<HashSet<PathBuf>>,
}

/// Picks `dir/stem.ext`, or `dir/stem (n).ext` if that exists, is the input, or is claimed by another job.
fn unique_output(jobs: &Jobs, input: &Path, dir: &Path, ext: &str) -> PathBuf {
    let stem = input.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "output".into());
    let mut reserved = jobs.reserved.lock().unwrap();
    let mut n = 0;
    loop {
        let name = if n == 0 { format!("{stem}.{ext}") } else { format!("{stem} ({n}).{ext}") };
        let candidate = dir.join(name);
        if !candidate.exists() && candidate != input && !reserved.contains(&candidate) {
            reserved.insert(candidate.clone());
            return candidate;
        }
        n += 1;
    }
}

fn parse_speed(value: &str) -> Option<f64> {
    value.trim().strip_suffix('x')?.trim().parse().ok()
}

#[tauri::command]
pub async fn start_job(app: AppHandle, jobs: State<'_, Jobs>, spec: JobSpec) -> Result<String, String> {
    let input = PathBuf::from(&spec.input);
    let dir = match &spec.output_dir {
        Some(d) if !d.is_empty() => PathBuf::from(d),
        _ => input.parent().map(Path::to_path_buf).unwrap_or_default(),
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let output = unique_output(&jobs, &input, &dir, &spec.ext);
    let output_str = output.to_string_lossy().into_owned();

    let mut args: Vec<String> = vec!["-hide_banner".into(), "-nostdin".into(), "-y".into()];
    args.extend(spec.input_args.iter().cloned());
    args.extend(["-i".into(), spec.input.clone()]);
    args.extend(spec.output_args.iter().cloned());
    args.extend(["-progress".into(), "pipe:1".into(), "-nostats".into(), output_str.clone()]);

    let result = run(&app, &jobs, &spec, args).await;

    jobs.running.lock().unwrap().remove(&spec.id);
    jobs.reserved.lock().unwrap().remove(&output);
    let was_cancelled = jobs.cancelled.lock().unwrap().remove(&spec.id);

    match result {
        Ok(()) if !was_cancelled => Ok(output_str),
        other => {
            let _ = std::fs::remove_file(&output);
            Err(if was_cancelled { "cancelled".into() } else { other.unwrap_err() })
        }
    }
}

async fn run(app: &AppHandle, jobs: &Jobs, spec: &JobSpec, args: Vec<String>) -> Result<(), String> {
    let (mut rx, child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .spawn()
        .map_err(|e| e.to_string())?;
    jobs.running.lock().unwrap().insert(spec.id.clone(), child);

    let mut stderr_tail: VecDeque<String> = VecDeque::with_capacity(20);
    let mut seconds: Option<f64> = None;
    let mut speed: Option<f64> = None;
    let mut exit_code: Option<i32> = None;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => {
                let line = String::from_utf8_lossy(&bytes);
                let Some((key, value)) = line.trim().split_once('=') else { continue };
                match key {
                    // despite the name, out_time_ms is also microseconds
                    "out_time_us" | "out_time_ms" => {
                        if let Ok(us) = value.parse::<f64>() {
                            seconds = Some(us / 1_000_000.0);
                        }
                    }
                    "speed" => speed = parse_speed(value),
                    "progress" => {
                        let percent = match (seconds, spec.duration) {
                            (_, _) if value == "end" => Some(100.0),
                            (Some(s), Some(d)) if d > 0.0 => Some((s / d * 100.0).clamp(0.0, 99.9)),
                            _ => None,
                        };
                        let _ = app.emit("job-progress", Progress { id: &spec.id, percent, speed });
                    }
                    _ => {}
                }
            }
            CommandEvent::Stderr(bytes) => {
                let line = String::from_utf8_lossy(&bytes).trim().to_owned();
                if !line.is_empty() {
                    if stderr_tail.len() == 20 {
                        stderr_tail.pop_front();
                    }
                    stderr_tail.push_back(line);
                }
            }
            CommandEvent::Terminated(payload) => exit_code = payload.code,
            CommandEvent::Error(e) => return Err(e),
            _ => {}
        }
    }

    if exit_code == Some(0) {
        Ok(())
    } else {
        let tail: Vec<String> = stderr_tail.into_iter().collect();
        Err(tail.iter().rev().take(4).rev().cloned().collect::<Vec<_>>().join("\n"))
    }
}

#[tauri::command]
pub fn cancel_job(jobs: State<'_, Jobs>, id: String) {
    if let Some(child) = jobs.running.lock().unwrap().remove(&id) {
        jobs.cancelled.lock().unwrap().insert(id);
        let _ = child.kill();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unique_output_skips_existing_and_reserved() {
        let dir = std::env::temp_dir().join(format!("morph-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("clip.webm"), b"x").unwrap();
        let jobs = Jobs::default();
        let input = dir.join("clip.mp4");
        assert_eq!(unique_output(&jobs, &input, &dir, "webm"), dir.join("clip (1).webm"));
        assert_eq!(unique_output(&jobs, &input, &dir, "webm"), dir.join("clip (2).webm"));
        // converting to the same extension must never overwrite the input
        assert_eq!(unique_output(&jobs, &input, &dir, "mp4"), dir.join("clip (1).mp4"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn parses_speed() {
        assert_eq!(parse_speed("2.5x"), Some(2.5));
        assert_eq!(parse_speed(" 1.02x"), Some(1.02));
        assert_eq!(parse_speed("N/A"), None);
    }
}
