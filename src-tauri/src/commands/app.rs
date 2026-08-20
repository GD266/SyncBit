use serde::Serialize;
use tauri::{AppHandle, State};

use crate::config::RuntimeConfig;
use crate::error::{AppError, AppResult};
use crate::storage;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub environment: &'static str,
    pub platform: &'static str,
    pub arch: &'static str,
    pub data_dir: String,
    pub log_level: String,
}

#[tauri::command]
pub fn get_app_info(app: AppHandle, config: State<'_, RuntimeConfig>) -> AppResult<AppInfo> {
    let data_dir = storage::ensure_app_data_dir(&app).map_err(AppError::from)?;
    Ok(AppInfo {
        name: "SyncBit",
        version: env!("CARGO_PKG_VERSION"),
        environment: config.environment.as_str(),
        platform: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        data_dir: data_dir.to_string_lossy().into_owned(),
        log_level: config.log_level.clone(),
    })
}
