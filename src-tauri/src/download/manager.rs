use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use reqwest::Client;
use tauri::{AppHandle, Emitter, Manager};

use crate::download::models::{DownloadErrorInfo, DownloadStatus, DownloadTask};
use crate::download::stream::{self, StreamOutcome};
use crate::error::{AppError, AppResult};
use crate::media::models::MediaFormat;
use crate::media::ProviderRegistry;

pub const DOWNLOAD_EVENT: &str = "download://task";

const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(120);
const MAX_FILENAME_CHARS: usize = 120;
const USER_AGENT: &str = "SyncBit";

/// Owns download tasks. The UI talks to this engine only through commands;
/// providers resolve authorized stream URLs and the engine never touches the
/// provider's internals.
#[derive(Clone)]
pub struct DownloadManager {
    inner: Arc<Mutex<HashMap<String, Entry>>>,
    http: Client,
    registry: Arc<ProviderRegistry>,
}

struct Entry {
    task: DownloadTask,
    cancel: Arc<AtomicBool>,
    last_progress_at: Instant,
    last_progress_bytes: u64,
}

impl DownloadManager {
    pub fn new(registry: Arc<ProviderRegistry>) -> Self {
        let http = Client::builder()
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .expect("failed to build download HTTP client");
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            http,
            registry,
        }
    }

    pub fn create_task(&self, source_url: String, title: String) -> AppResult<DownloadTask> {
        crate::media::validate_media_url(&source_url)?;
        let task = DownloadTask {
            id: new_task_id(),
            source_url,
            title,
            format: None,
            status: DownloadStatus::Pending,
            progress: None,
            downloaded_bytes: None,
            total_bytes: None,
            speed_bytes_per_second: None,
            eta_seconds: None,
            output_path: None,
            error: None,
        };
        self.inner.lock().unwrap().insert(
            task.id.clone(),
            Entry {
                task: task.clone(),
                cancel: Arc::new(AtomicBool::new(false)),
                last_progress_at: Instant::now(),
                last_progress_bytes: 0,
            },
        );
        Ok(task)
    }

    pub fn select_format(&self, task_id: &str, format: MediaFormat) -> AppResult<DownloadTask> {
        if format.id.is_empty() {
            return Err(AppError::Download(
                "selected format has no id".to_string(),
            ));
        }
        let mut guard = self.inner.lock().unwrap();
        let entry = guard
            .get_mut(task_id)
            .ok_or_else(|| AppError::NotFound(task_id.to_string()))?;
        if entry.task.status != DownloadStatus::Pending {
            return Err(AppError::Download(
                "format can only be selected while the task is pending".to_string(),
            ));
        }
        entry.task.format = Some(format);
        Ok(entry.task.clone())
    }

    pub fn get_task(&self, task_id: &str) -> AppResult<DownloadTask> {
        self.inner
            .lock()
            .unwrap()
            .get(task_id)
            .map(|entry| entry.task.clone())
            .ok_or_else(|| AppError::NotFound(task_id.to_string()))
    }

    /// Resolves an authorized stream URL through the provider, then spawns the
    /// download. Returns the task in `Downloading` state.
    pub async fn start(&self, app: &AppHandle, task_id: &str) -> AppResult<DownloadTask> {
        let (source_url, format_id, title, extension) = {
            let mut guard = self.inner.lock().unwrap();
            let entry = guard
                .get_mut(task_id)
                .ok_or_else(|| AppError::NotFound(task_id.to_string()))?;
            if entry.task.status != DownloadStatus::Pending {
                return Err(AppError::Download(
                    "task can only be started while pending".to_string(),
                ));
            }
            let format = entry.task.format.as_ref().ok_or_else(|| {
                AppError::Download("no format selected for this task".to_string())
            })?;
            (
                entry.task.source_url.clone(),
                format.id.clone(),
                entry.task.title.clone(),
                format.extension.clone(),
            )
        };

        let stream_url = self
            .registry
            .resolve_download_url(&source_url, &format_id)
            .await?;

        let downloads_dir = resolve_downloads_dir(app)?;
        let final_path = downloads_dir.join(build_filename(&title, &extension));
        let partial_path = append_suffix(&final_path, ".part");

        {
            let mut guard = self.inner.lock().unwrap();
            let entry = guard
                .get_mut(task_id)
                .ok_or_else(|| AppError::NotFound(task_id.to_string()))?;
            entry.cancel.store(false, Ordering::Relaxed);
            entry.last_progress_at = Instant::now();
            entry.last_progress_bytes = 0;
            entry.task.status = DownloadStatus::Downloading;
            entry.task.progress = None;
            entry.task.downloaded_bytes = Some(0);
            entry.task.total_bytes = None;
            entry.task.speed_bytes_per_second = None;
            entry.task.eta_seconds = None;
            entry.task.output_path = Some(final_path.display().to_string());
            entry.task.error = None;
            let task = entry.task.clone();
            drop(guard);
            self.emit(app, &task);
        }

        let manager = self.clone();
        let app = app.clone();
        let spawned_task_id = task_id.to_string();
        tauri::async_runtime::spawn(async move {
            manager
                .run_download(app, spawned_task_id, stream_url, partial_path, final_path)
                .await;
        });

        self.get_task(&task_id)
    }

    pub fn cancel(&self, app: &AppHandle, task_id: &str) -> AppResult<DownloadTask> {
        let mut guard = self.inner.lock().unwrap();
        let entry = guard
            .get_mut(task_id)
            .ok_or_else(|| AppError::NotFound(task_id.to_string()))?;
        if matches!(
            entry.task.status,
            DownloadStatus::Pending | DownloadStatus::Downloading
        ) {
            entry.cancel.store(true, Ordering::Relaxed);
            entry.task.status = DownloadStatus::Cancelled;
            entry.task.speed_bytes_per_second = None;
            entry.task.eta_seconds = None;
            entry.task.error = None;
            let task = entry.task.clone();
            drop(guard);
            self.emit(app, &task);
            Ok(task)
        } else {
            Ok(entry.task.clone())
        }
    }

    /// Removes the task from the engine. A partial file is deleted best-effort;
    /// a completed output file is left in place.
    pub fn cleanup(&self, task_id: &str) -> AppResult<()> {
        let removed = self.inner.lock().unwrap().remove(task_id);
        let Some(entry) = removed else {
            return Err(AppError::NotFound(task_id.to_string()));
        };
        entry.cancel.store(true, Ordering::Relaxed);
        if let Some(output_path) = entry.task.output_path.as_ref() {
            let _ = fs::remove_file(append_suffix(&PathBuf::from(output_path), ".part"));
        }
        Ok(())
    }

    async fn run_download(
        &self,
        app: AppHandle,
        task_id: String,
        stream_url: String,
        partial_path: PathBuf,
        final_path: PathBuf,
    ) {
        let cancel = self
            .inner
            .lock()
            .unwrap()
            .get(&task_id)
            .map(|entry| entry.cancel.clone());
        let Some(cancel) = cancel else {
            return;
        };

        let outcome = stream::download_to_file(
            &self.http,
            &cancel,
            &stream_url,
            &partial_path,
            |downloaded, total| self.update_progress(&app, &task_id, downloaded, total),
        )
        .await;

        if !self.inner.lock().unwrap().contains_key(&task_id) {
            let _ = fs::remove_file(&partial_path);
            return;
        }

        match outcome {
            Ok(StreamOutcome { cancelled: true, .. }) => {
                let _ = fs::remove_file(&partial_path);
                self.set_terminal(&app, &task_id, DownloadStatus::Cancelled, None, None);
            }
            Ok(_) => match fs::rename(&partial_path, &final_path) {
                Ok(()) => self.set_terminal(
                    &app,
                    &task_id,
                    DownloadStatus::Completed,
                    Some(final_path.display().to_string()),
                    None,
                ),
                Err(error) => {
                    let _ = fs::remove_file(&partial_path);
                    self.set_terminal(
                        &app,
                        &task_id,
                        DownloadStatus::Failed,
                        None,
                        Some(error_info(&AppError::Download(format!(
                            "could not move the downloaded file into place: {error}"
                        )))),
                    );
                }
            },
            Err(error) => {
                let _ = fs::remove_file(&partial_path);
                self.set_terminal(&app, &task_id, DownloadStatus::Failed, None, Some(error_info(&error)));
            }
        }
    }

    fn update_progress(&self, app: &AppHandle, task_id: &str, downloaded: u64, total: Option<u64>) {
        let now = Instant::now();
        let mut guard = self.inner.lock().unwrap();
        let Some(entry) = guard.get_mut(task_id) else {
            return;
        };
        let elapsed = now.duration_since(entry.last_progress_at);
        let delta = downloaded.saturating_sub(entry.last_progress_bytes);
        let speed = if elapsed.is_zero() {
            0.0
        } else {
            delta as f64 / elapsed.as_secs_f64()
        };
        let speed_bytes_per_second = (speed > 0.0)
            .then(|| speed.round() as u64)
            .filter(|&speed| speed > 0);

        entry.task.downloaded_bytes = Some(downloaded);
        entry.task.total_bytes = total;
        entry.task.progress = total.map(|total| {
            if total == 0 {
                0.0
            } else {
                (downloaded as f64 / total as f64).min(1.0)
            }
        });
        entry.task.speed_bytes_per_second = speed_bytes_per_second;
        entry.task.eta_seconds = total.and_then(|total| {
            speed_bytes_per_second
                .filter(|&speed| speed > 0)
                .map(|speed| total.saturating_sub(downloaded) / speed)
        });
        entry.last_progress_at = now;
        entry.last_progress_bytes = downloaded;

        if elapsed >= PROGRESS_EMIT_INTERVAL {
            let task = entry.task.clone();
            drop(guard);
            self.emit(app, &task);
        }
    }

    fn set_terminal(
        &self,
        app: &AppHandle,
        task_id: &str,
        status: DownloadStatus,
        output_path: Option<String>,
        error: Option<DownloadErrorInfo>,
    ) {
        let mut guard = self.inner.lock().unwrap();
        let Some(entry) = guard.get_mut(task_id) else {
            return;
        };
        entry.task.status = status;
        if let Some(path) = output_path {
            entry.task.output_path = Some(path);
        }
        entry.task.error = error;
        entry.task.speed_bytes_per_second = None;
        entry.task.eta_seconds = None;
        let task = entry.task.clone();
        drop(guard);
        self.emit(app, &task);
    }

    fn emit(&self, app: &AppHandle, task: &DownloadTask) {
        let _ = app.emit(DOWNLOAD_EVENT, task);
    }
}

