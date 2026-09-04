mod vault;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // The frontend asks; the update itself is fetched and verified in Rust
        // against the pubkey in tauri.conf.json, then `process` relaunches.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running Companion Desktop");
}
