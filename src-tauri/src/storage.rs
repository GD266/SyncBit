use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

/// Ensures the per-user application data directory exists and returns its path.
/// All GrabAClip persistence (configuration, queue state, downloads) lives here.
pub fn ensure_app_data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Internal(format!("failed to resolve app data dir: {error}")))?;
    std::fs::create_dir_all(&dir).map_err(AppError::from)?;
    Ok(dir)
}
