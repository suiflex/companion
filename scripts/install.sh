#!/usr/bin/env bash
# Companion — local curl installer for Meet Companion.
#
# Installs Companion Desktop and the `companion` CLI (no npm, no global
# publish). The desktop app is the thing you get up front; the browser
# extension is one command away afterwards:
#
#   companion install     detect browsers, pick one, load the extension
#   companion update      re-fetch the extension dist
#
# The CLI and the modules it imports land in ~/.companion, with a `companion`
# wrapper in ~/.local/bin. The desktop app goes to ~/Applications on macOS and
# ~/.local/bin on Linux.
#
#   From the repo:            bash scripts/install.sh
#   From a URL (curl):        curl -fsSL <raw>/scripts/install.sh | bash
#
# Env overrides:
#   COMPANION_HOME        install dir     (default: ~/.companion)
#   COMPANION_BIN         wrapper dir     (default: ~/.local/bin)
#   COMPANION_SRC         raw base URL    (default: github suiflex/companion develop)
#   COMPANION_APPS        macOS app dir   (default: /Applications if writable, else ~/Applications)
#   COMPANION_DESKTOP     0 to skip installing the desktop app
#   COMPANION_FETCH_DIST  1 to also pre-fetch the extension dist (needs node)
set -euo pipefail

REPO="suiflex/companion"
COMPANION_HOME="${COMPANION_HOME:-$HOME/.companion}"
BIN_DIR="${COMPANION_BIN:-$HOME/.local/bin}"
# /Applications is root:admin drwxrwxr-x, so the admin account every
# single-user Mac starts with can write it without sudo — that is how Homebrew
# casks land there. A standard (non-admin) account cannot, and falls back to
# ~/Applications, which Spotlight and Launchpad index just the same. The
# installer never escalates: one that asks for your password is one you have to
# read first.
APPS_DIR="${COMPANION_APPS:-}"
if [ -z "$APPS_DIR" ]; then
  APPS_DIR="$HOME/Applications"
  if [ -d /Applications ] && [ -w /Applications ]; then APPS_DIR=/Applications; fi
fi
SRC_BASE="${COMPANION_SRC:-https://raw.githubusercontent.com/suiflex/companion/develop}"
WANT_DESKTOP="${COMPANION_DESKTOP:-1}"
# Off by default now: `companion install` downloads the dist on demand, so
# pre-fetching it here only spends time on something you may never load.
FETCH_DIST="${COMPANION_FETCH_DIST:-0}"

mkdir -p "$COMPANION_HOME" "$BIN_DIR"

# --- desktop app -------------------------------------------------------------
# Pure shell on purpose. The desktop app is a native binary, so installing it
# must not require Node — only the extension half of the flow does.
#
# Asset names are deterministic (`companion-desktop-<target-triple>.<ext>`, set
# by release-desktop.yml), so the URL can be built rather than looked up.

desktop_triple() {
  case "$(uname -s)/$(uname -m)" in
    Darwin/arm64 | Darwin/aarch64) echo aarch64-apple-darwin ;;
    Darwin/x86_64)                 echo x86_64-apple-darwin ;;
    Linux/x86_64)                  echo x86_64-unknown-linux-gnu ;;
    Linux/aarch64 | Linux/arm64)   echo aarch64-unknown-linux-gnu ;;
    *) return 1 ;;
  esac
}

# /releases/latest skips drafts and prereleases, so it never answers with the
# rolling `companion-desktop-latest` pointer the app polls for updates.
latest_tag() {
  curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null \
    | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1
}

# Never fatal: a missing desktop asset must still leave a working CLI behind.
install_desktop() {
  local triple tag tmp url app mnt
  if ! triple="$(desktop_triple)"; then
    echo "  Skipped: no desktop build for $(uname -s)/$(uname -m)."
    return 0
  fi
  tag="$(latest_tag)"
  if [ -z "$tag" ]; then
    echo "  Skipped: could not reach the GitHub releases API."
    return 0
  fi

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  if [ "$(uname -s)" = "Darwin" ]; then
    url="https://github.com/$REPO/releases/download/$tag/companion-desktop-$triple.dmg"
    if ! curl -fsL "$url" -o "$tmp/app.dmg"; then
      echo "  Skipped: $tag carries no companion-desktop-$triple.dmg."
      return 0
    fi
    mnt="$tmp/mnt"
    mkdir -p "$mnt" "$APPS_DIR"
    hdiutil attach -nobrowse -readonly -mountpoint "$mnt" "$tmp/app.dmg" >/dev/null
    app="$(find "$mnt" -maxdepth 1 -name '*.app' -print -quit)"
    if [ -n "$app" ]; then
      # Replace only our own app, by its exact name inside the image. `:?`
      # rather than plain expansion: an empty COMPANION_APPS would otherwise
      # make this `rm -rf /Companion Desktop.app`.
      rm -rf "${APPS_DIR:?}/$(basename "$app")"
      cp -R "$app" "$APPS_DIR/"
      # Belt and braces, and only the one attribute: a curl download carries no
      # com.apple.quarantine, so this clears nothing today — it matters only if
      # the image ever arrives by a route that does set it. It is NOT what gets
      # the app past Gatekeeper; the build is unsigned, so the first launch
      # still needs the right-click-Open step INSTALL.md describes.
      xattr -dr com.apple.quarantine "$APPS_DIR/$(basename "$app")" 2>/dev/null || true
    fi
    hdiutil detach "$mnt" >/dev/null || true
    [ -n "$app" ] || { echo "  Skipped: no .app inside the disk image."; return 0; }
    echo "  Installed $tag -> $APPS_DIR/$(basename "$app")"
  else
    url="https://github.com/$REPO/releases/download/$tag/companion-desktop-$triple.AppImage"
    if ! curl -fsL "$url" -o "$tmp/companion-desktop"; then
      echo "  Skipped: $tag carries no companion-desktop-$triple.AppImage."
      return 0
    fi
    install -m 755 "$tmp/companion-desktop" "$BIN_DIR/companion-desktop"
    echo "  Installed $tag -> $BIN_DIR/companion-desktop"
  fi
}

if [ "$WANT_DESKTOP" = "1" ]; then
  echo "Installing Companion Desktop..."
  install_desktop
  echo
fi

# 1. the CLI and the modules it imports
HERE="$(cd "$(dirname "$0")" 2>/dev/null && pwd)" || HERE=""
for f in companion.mjs unzip.mjs picker.mjs nativeHost.mjs; do
  if [ -n "$HERE" ] && [ -f "$HERE/$f" ]; then
    install -m 755 "$HERE/$f" "$COMPANION_HOME/$f"
    echo "Using local scripts/$f"
  else
    echo "Downloading $f..."
    curl -fsSL "$SRC_BASE/scripts/$f" -o "$COMPANION_HOME/$f"
    chmod +x "$COMPANION_HOME/$f"
  fi
done

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

if [ "$FETCH_DIST" = "1" ]; then
  echo
  echo "Fetching the latest extension dist..."
  export COMPANION_HOME
  node "$COMPANION_HOME/companion.mjs" update || echo "(failed to fetch dist — \`companion install\` will offer to fetch it)"
fi

echo
if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  echo "  Note: $BIN_DIR is not on your PATH."
  echo "  Run:  export PATH=\"\$PATH:$BIN_DIR\"   (or add it to your shell rc)"
fi
echo
echo "Next:  companion install      # load the extension into a browser"
if ! command -v node >/dev/null 2>&1; then
  echo "       ^ needs Node.js 20+ on PATH; the desktop app above does not."
fi
