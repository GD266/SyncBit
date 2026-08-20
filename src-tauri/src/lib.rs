mod commands;
mod config;
mod download;
mod error;
mod media;
mod storage;

use std::sync::Arc;

use config::RuntimeConfig;
use download::DownloadManager;
use media::ProviderRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime_config = RuntimeConfig::from_env().expect("failed to load runtime configuration");
    let registry = Arc::new(ProviderRegistry::new());
    let download_manager = DownloadManager::new(Arc::clone(&registry));

    tauri::Builder::default()
        .manage(runtime_config)
        .manage(registry)
        .manage(download_manager)
        .setup(|app| {
            let data_dir = storage::ensure_app_data_dir(app.handle())?;
            println!("SyncBit data directory: {}", data_dir.display());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::media::fetch_media_metadata,
            commands::download::create_download_task,
            commands::download::select_download_format,
            commands::download::start_download,
            commands::download::cancel_download,
            commands::download::get_download_task,
            commands::download::cleanup_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SyncBit application");
}