fn new_task_id() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{nanos}-{}", COUNTER.fetch_add(1, Ordering::Relaxed))
}

fn resolve_downloads_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .download_dir()
        .ok()
        .or_else(|| app.path().app_data_dir().ok().map(|path| path.join("downloads")))
        .ok_or_else(|| AppError::Internal("could not resolve a downloads directory".into()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn build_filename(title: &str, extension: &str) -> String {
    let extension = if extension.is_empty() { "mp4" } else { extension };
    format!("{}.{extension}", sanitize_filename(title))
}

fn sanitize_filename(title: &str) -> String {
    const INVALID_CHARS: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut name = String::with_capacity(title.len().min(MAX_FILENAME_CHARS));
    for ch in title.trim().chars() {
        if name.len() >= MAX_FILENAME_CHARS {
            break;
        }
        if ch.is_control() || INVALID_CHARS.contains(&ch) {
            name.push('_');
        } else {
            name.push(ch);
        }
    }
    let name = name
        .trim_matches('.')
        .trim_matches('_')
        .trim()
        .to_string();
    if name.is_empty() {
        "download".to_string()
    } else {
        name
    }
}

fn append_suffix(path: &std::path::Path, suffix: &str) -> PathBuf {
    let mut os = path.as_os_str().to_owned();
    os.push(suffix);
    PathBuf::from(os)
}

fn error_info(error: &AppError) -> DownloadErrorInfo {
    DownloadErrorInfo {
        code: error.code().to_string(),
        message: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::models::MediaFormat;
    use crate::media::ProviderRegistry;

    fn test_manager() -> DownloadManager {
        DownloadManager::new(Arc::new(ProviderRegistry::new()))
    }

    fn test_format() -> MediaFormat {
        MediaFormat {
            id: "18".to_string(),
            label: "360p · MP4".to_string(),
            quality: "360p".to_string(),
            container: "mp4".to_string(),
            extension: "mp4".to_string(),
            width: Some(640),
            height: Some(360),
            note: None,
        }
    }

    fn create_task(manager: &DownloadManager) -> DownloadTask {
        manager
            .create_task(
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ".to_string(),
                "A test video".to_string(),
            )
            .expect("task creation should succeed")
    }

    #[test]
    fn creates_a_pending_task_with_unique_ids() {
        let manager = test_manager();
        let first = create_task(&manager);
        let second = create_task(&manager);
        assert_eq!(first.status, DownloadStatus::Pending);
        assert_ne!(first.id, second.id);
        assert_eq!(manager.get_task(&first.id).unwrap().id, first.id);
    }

    #[test]
    fn rejects_invalid_source_urls() {
        let manager = test_manager();
        let error = manager
            .create_task("javascript:alert(1)".to_string(), "x".to_string())
            .unwrap_err();
        assert_eq!(error.code(), "unsupported_url");
    }

    #[test]
    fn selects_a_format_only_while_pending() {
        let manager = test_manager();
        let task = create_task(&manager);
        let updated = manager.select_format(&task.id, test_format()).unwrap();
        assert_eq!(updated.format.as_ref().unwrap().id, "18");
        assert!(manager.select_format(&task.id, test_format()).is_ok());
    }

    #[test]
    fn rejects_empty_format_ids() {
        let manager = test_manager();
        let task = create_task(&manager);
        let format = MediaFormat {
            id: String::new(),
            ..test_format()
        };
        let error = manager.select_format(&task.id, format).unwrap_err();
        assert_eq!(error.code(), "download_error");
    }

    #[test]
    fn missing_tasks_are_reported_as_not_found() {
        let manager = test_manager();
        assert_eq!(manager.get_task("missing").unwrap_err().code(), "not_found");
        assert_eq!(manager.cleanup("missing").unwrap_err().code(), "not_found");
    }

    #[test]
    fn sanitizes_unsafe_filename_characters() {
        assert_eq!(sanitize_filename("A/B:C*D?"), "A_B_C_D");
        assert_eq!(sanitize_filename("  ..  "), "download", "fallback name for empty titles");
        assert_eq!(sanitize_filename("Rock & Roll (Live)"), "Rock & Roll (Live)");
    }

    #[test]
    fn builds_filename_with_extension() {
        assert_eq!(build_filename("Hello World", "mp4"), "Hello World.mp4");
        assert_eq!(build_filename("Hello World", ""), "Hello World.mp4");
    }

    #[test]
    fn caps_filename_length() {
        let long = "x".repeat(500);
        assert!(sanitize_filename(&long).len() <= MAX_FILENAME_CHARS);
    }
}