pub mod host;
mod install;
mod settings;
mod vault;

use tauri::Manager;

/// Where this install keeps its state when the GUI is not running.
///
/// The host mode starts before Tauri does — it must not open a window — so it
/// cannot ask the app handle for the config dir and resolves it the same way
/// Tauri would instead.
pub fn config_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    #[cfg(target_os = "macos")]
    let base = std::path::PathBuf::from(&home).join("Library/Application Support");
    #[cfg(not(target_os = "macos"))]
    let base = std::env::var("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::path::PathBuf::from(&home).join(".config"));
    base.join("dev.suiflex.companion")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // The frontend asks; the update itself is fetched and verified in Rust
        // against the pubkey in tauri.conf.json, then `process` relaunches.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Provider calls leave through Rust: the WebView's CSP allows
        // `connect-src 'self' ipc:` and nothing else, and the hosts to allow
        // cannot be enumerated because the base URL is typed by the user.
        .plugin(tauri_plugin_http::init());
    // Test-only, compiled out entirely without `--features wdio`.
    #[cfg(feature = "wdio")]
    let builder = builder
        .plugin(tauri_plugin_wdio_webdriver::init())
        .plugin(tauri_plugin_wdio::init());
    builder
        // The root has to be known before the WebView exists, so the remembered
        // choice is read here rather than from the frontend. A stored path
        // whose folder is gone falls back to the default instead of stranding
        // the window on an error.
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let root = vault::startup_root(&config_dir);
            if let Err(e) = vault::ensure_root(&root) {
                eprintln!("could not create the vault at {}: {e}", root.display());
            }
            app.manage(vault::ConfigDir(config_dir));
            app.manage(vault::VaultState::new(root));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault::vault_root,
            vault::set_vault_root,
            vault::reset_vault_root,
            vault::probe_vault_root,
            vault::default_vault_root,
            vault::open_external,
            vault::move_vault_file,
            vault::create_vault_folder,
            vault::list_vault_folders,
            vault::list_vault,
            vault::read_vault_file,
            vault::write_vault_file,
            vault::append_vault_line,
            vault::vault_mtime,
            vault::trash_vault_file,
            settings::load_ai_settings,
            settings::save_ai_settings,
            settings::load_secret,
            settings::save_secret,
            host::take_spool,
            host::drop_spooled,
            install::list_browsers,
            install::register_bridge,
            install::unregister_bridge,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Companion Desktop");
}
