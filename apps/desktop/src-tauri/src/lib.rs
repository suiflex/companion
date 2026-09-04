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
    config_dir_from(
        std::env::var("HOME")
            .ok()
            .or_else(|| std::env::var("USERPROFILE").ok()),
        std::env::var("APPDATA").ok(),
        std::env::var("XDG_CONFIG_HOME").ok(),
    )
}

/// The rule itself, taking its environment so it can be exercised directly.
///
/// It has to agree with Tauri's `app_config_dir()` on every platform, because
/// the GUI reads the spool through that and the host writes it through this.
/// They disagreed on Windows — Tauri uses `%APPDATA%`, this used `~/.config` —
/// which would have spooled deliveries somewhere the app never looks: visible
/// success, invisible failure, the exact thing the host mode exists to avoid.
pub fn config_dir_from(
    home: Option<String>,
    appdata: Option<String>,
    xdg: Option<String>,
) -> std::path::PathBuf {
    let home = std::path::PathBuf::from(home.unwrap_or_else(|| ".".into()));
    let base = if cfg!(target_os = "macos") {
        home.join("Library/Application Support")
    } else if cfg!(target_os = "windows") {
        appdata
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join("AppData/Roaming"))
    } else {
        xdg.map(std::path::PathBuf::from)
            .unwrap_or_else(|| home.join(".config"))
    };
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

#[cfg(test)]
mod tests {
    use super::config_dir_from;

    #[test]
    fn the_config_dir_follows_the_platform_tauri_uses() {
        let dir = config_dir_from(
            Some("/home/x".into()),
            Some("C:/Users/x/AppData/Roaming".into()),
            None,
        );
        let shown = dir.to_string_lossy().into_owned();
        assert!(shown.ends_with("dev.suiflex.companion"), "{shown}");
        if cfg!(target_os = "macos") {
            assert!(
                shown.starts_with("/home/x/Library/Application Support"),
                "{shown}"
            );
        } else if cfg!(target_os = "windows") {
            assert!(shown.starts_with("C:/Users/x/AppData/Roaming"), "{shown}");
        } else {
            assert!(shown.starts_with("/home/x/.config"), "{shown}");
        }
    }

    #[test]
    fn xdg_config_home_wins_where_it_applies() {
        let dir = config_dir_from(Some("/home/x".into()), None, Some("/custom".into()));
        if !cfg!(target_os = "macos") && !cfg!(target_os = "windows") {
            assert_eq!(
                dir,
                std::path::PathBuf::from("/custom/dev.suiflex.companion")
            );
        }
    }
}
