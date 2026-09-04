// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The browser starts this binary as a native-messaging host: stdio only,
    // no window. Checked before Tauri initialises, because building an app
    // would open one and the browser would see the framing die.
    if std::env::args().any(|a| a == "--native-host") {
        let config = companion_desktop_lib::config_dir();
        companion_desktop_lib::host::run(&companion_desktop_lib::host::spool_dir(&config));
        return;
    }
    companion_desktop_lib::run()
}
