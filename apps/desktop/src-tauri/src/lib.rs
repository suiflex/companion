mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let root = vault::default_root();
    if let Err(e) = vault::ensure_root(&root) {
        eprintln!("could not create the vault at {}: {e}", root.display());
    }
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
        .manage(vault::VaultState::new(root))
        .invoke_handler(tauri::generate_handler![
            vault::vault_root,
            vault::set_vault_root,
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
