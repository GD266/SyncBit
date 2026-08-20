mod commands;
mod config;
mod error;
mod media;
mod storage;

use config::RuntimeConfig;
use media::ProviderRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime_config = RuntimeConfig::from_env().expect("failed to load runtime configuration");

    tauri::Builder::default()
        .manage(runtime_config)
        .manage(ProviderRegistry::new())
        .setup(|app| {
            let data_dir = storage::ensure_app_data_dir(app.handle())?;
            println!("SyncBit data directory: {}", data_dir.display());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::media::fetch_media_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SyncBit application");
}
