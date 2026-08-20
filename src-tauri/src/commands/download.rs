use tauri::{AppHandle, State};

use crate::download::{DownloadManager, DownloadTask};
use crate::error::AppResult;
use crate::media::models::MediaFormat;

#[tauri::command]
pub fn create_download_task(
    manager: State<'_, DownloadManager>,
    source_url: String,
    title: String,
) -> AppResult<DownloadTask> {
    manager.create_task(source_url, title)
}

#[tauri::command]
pub fn select_download_format(
    manager: State<'_, DownloadManager>,
    task_id: String,
    format: MediaFormat,
) -> AppResult<DownloadTask> {
    manager.select_format(&task_id, format)
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    manager: State<'_, DownloadManager>,
    task_id: String,
) -> AppResult<DownloadTask> {
    manager.start(&app, &task_id).await
}

#[tauri::command]
pub fn cancel_download(
    app: AppHandle,
    manager: State<'_, DownloadManager>,
    task_id: String,
) -> AppResult<DownloadTask> {
    manager.cancel(&app, &task_id)
}

#[tauri::command]
pub fn get_download_task(
    manager: State<'_, DownloadManager>,
    task_id: String,
) -> AppResult<DownloadTask> {
    manager.get_task(&task_id)
}

#[tauri::command]
pub fn cleanup_download(
    manager: State<'_, DownloadManager>,
    task_id: String,
) -> AppResult<()> {
    manager.cleanup(&task_id)
}