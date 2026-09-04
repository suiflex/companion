// Registering the bridge from the desktop app.
//
// The same job `companion install` does from a terminal, for the people that
// command was never going to reach. It registers **this binary** in
// `--native-host` mode, so unlike the CLI's Node host there is nothing else to
// have installed first.
//
// It deliberately does not install the extension: that means downloading a
// release, unzipping it and launching a browser with a dedicated profile, and
// a browser someone is already signed into is not ours to restart. The screen
// says what to do instead.
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::{env, fs};

pub const HOST_NAME: &str = "dev.suiflex.companion";

/// The extension id, pinned by the `key` in the extension's manifest. The
/// manifest's `allowed_origins` has to name it exactly or the browser refuses
/// the connection with a message about permissions rather than about ids.
pub const EXTENSION_ID: &str = "pkgpllhlmhhocidmipbokpigndoeiemb";

#[derive(Serialize, Clone)]
pub struct Browser {
    /// Display name.
    pub name: String,
    /// Where its manifest has to go.
    pub manifest_dir: String,
    /// Whether ours is already there.
    pub registered: bool,
}

/// Chromium reads native-messaging manifests out of the user-data-dir it was
/// started with — which is the profile root, not the profile folder inside it.
///
/// Verified rather than assumed for Arc, whose user-data-dir is a subfolder of
/// its application-support directory: after writing the manifest to seven
/// candidate locations, the access time showed only `Arc/User Data` had been
/// read. The others were never opened.
fn candidates(home: &Path) -> Vec<(&'static str, PathBuf)> {
    let app_support = home.join("Library/Application Support");
    if cfg!(target_os = "macos") {
        return vec![
            ("Google Chrome", app_support.join("Google/Chrome")),
            ("Chromium", app_support.join("Chromium")),
            ("Microsoft Edge", app_support.join("Microsoft Edge")),
            (
                "Brave Browser",
                app_support.join("BraveSoftware/Brave-Browser"),
            ),
            ("Arc", app_support.join("Arc/User Data")),
            ("Vivaldi", app_support.join("Vivaldi")),
        ];
    }
    let config = env::var("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home.join(".config"));
    vec![
        ("Google Chrome", config.join("google-chrome")),
        ("Chromium", config.join("chromium")),
        ("Microsoft Edge", config.join("microsoft-edge")),
        ("Brave Browser", config.join("BraveSoftware/Brave-Browser")),
        ("Vivaldi", config.join("vivaldi")),
    ]
}

fn manifest_dir(user_data_dir: &Path) -> PathBuf {
    user_data_dir.join("NativeMessagingHosts")
}

fn home() -> PathBuf {
    PathBuf::from(env::var("HOME").unwrap_or_else(|_| ".".into()))
}

/// The browsers on this machine, and whether the bridge is registered for each.
///
/// Presence is decided by the profile directory existing: a browser that has
/// never been run has nothing to register into, and one that is installed but
/// unused would otherwise be offered and then fail.
#[tauri::command]
pub fn list_browsers() -> Vec<Browser> {
    let home = home();
    candidates(&home)
        .into_iter()
        .filter(|(_, dir)| dir.is_dir())
        .map(|(name, dir)| {
            let manifest = manifest_dir(&dir).join(format!("{HOST_NAME}.json"));
            Browser {
                name: name.to_string(),
                manifest_dir: manifest_dir(&dir).to_string_lossy().into_owned(),
                registered: manifest.is_file(),
            }
        })
        .collect()
}

/// The manifest body. Chromium allowlists an origin; this app registers no
/// Gecko host, because Firefox needs a signed add-on and there is nothing to
/// point a manifest at yet.
fn manifest_json(exe: &str) -> String {
    format!(
        "{{\n  \"name\": \"{HOST_NAME}\",\n  \"description\": \"Companion vault capture host\",\n  \
         \"path\": \"{exe}\",\n  \"type\": \"stdio\",\n  \"args\": [\"--native-host\"],\n  \
         \"allowed_origins\": [\"chrome-extension://{EXTENSION_ID}/\"]\n}}\n"
    )
}

/// Register the bridge for one browser, by its display name.
#[tauri::command]
pub fn register_bridge(browser: String) -> Result<String, String> {
    let home = home();
    let (_, dir) = candidates(&home)
        .into_iter()
        .find(|(name, _)| *name == browser)
        .ok_or_else(|| format!("unknown browser: {browser}"))?;
    // The running binary, resolved now: a manifest pointing at a relative name
    // would be read by a browser that inherits none of this process's context.
    let exe = env::current_exe()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();
    let target = manifest_dir(&dir);
    fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    let path = target.join(format!("{HOST_NAME}.json"));
    fs::write(&path, manifest_json(&exe)).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Remove the registration. Undoing has to be as easy as doing, or trying it
/// is a commitment.
#[tauri::command]
pub fn unregister_bridge(browser: String) -> Result<(), String> {
    let home = home();
    let (_, dir) = candidates(&home)
        .into_iter()
        .find(|(name, _)| *name == browser)
        .ok_or_else(|| format!("unknown browser: {browser}"))?;
    match fs::remove_file(manifest_dir(&dir).join(format!("{HOST_NAME}.json"))) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_manifest_dir_is_the_user_data_dir_not_the_profile() {
        // `Default/` is the profile; Chromium looks one level up from it.
        let dir = manifest_dir(Path::new("/x/Arc/User Data"));
        assert_eq!(dir, PathBuf::from("/x/Arc/User Data/NativeMessagingHosts"));
        assert!(!dir.to_string_lossy().contains("Default"));
    }

    #[test]
    fn arc_is_registered_under_its_user_data_dir() {
        // Arc keeps its profile in a subfolder, so the obvious guess — the
        // application-support directory itself — is wrong, and a manifest
        // written there is never read.
        let dirs = candidates(Path::new("/home/x"));
        if cfg!(target_os = "macos") {
            let arc = dirs.iter().find(|(n, _)| *n == "Arc").expect("Arc missing");
            assert!(arc.1.ends_with("Arc/User Data"), "{:?}", arc.1);
        }
    }

    #[test]
    fn the_manifest_names_the_binary_and_the_host_mode() {
        // Without the `args` entry the browser starts the app normally, which
        // opens a window and never speaks the protocol.
        let json = manifest_json("/Applications/Companion Desktop.app/Contents/MacOS/companion");
        assert!(json.contains("\"args\": [\"--native-host\"]"));
        assert!(json.contains("/Applications/Companion Desktop.app"));
        assert!(json.contains(EXTENSION_ID));
        // It has to parse: a manifest built by string formatting is one typo
        // away from a browser that reports the host as missing.
        let parsed: serde_json::Value = serde_json::from_str(&json).expect("manifest is not JSON");
        assert_eq!(parsed["name"], HOST_NAME);
    }

    #[test]
    fn an_unknown_browser_is_refused() {
        assert!(register_bridge("Netscape".into()).is_err());
        assert!(unregister_bridge("Netscape".into()).is_err());
    }
}
