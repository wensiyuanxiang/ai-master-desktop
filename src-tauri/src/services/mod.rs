pub mod crypto;
pub mod config_file;
pub mod stream_chat;

pub struct AppState {
    pub crypto_key: [u8; 32],
}

impl AppState {
    pub fn new(crypto_key: [u8; 32]) -> Self {
        Self { crypto_key }
    }
}
