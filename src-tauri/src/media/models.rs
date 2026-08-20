use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaProviderId {
    YouTube,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaMetadata {
    pub provider: MediaProviderId,
    pub id: String,
    pub source_url: String,
    pub title: String,
    pub thumbnail: Option<String>,
    pub duration_seconds: Option<u64>,
    pub uploader: Option<String>,
    pub uploader_url: Option<String>,
    pub formats: Vec<MediaFormat>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFormat {
    pub id: String,
    pub label: String,
    pub quality: String,
    pub container: String,
    pub extension: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub note: Option<String>,
}