mod jobs;
mod media;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(jobs::Jobs::default())
        .invoke_handler(tauri::generate_handler![
            media::probe,
            media::thumbnail,
            media::detect_hw_encoders,
            jobs::start_job,
            jobs::cancel_job,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
