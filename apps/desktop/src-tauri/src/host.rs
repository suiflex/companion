// The desktop binary as a native-messaging host.
//
// Why the binary and not the Node script it replaces: `companion install` from
// the desktop UI is for people who do not open a terminal, and the shipped
// bundle carries no Node and no host script. Registering the Node host from a
// GUI would succeed visibly and fail invisibly for exactly that person.
//
// What this does NOT do is vault logic. CLAUDE.md's rule stands — note format
// and dedupe live in TypeScript so the host and the app share one
// implementation — so this speaks the framing, writes each batch to a spool
// directory verbatim, and stops. The app drains the spool through the same
// `applyBatch` it already uses.
//
// A delivery arriving while the app is closed therefore waits on disk instead
// of being lost, which the Node host could not do.
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::{fs, time::SystemTime};

/// Chrome's framing caps a message at 64 MB; anything longer is a bug or an
/// attack, and reading it would mean allocating whatever we were told to.
const MAX_MESSAGE: u32 = 64 * 1024 * 1024;

pub fn spool_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("spool")
}

/// Read one native-messaging frame: 4-byte little-endian length, then JSON.
fn read_frame(input: &mut impl Read) -> std::io::Result<Option<Vec<u8>>> {
    let mut header = [0u8; 4];
    match input.read_exact(&mut header) {
        Ok(()) => {}
        // The browser closing the pipe is how this process normally ends.
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_le_bytes(header);
    if len > MAX_MESSAGE {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "frame longer than the protocol allows",
        ));
    }
    let mut body = vec![0u8; len as usize];
    input.read_exact(&mut body)?;
    Ok(Some(body))
}

fn write_frame(out: &mut impl Write, body: &[u8]) -> std::io::Result<()> {
    out.write_all(&(body.len() as u32).to_le_bytes())?;
    out.write_all(body)?;
    out.flush()
}

/// A spool filename that sorts in arrival order and cannot collide.
fn spool_name(seq: u64) -> String {
    let micros = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_micros())
        .unwrap_or(0);
    format!("{micros:020}-{seq:04}.json")
}

