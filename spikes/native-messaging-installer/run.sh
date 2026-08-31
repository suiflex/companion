#!/bin/sh
# End-to-end spike runner: registers the host manifest, starts the receiver,
# launches Chrome for Testing with the fixture extension, prints the report.
# Throwaway — references /tmp scratch paths on purpose.
set -eu
REPO=/Users/badrusshoolehk/Documents/riset/suiflex/extension-meet
SPIKE=$REPO/spikes/native-messaging-installer
CFT="/Users/badrusshoolehk/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
PROFILE=/tmp/meetcc-spike/chrome-profile
NODE_BIN=$(command -v node)

[ -x "$CFT" ] || { echo "Chrome for Testing not found at $CFT"; exit 1; }

# 1. "install" the host into a non-TCC-protected location (~/Documents is blocked, see README)
mkdir -p /tmp/meetcc-spike/installed "$PROFILE/NativeMessagingHosts"
cp "$SPIKE/host/host.cjs" /tmp/meetcc-spike/installed/
cat > /tmp/meetcc-spike/installed/run-host.sh <<EOF
#!/bin/sh
exec "$NODE_BIN" /tmp/meetcc-spike/installed/host.cjs "\$@"
EOF
chmod +x /tmp/meetcc-spike/installed/run-host.sh

# 2. derive the extension ID from the manifest key (SHA256 over DER pubkey, nibbles mapped a..p)
EXT_ID=$(python3 - "$SPIKE/extension/manifest.json" <<'PY'
import base64, hashlib, json, sys
key = json.load(open(sys.argv[1]))["key"]
der = base64.b64decode(key)
print("".join(chr(97 + n) for b in hashlib.sha256(der).digest()[:16] for n in (b >> 4, b & 0xF)))
PY
)
echo "extension ID (derived): $EXT_ID"

# 3. register the host manifest (user-level, inside the isolated profile)
cat > "$PROFILE/NativeMessagingHosts/com.meetcc.spike.bridge.json" <<EOF
{
  "name": "com.meetcc.spike.bridge",
  "description": "MeetCC spike bridge (throwaway)",
  "path": "/tmp/meetcc-spike/installed/run-host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

# 4. receiver up, logs clean, Chrome runs, fixture posts results
kill $(lsof -ti :17777) 2>/dev/null || true
rm -f /tmp/meetcc-spike-host.log /tmp/meetcc-spike-host-state.json /tmp/meetcc-spike-receiver.json
node "$SPIKE/receiver.cjs" &
RECV=$!
sleep 1
"$CFT" --user-data-dir=$PROFILE --no-first-run --no-default-browser-check \
  --load-extension="$SPIKE/extension" "chrome://newtab" > /tmp/meetcc-spike/chrome-last.log 2>&1 &
CHROME=$!
for i in $(seq 1 20); do [ -f /tmp/meetcc-spike-receiver.json ] && break; sleep 1; done
kill $CHROME $RECV 2>/dev/null || true

echo "=== extension report ==="
cat /tmp/meetcc-spike-receiver.json 2>/dev/null || echo "(no report)"
echo
echo "=== host log ==="
cat /tmp/meetcc-spike-host.log 2>/dev/null || echo "(no host log)"
