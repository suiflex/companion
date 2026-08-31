#!/bin/sh
# Linux leg of the native-messaging spike, executed INSIDE a Debian container
# (node:22-bookworm-slim + chromium). Userspace only: no root-level manifest.
set -eu

echo "=== [linux] environment ==="
uname -a
chromium --version

# 1. "installer": per-user host install (mirrors a deb/rpm postinst without root)
mkdir -p /root/.local/lib/meetcc-spike /root/.config/chromium/NativeMessagingHosts
cp /rig/host/host.cjs /root/.local/lib/meetcc-spike/
NODEBIN=$(command -v node)
cat > /root/.local/lib/meetcc-spike/run-host.sh <<EOF
#!/bin/sh
exec "$NODEBIN" /root/.local/lib/meetcc-spike/host.cjs "\$@"
EOF
chmod +x /root/.local/lib/meetcc-spike/run-host.sh

# 2. extension fixture local copy + derive the pinned ID (nibble formula)
cp -r /rig/extension /root/extfix
EXT_ID=$(node -e '
const c=require("crypto"),fs=require("fs");
const m=JSON.parse(fs.readFileSync("/root/extfix/manifest.json","utf8"));
const h=c.createHash("sha256").update(Buffer.from(m.key,"base64")).digest();
let id="";for(let i=0;i<16;i++){id+=String.fromCharCode(97+(h[i]>>4),97+(h[i]&15));}
console.log(id);
')
echo "extension ID (derived): $EXT_ID"

# 3. register host manifest — per-user manifests resolve relative to the
# EFFECTIVE user-data-dir (rig: /root/profile; real default-profile installs:
# ~/.config/chromium or ~/.config/google-chrome NativeMessagingHosts)
mkdir -p /root/profile/NativeMessagingHosts
cat > /root/profile/NativeMessagingHosts/com.meetcc.spike.bridge.json <<EOF
{
  "name": "com.meetcc.spike.bridge",
  "description": "MeetCC spike bridge (throwaway)",
  "path": "/root/.local/lib/meetcc-spike/run-host.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

# 4. receiver + headless chromium roundtrip
rm -f /tmp/meetcc-spike-host.log /tmp/meetcc-spike-host-state.json /tmp/meetcc-spike-receiver.json
node /rig/receiver.cjs > /tmp/receiver.out 2>&1 &
RECV=$!
sleep 1
chromium --headless=new --no-sandbox --disable-gpu --user-data-dir=/root/profile \
  --no-first-run --no-default-browser-check --load-extension=/root/extfix \
  --virtual-time-budget=15000 --dump-dom "chrome://newtab" > /dev/null 2>/tmp/chromium.err || true
kill $RECV 2>/dev/null || true

echo "=== [linux] extension report ==="
cat /tmp/meetcc-spike-receiver.json 2>/dev/null || echo "(no report)"
echo
echo "=== [linux] host log ==="
cat /tmp/meetcc-spike-host.log 2>/dev/null || echo "(no host log)"
echo
echo "=== [linux] receiver stdout ==="
cat /tmp/receiver.out 2>/dev/null || echo "(none)"
echo
echo "=== [linux] chromium stderr tail ==="
tail -25 /tmp/chromium.err 2>/dev/null || echo "(none)"
