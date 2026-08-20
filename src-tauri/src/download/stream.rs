use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use futures_util::StreamExt;
use reqwest::Client;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy)]
pub struct StreamOutcome {
    pub cancelled: bool,
}

/// Streams a URL to a file, invoking `on_progress(downloaded, total)` after
/// every chunk. Checks the cancellation flag between chunks so a cancel takes
/// effect promptly without leaving a partially written final file.
pub async fn download_to_file(
    client: &Client,
    cancel: &AtomicBool,
    url: &str,
    destination: &Path,
    mut on_progress: impl FnMut(u64, Option<u64>),
) -> AppResult<StreamOutcome> {
    let response = client
        .get(url)
        .header("Accept", "*/*")
        .send()
        .await
        .map_err(|error| AppError::Download(format!("network request failed: {error}")))?;

    let status = response.status();
    if !status.is_success() {
        return Err(AppError::Download(format!("server returned HTTP {status}")));
    }

    let total_bytes = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file = std::fs::File::create(destination)
        .map_err(|error| AppError::Download(format!("could not create file: {error}")))?;
    let mut downloaded_bytes: u64 = 0;

    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::Relaxed) {
            return Ok(StreamOutcome { cancelled: true });
        }
        let bytes = chunk.map_err(|error| AppError::Download(format!("stream error: {error}")))?;
        file.write_all(&bytes)
            .map_err(|error| AppError::Download(format!("write error: {error}")))?;
        downloaded_bytes = downloaded_bytes.saturating_add(bytes.len() as u64);
        on_progress(downloaded_bytes, total_bytes);
    }

    Ok(StreamOutcome { cancelled: false })
}