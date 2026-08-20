use url::Url;

use crate::error::{AppError, AppResult};

use super::super::models::{MediaFormat, MediaMetadata, MediaProviderId};
use super::super::MediaProvider;

const YOUTUBE_HOSTS: &[&str] = &[
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "music.youtube.com",
    "youtube-nocookie.com",
];

const WATCH_URL: &str = "https://www.youtube.com/watch";

const PLAYER_RESPONSE_MARKER: &str = "ytInitialPlayerResponse";

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const MAX_RESPONSE_BYTES: u64 = 8 * 1024 * 1024;

pub struct YouTubeProvider {
    http: reqwest::Client,
}

impl YouTubeProvider {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .expect("failed to build HTTP client");
        Self { http }
    }

    async fn fetch_watch_metadata(&self, video_id: &str) -> AppResult<MediaMetadata> {
        let response = self
            .http
            .get(format!("{WATCH_URL}?v={video_id}"))
            .header("Accept", "text/html,application/xhtml+xml")
            .header("Accept-Language", "en-US,en;q=0.9")
            .send()
            .await
            .map_err(|error| AppError::Metadata(format!("network request failed: {error}")))?;

        if let Some(length) = response.content_length() {
            if length > MAX_RESPONSE_BYTES {
                return Err(AppError::Metadata("response exceeds size limit".into()));
            }
        }
        let status = response.status();
        if !status.is_success() {
            return Err(AppError::Metadata(format!("YouTube returned HTTP {status}")));
        }
        let body = response
            .text()
            .await
            .map_err(|error| AppError::Metadata(format!("failed to read response: {error}")))?;

        let player = parse_player_response(&body).ok_or_else(|| {
            AppError::UnauthorizedContent("video metadata is not publicly available".into())
        })?;

        if !player.is_publicly_playable() {
            return Err(AppError::UnauthorizedContent(
                player
                    .playability_status
                    .and_then(|status| status.reason)
                    .unwrap_or_else(|| "video is not publicly playable".into()),
            ));
        }

        let details = player.video_details.ok_or_else(|| {
            AppError::Metadata("player response is missing video details".into())
        })?;

        let id = details.video_id.clone();
        let title = details.title.clone();
        let duration_seconds = details
            .length_seconds
            .as_deref()
            .and_then(|value| value.parse::<u64>().ok());
        let uploader = details
            .owner_channel_name
            .clone()
            .or_else(|| details.author.clone());
        let uploader_url = details.channel_id.as_ref().map(|channel_id| {
            format!("https://www.youtube.com/channel/{channel_id}")
        });
        let thumbnail = details
            .thumbnail
            .as_ref()
            .and_then(|thumbnail| thumbnail.thumbnails.last())
            .map(|item| item.url.clone())
            .or_else(|| Some(format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg")));

        let formats = player
            .streaming_data
            .as_ref()
            .map(|data| build_authorized_formats(&data.formats))
            .unwrap_or_default();

        Ok(MediaMetadata {
            provider: MediaProviderId::YouTube,
            id: id.clone(),
            source_url: format!("{WATCH_URL}?v={id}"),
            title,
            thumbnail,
            duration_seconds,
            uploader,
            uploader_url,
            formats,
        })
    }
}

impl Default for YouTubeProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl MediaProvider for YouTubeProvider {
    fn supported_hosts(&self) -> &'static [&'static str] {
        YOUTUBE_HOSTS
    }

    fn can_handle(&self, url: &Url) -> bool {
        url.host_str().is_some_and(|host| {
            YOUTUBE_HOSTS.contains(&host.to_ascii_lowercase().as_str())
        })
    }

    fn fetch_metadata(
        &self,
        url: Url,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = AppResult<MediaMetadata>> + Send + '_>,
    > {
        Box::pin(async move {
            let video_id = extract_video_id(&url).ok_or_else(|| {
                AppError::UnsupportedUrl("not a valid YouTube video URL".into())
            })?;
            self.fetch_watch_metadata(&video_id).await
        })
    }
}

fn extract_video_id(url: &Url) -> Option<String> {
    let host = url.host_str()?.to_ascii_lowercase();
    let path = url.path();
    if host == "youtu.be" {
        let rest = path
            .strip_prefix('/')
            .filter(|rest| !rest.contains('/') && !rest.is_empty())?;
        return is_valid_video_id(rest).then(|| rest.to_string());
    }
    if !YOUTUBE_HOSTS.contains(&host.as_str()) {
        return None;
    }
    let segments: Vec<&str> = path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    match segments.as_slice() {
        ["watch"] => url
            .query_pairs()
            .find(|(key, _)| key.as_ref() == "v")
            .and_then(|(_, value)| is_valid_video_id(&value).then(|| value.into_owned())),
        [kind, id] if matches!(*kind, "shorts" | "live" | "embed" | "v") => {
            is_valid_video_id(id).then(|| id.to_string())
        }
        _ => None,
    }
}

fn is_valid_video_id(id: &str) -> bool {
    id.len() == 11
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

#[derive(Debug, serde::Deserialize)]
struct PlayerResponse {
    #[serde(rename = "playabilityStatus")]
    playability_status: Option<PlayabilityStatus>,
    #[serde(rename = "videoDetails")]
    video_details: Option<VideoDetails>,
    #[serde(rename = "streamingData")]
    streaming_data: Option<StreamingData>,
}

impl PlayerResponse {
    fn is_publicly_playable(&self) -> bool {
        matches!(
            self.playability_status
                .as_ref()
                .and_then(|status| status.status.as_deref()),
            Some("OK")
        )
    }
}

#[derive(Debug, serde::Deserialize)]
struct PlayabilityStatus {
    status: Option<String>,
    reason: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct VideoDetails {
    #[serde(rename = "videoId")]
    video_id: String,
    title: String,
    #[serde(rename = "lengthSeconds")]
    length_seconds: Option<String>,
    author: Option<String>,
    #[serde(rename = "channelId")]
    channel_id: Option<String>,
    #[serde(rename = "ownerChannelName")]
    owner_channel_name: Option<String>,
    thumbnail: Option<Thumbnail>,
}

#[derive(Debug, serde::Deserialize)]
struct Thumbnail {
    thumbnails: Vec<ThumbnailItem>,
}

#[derive(Debug, serde::Deserialize)]
struct ThumbnailItem {
    url: String,
}

#[derive(Debug, serde::Deserialize)]
struct StreamingData {
    formats: Vec<StreamFormat>,
}

#[derive(Debug, serde::Deserialize)]
struct StreamFormat {
    itag: Option<u32>,
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    #[serde(rename = "qualityLabel")]
    quality_label: Option<String>,
    fps: Option<u32>,
}

fn parse_player_response(body: &str) -> Option<PlayerResponse> {
    let start = body.find(PLAYER_RESPONSE_MARKER)? + PLAYER_RESPONSE_MARKER.len();
    let start = body[start..].find('{')? + start;
    let end = find_matching_brace(body, start)?;
    serde_json::from_str::<PlayerResponse>(&body[start..=end]).ok()
}

fn find_matching_brace(body: &str, start: usize) -> Option<usize> {
    let bytes = body.as_bytes();
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (index, &byte) in bytes.iter().enumerate().skip(start) {
        if in_string {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                in_string = false;
            }
        } else {
            match byte {
                b'{' => depth += 1,
                b'}' => {
                    depth = depth.saturating_sub(1);
                    if depth == 0 {
                        return Some(index);
                    }
                }
                b'"' => in_string = true,
                _ => {}
            }
        }
    }
    None
}

fn build_authorized_formats(formats: &[StreamFormat]) -> Vec<MediaFormat> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for format in formats {
        let Some(itag) = format.itag else {
            continue;
        };
        if !seen.insert(itag) {
            continue;
        }
        let Some(mime_type) = format.mime_type.as_deref() else {
            continue;
        };
        let Some(container) = mime_container(mime_type) else {
            continue;
        };
        if !matches!(container, "mp4" | "webm") {
            continue;
        }
        let Some(height) = format.height else {
            continue;
        };
        let quality = format
            .quality_label
            .clone()
            .unwrap_or_else(|| format!("{height}p"));
        let note = format.fps.map(|fps| format!("{fps} fps"));
        result.push(MediaFormat {
            id: itag.to_string(),
            label: format!("{} · {}", quality, container.to_uppercase()),
            quality,
            container: container.to_string(),
            extension: container.to_string(),
            width: format.width,
            height: Some(height),
            note,
        });
    }
    result
}

fn mime_container(mime_type: &str) -> Option<&str> {
    let kind = mime_type.split(';').next()?;
    let mut parts = kind.split('/');
    if parts.next()? == "video" {
        parts.next()
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_watch_url_video_id() {
        let url = Url::parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ").unwrap();
        assert_eq!(extract_video_id(&url).as_deref(), Some("dQw4w9WgXcQ"));
    }

    #[test]
    fn extracts_video_id_with_tracking_params() {
        let url =
            Url::parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc123&t=42").unwrap();
        assert_eq!(extract_video_id(&url).as_deref(), Some("dQw4w9WgXcQ"));
    }

    #[test]
    fn extracts_short_url_video_id() {
        let url = Url::parse("https://youtu.be/dQw4w9WgXcQ").unwrap();
        assert_eq!(extract_video_id(&url).as_deref(), Some("dQw4w9WgXcQ"));
    }

    #[test]
    fn extracts_shorts_live_embed_and_v_paths() {
        for kind in ["shorts", "live", "embed", "v"] {
            let url = Url::parse(&format!("https://www.youtube.com/{kind}/dQw4w9WgXcQ")).unwrap();
            assert_eq!(
                extract_video_id(&url).as_deref(),
                Some("dQw4w9WgXcQ"),
                "kind: {kind}"
            );
        }
    }

    #[test]
    fn extracts_mobile_and_music_hosts() {
        let url = Url::parse("https://m.youtube.com/watch?v=dQw4w9WgXcQ").unwrap();
        assert_eq!(extract_video_id(&url).as_deref(), Some("dQw4w9WgXcQ"));
        let url = Url::parse("https://music.youtube.com/watch?v=dQw4w9WgXcQ").unwrap();
        assert_eq!(extract_video_id(&url).as_deref(), Some("dQw4w9WgXcQ"));
    }

    #[test]
    fn rejects_non_video_urls() {
        for raw in [
            "https://www.youtube.com/",
            "https://www.youtube.com/@somechannel",
            "https://www.youtube.com/playlist?list=PL1234567890",
            "https://youtu.be/",
            "https://youtu.be/too/short",
        ] {
            let url = Url::parse(raw).unwrap();
            assert_eq!(extract_video_id(&url), None, "raw: {raw}");
        }
    }

    #[test]
    fn rejects_invalid_video_ids() {
        let url = Url::parse("https://www.youtube.com/watch?v=not-a-real-id!").unwrap();
        assert_eq!(extract_video_id(&url), None);
        let url = Url::parse("https://www.youtube.com/watch?v=tooshort").unwrap();
        assert_eq!(extract_video_id(&url), None);
    }

    #[test]
    fn parses_player_response_from_html() {
        let html = r#"<!doctype html><html><script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"OK"},"videoDetails":{"videoId":"dQw4w9WgXcQ","title":"Never Gonna Give You Up","lengthSeconds":"213","author":"Rick Astley","channelId":"UCuAXFkgsw1L7xaCfnd5JJOw","ownerChannelName":"Rick Astley","thumbnail":{"thumbnails":[{"url":"https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"}]}},"streamingData":{"formats":[{"itag":18,"mimeType":"video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"","width":640,"height":360,"qualityLabel":"360p","fps":30}]}};</script></html>"#;
        let player = parse_player_response(html).expect("should parse player response");
        assert!(player.is_publicly_playable());
        let details = player.video_details.expect("video details");
        assert_eq!(details.video_id, "dQw4w9WgXcQ");
        assert_eq!(details.length_seconds.as_deref(), Some("213"));
    }

    #[test]
    fn parses_player_response_containing_script_tag_in_string() {
        let html = r#"<script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"dQw4w9WgXcQ","title":"</script><b>x</b>","lengthSeconds":"10","author":"A"}};</script>"#;
        let player = parse_player_response(html).expect("should parse player response");
        let details = player.video_details.expect("video details");
        assert_eq!(details.title, "</script><b>x</b>");
    }

    #[test]
    fn rejects_unplayable_player_response() {
        let json = r#"{"playabilityStatus":{"status":"LOGIN_REQUIRED","reason":"Sign in to confirm you're not a bot"}}"#;
        let html = format!("<script>var ytInitialPlayerResponse = {json};</script>");
        let player = parse_player_response(&html).expect("should parse player response");
        assert!(!player.is_publicly_playable());
    }

    #[test]
    fn builds_authorized_formats_from_progressive_mp4_and_webm() {
        let formats = vec![
            StreamFormat {
                itag: Some(18),
                mime_type: Some("video/mp4; codecs=\"avc1.42001E, mp4a.40.2\"".into()),
                width: Some(640),
                height: Some(360),
                quality_label: Some("360p".into()),
                fps: Some(30),
            },
            StreamFormat {
                itag: Some(22),
                mime_type: Some("video/mp4; codecs=\"avc1.64001F, mp4a.40.2\"".into()),
                width: Some(1280),
                height: Some(720),
                quality_label: Some("720p".into()),
                fps: Some(30),
            },
            StreamFormat {
                itag: Some(43),
                mime_type: Some("video/webm; codecs=\"vp8.0, vorbis\"".into()),
                width: Some(854),
                height: Some(480),
                quality_label: Some("480p".into()),
                fps: Some(30),
            },
            StreamFormat {
                itag: Some(140),
                mime_type: Some("audio/mp4; codecs=\"mp4a.40.2\"".into()),
                width: None,
                height: None,
                quality_label: Some("audio only".into()),
                fps: None,
            },
        ];
        let result = build_authorized_formats(&formats);
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].id, "18");
        assert_eq!(result[0].quality, "360p");
        assert_eq!(result[0].container, "mp4");
        assert_eq!(result[2].container, "webm");
        assert!(result.iter().all(|format| format.height.is_some()));
    }

    #[test]
    fn deduplicates_formats_by_itag() {
        let formats = vec![
            StreamFormat {
                itag: Some(18),
                mime_type: Some("video/mp4; codecs=\"avc1\"".into()),
                width: Some(640),
                height: Some(360),
                quality_label: Some("360p".into()),
                fps: None,
            },
            StreamFormat {
                itag: Some(18),
                mime_type: Some("video/mp4; codecs=\"avc1\"".into()),
                width: Some(640),
                height: Some(360),
                quality_label: Some("360p".into()),
                fps: None,
            },
        ];
        assert_eq!(build_authorized_formats(&formats).len(), 1);
    }
}