use tauri::State;

use crate::error::AppResult;
use crate::media::models::MediaMetadata;
use crate::media::ProviderRegistry;

#[tauri::command]
pub async fn fetch_media_metadata(
    state: State<'_, ProviderRegistry>,
    url: String,
) -> AppResult<MediaMetadata> {
    state.fetch_metadata(&url).await
}