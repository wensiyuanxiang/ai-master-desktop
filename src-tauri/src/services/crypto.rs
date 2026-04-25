use crate::error::{AppError, AppResult};
use argon2::Argon2;
use tauri::Manager;

const SALT: &[u8] = b"ai-master-desktop-salt-2026";
const NONCE_SIZE: usize = 12;
const TAG_SIZE: usize = 16;

pub fn derive_key(app_handle: &tauri::AppHandle) -> AppResult<[u8; 32]> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Encryption(e.to_string()))?
        .to_string_lossy()
        .to_string();

    let os_family = std::env::consts::OS;
    let material = format!("{}:{}", os_family, app_dir);

    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(material.as_bytes(), SALT, &mut key)
        .map_err(|e| AppError::Encryption(e.to_string()))?;

    Ok(key)
}

pub fn encrypt(plaintext: &str, key: &[u8; 32]) -> AppResult<String> {
    use aes_gcm::aead::{Aead, OsRng};
    use aes_gcm::{AeadCore, Aes256Gcm, KeyInit};

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::Encryption(e.to_string()))?;

    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| AppError::Encryption(e.to_string()))?;

    let mut combined = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
    combined.extend_from_slice(&nonce);
    combined.extend_from_slice(&ciphertext);

    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        &combined,
    ))
}

pub fn decrypt(ciphertext_b64: &str, key: &[u8; 32]) -> AppResult<String> {
    use aes_gcm::aead::Aead;
    use aes_gcm::{Aes256Gcm, KeyInit};

    let combined = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        ciphertext_b64,
    )
    .map_err(|e| AppError::Encryption(e.to_string()))?;

    if combined.len() < NONCE_SIZE + TAG_SIZE {
        return Err(AppError::Encryption("Ciphertext too short".to_string()));
    }

    let (nonce, ciphertext) = combined.split_at(NONCE_SIZE);

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| AppError::Encryption(e.to_string()))?;

    let plaintext = cipher
        .decrypt(nonce.into(), ciphertext)
        .map_err(|e| AppError::Encryption(format!("Decryption failed: {}", e)))?;

    String::from_utf8(plaintext).map_err(|e| AppError::Encryption(e.to_string()))
}
