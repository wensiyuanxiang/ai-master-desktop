use serde::ser::SerializeStruct;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("Encryption error: {0}")]
    Encryption(String),
    #[error("Not found: {0}")]
    NotFound(String),
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Config file error: {0}")]
    ConfigFile(String),
    #[error("HTTP request error: {0}")]
    HttpRequest(String),
    #[error("Stream error: {0}")]
    Stream(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", &self.code())?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

impl AppError {
    fn code(&self) -> &str {
        match self {
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::Encryption(_) => "ENCRYPTION_ERROR",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::Io(_) => "IO_ERROR",
            AppError::Serialization(_) => "SERIALIZATION_ERROR",
            AppError::ConfigFile(_) => "CONFIG_FILE_ERROR",
            AppError::HttpRequest(_) => "HTTP_REQUEST_ERROR",
            AppError::Stream(_) => "STREAM_ERROR",
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
