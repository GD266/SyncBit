use serde::ser::{Serialize, SerializeStruct, Serializer};

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Io(#[from] std::io::Error),

    #[error("invalid configuration: {0}")]
    Config(String),

    #[error("{0}")]
    Internal(String),

    #[error("invalid URL: {0}")]
    InvalidUrl(String),

    #[error("unsupported URL: {0}")]
    UnsupportedUrl(String),

    #[error("unsupported provider: {0}")]
    UnsupportedProvider(String),

    #[error("content requires authorization: {0}")]
    UnauthorizedContent(String),

    #[error("could not retrieve metadata: {0}")]
    Metadata(String),

    #[error("download failed: {0}")]
    Download(String),

    #[error("selected format is not available: {0}")]
    FormatNotFound(String),

    #[error("download task not found: {0}")]
    NotFound(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Io(_) => "io_error",
            Self::Config(_) => "config_error",
            Self::Internal(_) => "internal_error",
            Self::InvalidUrl(_) => "invalid_url",
            Self::UnsupportedUrl(_) => "unsupported_url",
            Self::UnsupportedProvider(_) => "unsupported_provider",
            Self::UnauthorizedContent(_) => "unauthorized_content",
            Self::Metadata(_) => "metadata_error",
            Self::Download(_) => "download_error",
            Self::FormatNotFound(_) => "format_not_found",
            Self::NotFound(_) => "not_found",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", &self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}