/// Handle one message. Returns the JSON reply to frame back.
///
/// `ping` is answered without touching the spool, so testing reachability
/// cannot leave anything behind — the same rule the Node host follows, and the
/// reason a ping to a host that lacked it once wrote a note into a real vault.
fn handle(spool: &Path, seq: u64, body: &[u8]) -> String {
    let text = match std::str::from_utf8(body) {
        Ok(t) => t,
        Err(_) => return r#"{"status":"error","applied":false,"error":"bad-utf8"}"#.into(),
    };
    let parsed: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return r#"{"status":"error","applied":false,"error":"bad-json"}"#.into(),
    };
    if parsed.get("type").and_then(|t| t.as_str()) == Some("ping") {
        return r#"{"status":"ok","pong":true}"#.into();
    }
    if let Err(e) = fs::create_dir_all(spool) {
        return format!(r#"{{"status":"error","applied":false,"error":"{e}"}}"#);
    }
    // Written under a temp name and renamed: the app drains this directory on a
    // timer, and a half-written file would be read as a corrupt batch.
    let name = spool_name(seq);
    let tmp = spool.join(format!("{name}.part"));
    if let Err(e) = fs::write(&tmp, text).and_then(|()| fs::rename(&tmp, spool.join(&name))) {
        return format!(r#"{{"status":"error","applied":false,"error":"{e}"}}"#);
    }
    // "Accepted", not "applied": the note is written when the app next drains
    // the spool, which may be after the browser has gone.
    r#"{"status":"ok","applied":false,"spooled":true}"#.into()
}

/// Run the stdio loop until the browser closes the pipe.
pub fn run(spool: &Path) {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut input = stdin.lock();
    let mut output = stdout.lock();
    let mut seq = 0u64;
    while let Ok(Some(body)) = read_frame(&mut input) {
        let reply = handle(spool, seq, &body);
        seq += 1;
        if write_frame(&mut output, reply.as_bytes()).is_err() {
            return;
        }
    }
}

/// The spooled batches, oldest first, as raw JSON.
///
/// The app applies them with the TypeScript `applyBatch` it already uses, so
/// nothing here parses a batch or knows what a note is.
#[tauri::command]
pub fn take_spool(config: tauri::State<'_, crate::vault::ConfigDir>) -> Vec<SpooledBatch> {
    let dir = spool_dir(&config.0);
    let mut names: Vec<String> = match fs::read_dir(&dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            // `.part` files are mid-write: reading one gives a truncated batch.
            .filter(|n| n.ends_with(".json"))
            .collect(),
        Err(_) => return Vec::new(),
    };
    names.sort();
    names
        .into_iter()
        .filter_map(|name| {
            fs::read_to_string(dir.join(&name))
                .ok()
                .map(|json| SpooledBatch { name, json })
        })
        .collect()
}

/// A spool filename this process wrote, and nothing else.
///
/// The name makes the round trip through the WebView before it comes back to
/// be deleted, so it is data by the time we see it again.
fn is_spool_name(name: &str) -> bool {
    !name.is_empty()
        && name.ends_with(".json")
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
        && !name.contains("..")
}

/// Drop a batch the app has applied. Named individually rather than clearing
/// the directory: a delivery arriving mid-drain must not be swept away unread.
#[tauri::command]
pub fn drop_spooled(
    config: tauri::State<'_, crate::vault::ConfigDir>,
    name: String,
) -> Result<(), String> {
    if !is_spool_name(&name) {
        return Err(format!("bad spool name: {name}"));
    }
    match fs::remove_file(spool_dir(&config.0).join(name)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[derive(serde::Serialize)]
pub struct SpooledBatch {
    pub name: String,
    pub json: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("companion-host-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn frame(json: &str) -> Vec<u8> {
        let mut out = (json.len() as u32).to_le_bytes().to_vec();
        out.extend_from_slice(json.as_bytes());
        out
    }

    #[test]
    fn reads_two_batches_delivered_in_one_write() {
        // Chrome coalesces messages, so the framing has to carry the split.
        let dir = tmpdir("two");
        let mut bytes = frame(r#"{"operationId":"a","roomId":"meet/x"}"#);
        bytes.extend(frame(r#"{"operationId":"b","roomId":"meet/x"}"#));
        let mut cursor = std::io::Cursor::new(bytes);
        let mut seen = 0;
        while let Ok(Some(body)) = read_frame(&mut cursor) {
            handle(&dir, seen, &body);
            seen += 1;
        }
        assert_eq!(seen, 2);
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
    }

    #[test]
    fn a_ping_writes_nothing() {
        // A ping to a host that lacked this branch once fell through to the
        // vault writer and left a note behind in a real vault.
        let dir = tmpdir("ping");
        let reply = handle(&dir, 0, br#"{"type":"ping"}"#);
        assert!(reply.contains("pong"));
        assert!(!dir.join("spool").exists());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
    }

    #[test]
    fn malformed_input_is_answered_not_spooled() {
        let dir = tmpdir("bad");
        assert!(handle(&dir, 0, b"not json").contains("bad-json"));
        assert!(handle(&dir, 1, &[0xff, 0xfe]).contains("bad-utf8"));
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
    }

    #[test]
    fn refuses_a_frame_longer_than_the_protocol_allows() {
        // The length is attacker-controlled; believing it means allocating it.
        let mut bytes = (MAX_MESSAGE + 1).to_le_bytes().to_vec();
        bytes.extend_from_slice(b"{}");
        let mut cursor = std::io::Cursor::new(bytes);
        assert!(read_frame(&mut cursor).is_err());
    }

    #[test]
    fn a_spool_name_cannot_address_another_file() {
        for bad in [
            "",
            "../vault-root",
            "sub/dir.json",
            "..\\vault-root.json",
            "vault-root",
        ] {
            assert!(!is_spool_name(bad), "{bad} should be refused");
        }
        assert!(is_spool_name(&spool_name(0)));
    }

    #[test]
    fn spool_names_sort_in_arrival_order() {
        let names: Vec<String> = (0..5).map(spool_name).collect();
        let mut sorted = names.clone();
        sorted.sort();
        assert_eq!(names, sorted);
    }

    #[test]
    fn a_reply_frame_carries_its_own_length() {
        let mut out: Vec<u8> = Vec::new();
        write_frame(&mut out, br#"{"status":"ok"}"#).unwrap();
        assert_eq!(u32::from_le_bytes(out[..4].try_into().unwrap()), 15);
        assert_eq!(&out[4..], br#"{"status":"ok"}"#);
    }
}
