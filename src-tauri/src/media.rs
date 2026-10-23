//! Media inspection helpers built on the bundled ffmpeg sidecar.
//! There is no ffprobe in the bundle (saves ~170MB), so `probe` parses the
//! banner ffmpeg prints for `-i <file>`.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;

#[derive(Serialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub size: u64,
    pub duration: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
}

pub async fn run_ffmpeg(app: &AppHandle, args: &[&str]) -> Result<(bool, String), String> {
    let out = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    Ok((out.status.success(), String::from_utf8_lossy(&out.stderr).into_owned()))
}

#[tauri::command]
pub async fn probe(app: AppHandle, path: String) -> Result<MediaInfo, String> {
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    // ffmpeg exits non-zero without an output file; the banner on stderr is all we need
    let (_, stderr) = run_ffmpeg(&app, &["-hide_banner", "-nostdin", "-i", &path]).await?;
    let mut info = parse_probe(&stderr);
    info.size = size;
    Ok(info)
}

fn parse_timestamp(ts: &str) -> Option<f64> {
    let mut parts = ts.trim().split(':');
    let h: f64 = parts.next()?.parse().ok()?;
    let m: f64 = parts.next()?.parse().ok()?;
    let s: f64 = parts.next()?.parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

fn parse_probe(text: &str) -> MediaInfo {
    let mut info = MediaInfo::default();
    for line in text.lines().map(str::trim) {
        if let Some(rest) = line.strip_prefix("Duration: ") {
            if info.duration.is_none() {
                info.duration = rest.split(',').next().and_then(parse_timestamp);
            }
        } else if line.starts_with("Stream #") {
            if let Some(idx) = line.find("Video: ") {
                if info.video_codec.is_some() {
                    continue;
                }
                let rest = &line[idx + 7..];
                info.video_codec = rest.split([' ', ',']).next().map(str::to_owned);
                for part in rest.split(',').map(str::trim) {
                    let token = part.split(' ').next().unwrap_or("");
                    if info.width.is_none() {
                        if let Some((w, h)) = token.split_once('x') {
                            if let (Ok(w), Ok(h)) = (w.parse::<u32>(), h.parse::<u32>()) {
                                if w > 0 && h > 0 {
                                    info.width = Some(w);
                                    info.height = Some(h);
                                }
                            }
                        }
                    }
                    if let Some(fps) = part.strip_suffix(" fps") {
                        info.fps = fps.parse().ok();
                    }
                }
            } else if let Some(idx) = line.find("Audio: ") {
                if info.audio_codec.is_none() {
                    info.audio_codec = line[idx + 7..].split([' ', ',']).next().map(str::to_owned);
                }
            }
        }
    }
    info
}

/// Renders a small JPEG preview of a video and returns its path (cached by path + mtime).
#[tauri::command]
pub async fn thumbnail(app: AppHandle, path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    meta.modified().ok().hash(&mut hasher);
    let dir: PathBuf = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("thumbs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = dir.join(format!("{:016x}.jpg", hasher.finish()));
    let out_str = out.to_string_lossy().into_owned();
    if out.exists() {
        return Ok(out_str);
    }
    let base = ["-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "5", "-y", &out_str];
    // Seek 1s in to skip black intro frames; clips shorter than that produce nothing, so retry from 0
    for seek in ["1", "0"] {
        let mut args = vec!["-hide_banner", "-nostdin", "-ss", seek, "-i", &path];
        args.extend_from_slice(&base);
        run_ffmpeg(&app, &args).await?;
        if out.exists() {
            return Ok(out_str);
        }
    }
    Err("could not render thumbnail".into())
}

/// Returns the hardware H.264 encoder families that actually work on this machine
/// (ffmpeg lists nvenc/qsv/amf even when the GPU or driver is missing).
#[tauri::command]
pub async fn detect_hw_encoders(app: AppHandle) -> Vec<String> {
    let mut found = Vec::new();
    for family in ["nvenc", "qsv", "amf"] {
        let encoder = format!("h264_{family}");
        let args = [
            "-hide_banner", "-nostdin", "-f", "lavfi", "-i", "color=black:s=256x256:d=0.1",
            "-frames:v", "1", "-c:v", &encoder, "-f", "null", "-",
        ];
        if let Ok((true, _)) = run_ffmpeg(&app, &args).await {
            found.push(family.to_owned());
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_video_banner() {
        let text = "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mp4':\n  Duration: 00:01:02.50, start: 0.000000, bitrate: 1205 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 1000 kb/s, 29.97 fps, 29.97 tbr, 30k tbn (default)\n  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 192 kb/s (default)\n";
        let info = parse_probe(text);
        assert_eq!(info.duration, Some(62.5));
        assert_eq!((info.width, info.height), (Some(1920), Some(1080)));
        assert_eq!(info.fps, Some(29.97));
        assert_eq!(info.video_codec.as_deref(), Some("h264"));
        assert_eq!(info.audio_codec.as_deref(), Some("aac"));
    }

    #[test]
    fn parses_image_banner() {
        let text = "Input #0, png_pipe, from 'a.png':\n  Duration: N/A, bitrate: N/A\n  Stream #0:0: Video: png, rgba(pc, gbr/unknown/unknown), 800x600, 25 fps, 25 tbr, 25 tbn\n";
        let info = parse_probe(text);
        assert_eq!(info.duration, None);
        assert_eq!((info.width, info.height), (Some(800), Some(600)));
        assert_eq!(info.audio_codec, None);
    }
}
