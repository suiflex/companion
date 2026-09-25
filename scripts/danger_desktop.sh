#!/usr/bin/env bash
# Runs the Companion Desktop binary in smoke mode and fails if the app
# panics, aborts, hangs, or fails to initialize its window event loop.
#
# `cargo check` and `cargo test` only test code headlessly without ever
# starting Tauri or the window event loop. This runner executes the built
# desktop binary, lets Tauri initialize plugins, config, and vault, runs the
# window event loop, and exits cleanly.
#
# Usage: scripts/danger_desktop.sh
#   BIN=path/to/companion-desktop       override binary path
#   COMPANION_SMOKE_DELAY_MS=4000      delay before clean exit (ms)
#
# On Linux run it under a display: xvfb-run -a scripts/danger_desktop.sh

set -euo pipefail

# Run from the repo root whatever directory the caller was in.
cd "$(dirname "$0")/.."

BIN=${BIN:-apps/desktop/src-tauri/target/debug/companion-desktop}
DELAY=${COMPANION_SMOKE_DELAY_MS:-3000}
OUT=${DANGER_OUT:-$(mktemp -d)}

if [ ! -x "$BIN" ]; then
  echo "no binary at $BIN — build it with: cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml" >&2
  exit 2
fi

mkdir -p "$OUT"
log="$OUT/desktop-smoke.log"
rc=0

echo "starting companion-desktop smoke test (delay: ${DELAY}ms)..."
echo "logs in $log"

(
  export COMPANION_DESKTOP_SMOKE=1
  export COMPANION_SMOKE_DELAY_MS="$DELAY"
  # Clean throwaway HOME so tests don't read or pollute developer vaults
  export HOME="$OUT/home"
  export USERPROFILE="$OUT/home"
  mkdir -p "$HOME"
  exec "$BIN"
) >"$log" 2>&1 &
app=$!

# Hand-rolled watchdog in case of deadlock or unexpected hang
( sleep 60; kill -9 "$app" 2>/dev/null ) &
watchdog=$!

wait "$app" || rc=$?
kill "$watchdog" 2>/dev/null || true
wait "$watchdog" 2>/dev/null || true

if [ "$rc" -ne 0 ]; then
  echo "FAIL: companion-desktop exited with code $rc"
  tail -30 "$log"
  exit 1
fi

if grep -qE "panicked|Recursion detected|Segmentation fault" "$log"; then
  echo "FAIL: panic or crash detected in log"
  tail -30 "$log"
  exit 1
fi

if ! grep -q "COMPANION_DESKTOP_SMOKE: window event loop running" "$log"; then
  echo "FAIL: event loop confirmation not found in log"
  tail -30 "$log"
  exit 1
fi

echo "ok   companion-desktop smoke passed"
