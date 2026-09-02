mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let root = vault::default_root();
    if let Err(e) = vault::ensure_root(&root) {
        eprintln!("could not create the vault at {}: {e}", root.display());
    }
    tauri::Builder::default()
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
