pub mod models;
pub mod providers;

use std::future::Future;
use std::pin::Pin;

use url::Url;

use crate::error::{AppError, AppResult};

use models::MediaMetadata;

pub const MAX_URL_LENGTH: usize = 2048;

pub trait MediaProvider: Send + Sync {
    fn supported_hosts(&self) -> &'static [&'static str];

    fn can_handle(&self, url: &Url) -> bool;

    fn fetch_metadata(
        &self,
        url: Url,
    ) -> Pin<Box<dyn Future<Output = AppResult<MediaMetadata>> + Send + '_>>;
}

pub struct ProviderRegistry {
    providers: Vec<Box<dyn MediaProvider>>,
    supported_hosts: Vec<&'static str>,
}

impl ProviderRegistry {
    pub fn new() -> Self {
        let providers: Vec<Box<dyn MediaProvider>> =
            vec![Box::new(providers::youtube::YouTubeProvider::new())];
        let supported_hosts = providers
            .iter()
            .flat_map(|provider| provider.supported_hosts().iter().copied())
            .collect();
        Self {
            providers,
            supported_hosts,
        }
    }

    fn resolve(&self, url: &Url) -> AppResult<&dyn MediaProvider> {
        let host = url
            .host_str()
            .ok_or_else(|| AppError::InvalidUrl("URL has no host".into()))?;
        self.providers
            .iter()
            .find(|provider| provider.can_handle(url))
            .map(|provider| provider.as_ref())
            .ok_or_else(|| {
                AppError::UnsupportedProvider(format!(
                    "no provider supports host \"{host}\"; supported hosts: {}",
                    self.supported_hosts.join(", ")
                ))
            })
    }

    pub async fn fetch_metadata(&self, raw_url: &str) -> AppResult<MediaMetadata> {
        let url = validate_media_url(raw_url)?;
        let provider = self.resolve(&url)?;
        provider.fetch_metadata(url).await
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::new()
    }
}

pub fn validate_media_url(raw: &str) -> AppResult<Url> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidUrl("URL is empty".into()));
    }
    if trimmed.len() > MAX_URL_LENGTH {
        return Err(AppError::InvalidUrl(format!(
            "URL exceeds {MAX_URL_LENGTH} characters"
        )));
    }
    let url = Url::parse(trimmed)
        .map_err(|_| AppError::InvalidUrl("URL could not be parsed".into()))?;
    match url.scheme() {
        "http" | "https" => {}
        scheme => {
            return Err(AppError::UnsupportedUrl(format!(
                "only http(s) URLs are supported, got \"{scheme}\""
            )))
        }
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(AppError::InvalidUrl(
            "URLs containing embedded credentials are not allowed".into(),
        ));
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_supported_schemes() {
        assert!(validate_media_url("https://example.com/video").is_ok());
        assert!(validate_media_url("http://example.com/video").is_ok());
    }

    #[test]
    fn rejects_unsupported_schemes() {
        assert!(matches!(
            validate_media_url("javascript:alert(1)"),
            Err(AppError::UnsupportedUrl(_))
        ));
        assert!(matches!(
            validate_media_url("file:///etc/passwd"),
            Err(AppError::UnsupportedUrl(_))
        ));
        assert!(matches!(
            validate_media_url("data:text/html,<script>alert(1)</script>"),
            Err(AppError::UnsupportedUrl(_))
        ));
    }

    #[test]
    fn rejects_embedded_credentials() {
        assert!(matches!(
            validate_media_url("https://user:secret@example.com/video"),
            Err(AppError::InvalidUrl(_))
        ));
    }

    #[test]
    fn rejects_unparsable_and_empty_input() {
        assert!(matches!(
            validate_media_url("not a url at all"),
            Err(AppError::InvalidUrl(_))
        ));
        assert!(matches!(validate_media_url("   "), Err(AppError::InvalidUrl(_))));
    }

    #[test]
    fn rejects_oversized_urls() {
        let long = format!("https://example.com/{}", "a".repeat(MAX_URL_LENGTH));
        assert!(matches!(
            validate_media_url(&long),
            Err(AppError::InvalidUrl(_))
        ));
    }
}