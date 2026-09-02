// Thin filesystem backend for the desktop vault.
//
// Deliberately primitives-only: list/read/write/append/trash/mtime. All vault
// logic (note parsing, index, search) lives in @meetcc/vault (TypeScript) which
// the WebView drives through these commands via a VaultIo adapter. This is the
// roadmap §D4 boundary — Rust owns file I/O and IPC, never the AI/retrieval.
use parking_lot::Mutex;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::State;

const TRASH: &str = ".trash";
const TRANSCRIPT: &str = ".transcript";

/// Managed Tauri state holding the vault root directory.
pub struct VaultState {
    pub root: Mutex<PathBuf>,
}

impl VaultState {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root: Mutex::new(root),
        }
    }
}

/// Default vault root: `~/Companion`. Overridable later via a picker.
pub fn default_root() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join("Companion")
}

/// Create the vault skeleton. Called at startup: on a machine that has never
/// run the app, `~/Companion` does not exist, and the first `list_vault` would
/// fail on read_dir and leave the window stuck on an error with no way out.
pub fn ensure_root(root: &Path) -> std::io::Result<()> {
    fs::create_dir_all(root.join(TRANSCRIPT))
}

fn root(state: &VaultState) -> PathBuf {
    state.root.lock().clone()
}

/// Resolve a vault-relative path. Rejects anything that would climb out of the
/// vault: these paths originate in the WebView, which in turn takes them from
/// note frontmatter, so they are data rather than something we control.
fn abs(state: &VaultState, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim_start_matches('/');
    let path = Path::new(rel);
    if path.is_absolute() || path.components().any(|c| c == Component::ParentDir) {
        return Err(format!("path escapes the vault: {rel}"));
    }
    Ok(root(state).join(path))
}

#[tauri::command]
pub fn vault_root(state: State<'_, VaultState>) -> Result<String, String> {
    Ok(root(&state).to_string_lossy().into_owned())
}

#[tauri::command]
pub fn set_vault_root(state: State<'_, VaultState>, path: String) -> Result<(), String> {
    let new_root = PathBuf::from(path);
    ensure_root(&new_root).map_err(|e| e.to_string())?;
    *state.root.lock() = new_root;
    Ok(())
}

/// All `.md` relative paths under the vault, excluding `.trash`/`.transcript`.
#[tauri::command]
pub fn list_vault(state: State<'_, VaultState>) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    walk_md(&root(&state), &root(&state), &mut out)?;
    Ok(out)
}

fn walk_md(root: &Path, dir: &Path, out: &mut Vec<String>) -> Result<(), String> {
    if let Some(n) = dir.file_name().and_then(|n| n.to_str()) {
        if n == TRASH || n == TRANSCRIPT {
            return Ok(());
        }
    }
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            walk_md(root, &path, out)?;
        } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
            let rel = path
                .strip_prefix(root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .into_owned();
            out.push(rel);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn read_vault_file(state: State<'_, VaultState>, rel: String) -> Result<String, String> {
    fs::read_to_string(abs(&state, &rel)?).map_err(|e| e.to_string())
}

/// Atomic write: temp file + rename, so a crash never leaves a partial note.
#[tauri::command]
pub fn write_vault_file(
    state: State<'_, VaultState>,
    rel: String,
    content: String,
) -> Result<(), String> {
    let path = abs(&state, &rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension(format!("{}.tmp", std::process::id()));
    fs::write(&tmp, content).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Append a single line to a file (used for raw transcript sidecars).
#[tauri::command]
pub fn append_vault_line(
    state: State<'_, VaultState>,
    rel: String,
    line: String,
) -> Result<(), String> {
    use std::io::Write;
    let path = abs(&state, &rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(f, "{line}").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_mtime(state: State<'_, VaultState>, rel: String) -> Result<f64, String> {
    fs::metadata(abs(&state, &rel)?)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as f64)
                .unwrap_or(0.0)
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn trash_vault_file(state: State<'_, VaultState>, rel: String) -> Result<(), String> {
    let from = abs(&state, &rel)?;
    let name = from
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("note.md");
    let trash_dir = root(&state).join(TRASH);
    fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    // Notes from different days share a basename; landing on one already in the
    // trash would destroy it, which is what the trash exists to prevent.
    let mut dest = trash_dir.join(name);
    if dest.exists() {
        let stem = name.trim_end_matches(".md");
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        dest = trash_dir.join(format!("{stem}-{stamp}.md"));
    }
    fs::rename(&from, dest).map_err(|e| e.to_string())?;
    Ok(())
}
