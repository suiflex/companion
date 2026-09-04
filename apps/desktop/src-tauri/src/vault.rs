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

/// Where this install keeps its own small state, handed in by `lib.rs` so the
/// vault module never has to know about the Tauri app handle.
pub struct ConfigDir(pub PathBuf);

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

/// Default vault root: `~/Companion`.
pub fn default_root() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join("Companion")
}

/// Where the chosen root is remembered between launches.
///
/// One line of text rather than a store plugin: this is a single path, and a
/// plugin would mean an npm dependency, a crate and a capability entry for it.
pub fn config_file(config_dir: &Path) -> PathBuf {
    config_dir.join("vault-root")
}

/// The root to start with: the remembered one if it still exists, else the
/// default. A stored path whose folder has since been deleted or unmounted
/// must not leave the app pointing at nothing.
pub fn startup_root(config_dir: &Path) -> PathBuf {
    match fs::read_to_string(config_file(config_dir)) {
        Ok(text) => {
            let saved = PathBuf::from(text.trim());
            if !saved.as_os_str().is_empty() && saved.is_dir() {
                saved
            } else {
                default_root()
            }
        }
        Err(_) => default_root(),
    }
}

/// Remember a root, or forget it when `root` is `None` (back to the default).
pub fn remember_root(config_dir: &Path, root: Option<&Path>) -> std::io::Result<()> {
    fs::create_dir_all(config_dir)?;
    match root {
        Some(path) => fs::write(config_file(config_dir), path.to_string_lossy().as_bytes()),
        None => match fs::remove_file(config_file(config_dir)) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            other => other,
        },
    }
}

/// What a folder looks like, without touching it.
///
/// `set_vault_root` used to create `.transcript/` inside whatever was picked
/// *before* the user could confirm, so a mis-click left a directory behind in
/// someone's Documents. This answers the question first; nothing is written.
#[derive(serde::Serialize)]
pub struct RootProbe {
    pub exists: bool,
    pub markdown: usize,
    pub is_vault: bool,
}

/// The default the reset action returns to, so the frontend does not have to
/// reconstruct `~/Companion` and hope it matches.
#[tauri::command]
pub fn default_vault_root() -> String {
    default_root().to_string_lossy().into_owned()
}

#[tauri::command]
pub fn probe_vault_root(path: String) -> RootProbe {
    let dir = PathBuf::from(path);
    if !dir.is_dir() {
        return RootProbe {
            exists: false,
            markdown: 0,
            is_vault: false,
        };
    }
    let mut found = Vec::new();
    let _ = walk_md(&dir, &dir, &mut found);
    RootProbe {
        exists: true,
        markdown: found.len(),
        is_vault: dir.join(TRANSCRIPT).is_dir(),
    }
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

/// Switch to another root and remember it.
///
/// The folder is only prepared once the caller has committed to it — the
/// frontend confirms against `probe_vault_root` first.
#[tauri::command]
pub fn set_vault_root(
    state: State<'_, VaultState>,
    config: State<'_, ConfigDir>,
    path: String,
) -> Result<(), String> {
    let new_root = PathBuf::from(path);
    ensure_root(&new_root).map_err(|e| e.to_string())?;
    remember_root(&config.0, Some(&new_root)).map_err(|e| e.to_string())?;
    *state.root.lock() = new_root;
    Ok(())
}

/// Forget the chosen root and go back to `~/Companion`.
#[tauri::command]
pub fn reset_vault_root(
    state: State<'_, VaultState>,
    config: State<'_, ConfigDir>,
) -> Result<String, String> {
    let root = default_root();
    ensure_root(&root).map_err(|e| e.to_string())?;
    remember_root(&config.0, None).map_err(|e| e.to_string())?;
    *state.root.lock() = root.clone();
    Ok(root.to_string_lossy().into_owned())
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    fn tmp(name: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!("companion-vault-test-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn remembers_a_root_and_reads_it_back() {
        let config = tmp("remember");
        let picked = tmp("remember-target");
        remember_root(&config, Some(&picked)).unwrap();
        assert_eq!(startup_root(&config), picked);
    }

    #[test]
    fn forgetting_returns_to_the_default() {
        let config = tmp("forget");
        let picked = tmp("forget-target");
        remember_root(&config, Some(&picked)).unwrap();
        remember_root(&config, None).unwrap();
        assert_eq!(startup_root(&config), default_root());
        // Forgetting twice is not an error; the file is simply already gone.
        remember_root(&config, None).unwrap();
    }

    #[test]
    fn falls_back_when_the_remembered_folder_is_gone() {
        // A vault on a drive that is no longer mounted must not strand the app
        // on a root it cannot read.
        let config = tmp("missing");
        let picked = tmp("missing-target");
        remember_root(&config, Some(&picked)).unwrap();
        fs::remove_dir_all(&picked).unwrap();
        assert_eq!(startup_root(&config), default_root());
    }

    #[test]
    fn falls_back_on_a_corrupt_or_empty_file() {
        let config = tmp("corrupt");
        fs::create_dir_all(&config).unwrap();
        for junk in ["", "   \n", "\u{0}"] {
            fs::write(config_file(&config), junk).unwrap();
            assert_eq!(startup_root(&config), default_root(), "junk: {junk:?}");
        }
    }

    #[test]
    fn open_external_refuses_anything_that_is_not_a_web_url() {
        // The argument comes from the WebView, which renders note content. On
        // macOS `open` will happily launch a file or an application, so the
        // scheme is the only thing standing between a note and the shell.
        for bad in [
            "file:///etc/passwd",
            "/Applications/Calculator.app",
            "javascript:alert(1)",
            "ftp://example.com",
            "",
        ] {
            assert!(open_external(bad.into()).is_err(), "allowed: {bad}");
        }
    }

    #[test]
    fn probe_reports_a_folder_without_touching_it() {
        let dir = tmp("probe");
        fs::write(dir.join("a.md"), "# one").unwrap();
        fs::write(dir.join("b.md"), "# two").unwrap();
        let probe = probe_vault_root(dir.to_string_lossy().into_owned());
        assert!(probe.exists);
        assert_eq!(probe.markdown, 2);
        assert!(!probe.is_vault);
        // The whole point: nothing was created by looking.
        assert!(!dir.join(TRANSCRIPT).exists());
    }

    #[test]
    fn probe_recognises_an_existing_vault_and_a_missing_folder() {
        let dir = tmp("probe-vault");
        fs::create_dir_all(dir.join(TRANSCRIPT)).unwrap();
        assert!(probe_vault_root(dir.to_string_lossy().into_owned()).is_vault);

        let gone = probe_vault_root(dir.join("nope").to_string_lossy().into_owned());
        assert!(!gone.exists);
        assert_eq!(gone.markdown, 0);
    }
}

/// Hand a URL to the operating system's browser.
///
/// Deliberately not a Tauri plugin: this is one `Command` and a scheme check,
/// and a plugin would mean a crate, a capability entry and a wider surface for
/// the sake of it.
///
/// The scheme check is the point. The argument arrives from the WebView, and
/// the WebView renders note content — without it, a crafted string could reach
/// the shell through `open`/`xdg-open`, which happily launch files and
/// applications, not just web pages.
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(format!("refusing to open a non-web URL: {url}"));
    }
    let launcher = if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else {
        "xdg-open"
    };
    std::process::Command::new(launcher)
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}
