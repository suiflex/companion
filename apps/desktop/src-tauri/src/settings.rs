// AI provider settings for the desktop app.
//
// Two stores, because the two kinds of value deserve different treatment:
//
// - Everything ordinary (provider, model, base URL, retention) is a JSON file
//   in the app config dir, following the same reasoning `vault.rs` records for
//   the vault root — a plain file beats a store plugin for a handful of values.
// - Secrets go to the OS keychain. The extension encrypts its key with AES-GCM
//   and then keeps the key beside the ciphertext in `chrome.storage.local`; its
//   own comment calls that obfuscation. On a desktop there is a real keychain,
//   so copying that weakness here would be a choice, not a constraint.
use keyring::Entry;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

use crate::vault::ConfigDir;

/// Keychain service name. One entry per secret, keyed by the name the frontend
/// asks for (`apiKey`, `oauth`), so revoking one does not disturb the others.
const SERVICE: &str = "dev.suiflex.companion";

pub fn settings_file(config_dir: &Path) -> PathBuf {
    config_dir.join("ai-settings.json")
}

/// Read the non-secret settings blob. Absent or unreadable is not an error:
/// a first launch has no file, and a corrupted one must not stop the app —
/// the frontend's own defaults are a better answer than a dead settings screen.
#[tauri::command]
pub fn load_ai_settings(config: State<'_, ConfigDir>) -> String {
    fs::read_to_string(settings_file(&config.0)).unwrap_or_default()
}

#[tauri::command]
pub fn save_ai_settings(config: State<'_, ConfigDir>, json: String) -> Result<(), String> {
    let path = settings_file(&config.0);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::write(path, json).map_err(|e| e.to_string())
}

fn entry(name: &str) -> Result<Entry, String> {
    // The name is data from the WebView. Keeping it to a known-safe shape stops
    // it from addressing an entry belonging to something else on this machine.
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(format!("bad secret name: {name}"));
    }
    Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

/// A secret, or an empty string when none is stored.
///
/// "Not stored" is an ordinary state, not a failure — the settings screen opens
/// before anything has ever been saved, and a keychain the user has locked or
/// denied us must not read as an error either.
#[tauri::command]
pub fn load_secret(name: String) -> Result<String, String> {
    match entry(&name)?.get_password() {
        Ok(v) => Ok(v),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Store a secret, or delete it when `value` is empty — clearing a field has to
/// clear the keychain too, or the old key outlives the UI that showed it.
#[tauri::command]
pub fn save_secret(name: String, value: String) -> Result<(), String> {
    let entry = entry(&name)?;
    if value.is_empty() {
        return match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    entry.set_password(&value).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_live_beside_the_vault_root_file() {
        let dir = PathBuf::from("/tmp/cfg");
        assert_eq!(settings_file(&dir), dir.join("ai-settings.json"));
    }

    #[test]
    fn a_secret_name_cannot_address_another_app() {
        // The name crosses the IPC boundary from the WebView, so it is data.
        for bad in ["", "../other", "name with space", "name/slash"] {
            assert!(entry(bad).is_err(), "{bad} should be refused");
        }
        assert!(entry("apiKey").is_ok());
        assert!(entry("oauth-google").is_ok());
    }
}
