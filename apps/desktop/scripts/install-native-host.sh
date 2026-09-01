#!/usr/bin/env bash
# Register the Companion native-messaging host with Chrome/Firefox on macOS.
#
# Usage:
#   apps/desktop/scripts/install-native-host.sh <EXTENSION_ID> [channel]
#
#   EXTENSION_ID is the chrome-extension://<id> the browser loads the unpacked
#   build under (shown at chrome://extensions). It must match the allowlist the
#   manifest below writes, otherwise Chrome refuses to launch the host.
#
#   channel default "chrome"; pass "firefox" to target Firefox.
set -euo pipefail

EXT_ID="${1:?usage: install-native-host.sh <EXTENSION_ID> [channel]}"
CHANNEL="${2:-chrome}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# 1. Build the host into a standalone bundled mjs.
npm --prefix "$ROOT/apps/desktop" run build:host

# 2. Install location readable by the browser but not user-writable in a risky
#    spot (spike finding: TCC blocks ~/Documents; use ~/Library).
INSTALL_DIR="$HOME/Library/Application Support/Companion"
mkdir -p "$INSTALL_DIR"
HOST_PATH="$INSTALL_DIR/native-host.mjs"
cp "$ROOT/apps/desktop/dist-native/native-host.mjs" "$HOST_PATH"
chmod +x "$HOST_PATH"

# 3. Write the native-messaging host manifest into the browser's lookup dir.
case "$CHANNEL" in
  chrome)
    NM_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
    ;;
  firefox)
    NM_DIR="$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
    ;;
  *)
    echo "unsupported channel: $CHANNEL" >&2
    exit 1
    ;;
esac
mkdir -p "$NM_DIR"

MANIFEST="$NM_DIR/dev.suiflex.companion.json"
cat > "$MANIFEST" <<EOF
{
  "name": "dev.suiflex.companion",
  "description": "Companion vault capture host",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

echo "Host registered."
echo "  manifest: $MANIFEST"
echo "  host:     $HOST_PATH"
echo "  allowlist: chrome-extension://$EXT_ID/"
echo
echo "Then reload the extension at chrome://extensions and refresh the meeting tab."
