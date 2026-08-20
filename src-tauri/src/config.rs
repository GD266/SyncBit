use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    Development,
    Production,
}

impl Environment {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Development => "development",
            Self::Production => "production",
        }
    }
}

const ALLOWED_LOG_LEVELS: &[&str] = &["trace", "debug", "info", "warn", "error"];

#[derive(Debug, Clone)]
pub struct RuntimeConfig {
    pub environment: Environment,
    pub log_level: String,
}

impl RuntimeConfig {
    pub fn from_env() -> AppResult<Self> {
        let environment = match std::env::var("SYNCBIT_ENV").as_deref() {
            Ok("development") => Environment::Development,
            Ok("production") => Environment::Production,
            Ok(other) => {
                return Err(AppError::Config(format!(
                    "SYNCBIT_ENV must be \"development\" or \"production\", got \"{other}\""
                )))
            }
            Err(std::env::VarError::NotPresent) => Environment::Development,
            Err(std::env::VarError::NotUnicode(_)) => {
                return Err(AppError::Config("SYNCBIT_ENV is not valid unicode".into()))
            }
        };

        let log_level = match std::env::var("SYNCBIT_LOG_LEVEL") {
            Ok(value) => {
                if ALLOWED_LOG_LEVELS.contains(&value.as_str()) {
                    value
                } else {
                    return Err(AppError::Config(format!(
                        "SYNCBIT_LOG_LEVEL must be one of {ALLOWED_LOG_LEVELS:?}, got \"{value}\""
                    )));
                }
            }
            Err(std::env::VarError::NotPresent) => "info".to_string(),
            Err(std::env::VarError::NotUnicode(_)) => {
                return Err(AppError::Config("SYNCBIT_LOG_LEVEL is not valid unicode".into()))
            }
        };

        Ok(Self {
            environment,
            log_level,
        })
    }
}
