#!/usr/bin/env bash
# Companion — local curl installer for Meet Companion.
#
# Installs the `companion` CLI + release dist into ~/.companion and a `companion`
# wrapper into ~/.local/bin (no npm, no global publish). After it finishes, just
# run `companion install` — it detects your browsers, lets you pick one in a TTY,
# and launches the extension in a dedicated profile.
#
#   From the repo:            bash scripts/install.sh
#   From a URL (curl):        curl -fsSL <raw>/scripts/install.sh | bash
#
# Env overrides:
#   COMPANION_HOME        install dir     (default: ~/.companion)
#   COMPANION_BIN         wrapper dir     (default: ~/.local/bin)
#   COMPANION_SRC         raw base URL    (default: github suiflex/companion develop)
#   COMPANION_FETCH_DIST  0 to skip fetching the release dist here
set -euo pipefail

COMPANION_HOME="${COMPANION_HOME:-$HOME/.companion}"
BIN_DIR="${COMPANION_BIN:-$HOME/.local/bin}"
SRC_BASE="${COMPANION_SRC:-https://raw.githubusercontent.com/suiflex/companion/develop}"
FETCH_DIST="${COMPANION_FETCH_DIST:-1}"

mkdir -p "$COMPANION_HOME" "$BIN_DIR"

# 1. companion.mjs
SCRIPT_SRC="$(cd "$(dirname "$0")" 2>/dev/null && pwd)/companion.mjs" || true
if [ -n "$SCRIPT_SRC" ] && [ -f "$SCRIPT_SRC" ]; then
  install -m 755 "$SCRIPT_SRC" "$COMPANION_HOME/companion.mjs"
  echo "Using local scripts/companion.mjs"
else
  echo "Downloading companion.mjs..."
  curl -fsSL "$SRC_BASE/scripts/companion.mjs" -o "$COMPANION_HOME/companion.mjs"
  chmod +x "$COMPANION_HOME/companion.mjs"
fi

# 2. wrapper that pins COMPANION_HOME and execs node
cat > "$BIN_DIR/companion" <<EOF
#!/usr/bin/env bash
export COMPANION_HOME="$COMPANION_HOME"
exec node "$COMPANION_HOME/companion.mjs" "\$@"
EOF
chmod +x "$BIN_DIR/companion"

echo
echo "Companion installed."
echo "  CLI     : $COMPANION_HOME/companion.mjs"
echo "  wrapper : $BIN_DIR/companion"

if [ "${FETCH_DIST:-1}" = "1" ]; then
  echo
  echo "Fetching the latest release dist..."
  export COMPANION_HOME
  node "$COMPANION_HOME/companion.mjs" update || echo "(failed to fetch dist — \`companion install\` will offer to fetch it)"
fi

echo
if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  echo "  Note: $BIN_DIR is not on your PATH."
  echo "  Run:  export PATH=\"\$PATH:$BIN_DIR\"   (or add it to your shell rc)"
fi
echo
echo "Next:  companion install"
