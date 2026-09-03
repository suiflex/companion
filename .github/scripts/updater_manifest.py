#!/usr/bin/env python3
"""Build the Tauri updater manifest (`latest.json`) from a release's assets.

The bundles are produced by six independent matrix legs that never see each
other, so the manifest is assembled afterwards from what actually landed on the
release. An architecture whose leg failed is simply absent: the updater then
tells those users nothing is available, which beats pointing them at a bundle
that does not exist.

Usage: updater_manifest.py <tag> <assets.json> <sig-dir> <out.json>

`assets.json` is `gh release view <tag> --json assets`; `sig-dir` holds the
`.sig` files downloaded from the same release.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

REPO = "suiflex/companion"

# Which asset is the updater bundle for each platform key Tauri asks about.
# release-desktop.yml renames every bundle to `companion-desktop-<triple>.<ext>`
# before upload, so these are exact names rather than the substring guesses the
# raw Tauri filenames used to force.
PLATFORMS = {
    "darwin-aarch64": ["companion-desktop-aarch64-apple-darwin.app.tar.gz"],
    "darwin-x86_64": ["companion-desktop-x86_64-apple-darwin.app.tar.gz"],
    "linux-x86_64": ["companion-desktop-x86_64-unknown-linux-gnu.AppImage"],
    "linux-aarch64": ["companion-desktop-aarch64-unknown-linux-gnu.AppImage"],
    "windows-x86_64": ["companion-desktop-x86_64-pc-windows-msvc.msi"],
    "windows-aarch64": ["companion-desktop-aarch64-pc-windows-msvc.msi"],
}


def pick(names, needles):
    """The one asset matching every needle, or None. Ambiguity is a bug worth
    failing on rather than resolving by guessing.

    Signatures are excluded first: every needle set is a substring match, and a
    `.sig` sits next to the bundle it signs under a name that contains the
    bundle's own -- so `foo.app.tar.gz` matches `foo.app.tar.gz.sig` too."""
    names = [n for n in names if not n.endswith(".sig")]
    hits = [n for n in names if all(x in n for x in needles)]
    if len(hits) > 1:
        raise SystemExit(f"ambiguous updater asset for {needles}: {hits}")
    return hits[0] if hits else None


def main(tag, assets_path, sig_dir, out_path):
    names = [a["name"] for a in json.loads(Path(assets_path).read_text())["assets"]]
    sigs = Path(sig_dir)

    platforms = {}
    for key, needles in PLATFORMS.items():
        asset = pick(names, needles)
        if asset is None:
            print(f"skip {key}: no bundle on the release", file=sys.stderr)
            continue
        sig = sigs / f"{asset}.sig"
        if not sig.is_file():
            print(f"skip {key}: {sig.name} missing", file=sys.stderr)
            continue
        platforms[key] = {
            "signature": sig.read_text().strip(),
            "url": f"https://github.com/{REPO}/releases/download/{quote(tag)}/{quote(asset)}",
        }

    if not platforms:
        raise SystemExit("no signed bundles found — refusing to publish an empty manifest")

    Path(out_path).write_text(
        json.dumps(
            {
                # The app compares this against its own version, so it has to be
                # the bare semver the tag carries.
                "version": tag.rsplit("v", 1)[-1],
                "pub_date": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                "platforms": platforms,
            },
            indent=2,
        )
        + "\n"
    )
    print(f"latest.json: {', '.join(sorted(platforms))}")


def selftest():
    """`updater_manifest.py --selftest` — the matching rules are the only part
    here that can be quietly wrong, so they get a check. Names come from the
    release rather than the build directory: GitHub rewrites spaces on upload,
    which the rename step in release-desktop.yml now removes ahead of it."""
    # The asset set a release carries once every leg has uploaded, signatures
    # included: leaving those out is what let the ambiguity ship.
    names = [
        "companion-desktop-aarch64-apple-darwin.dmg",
        "companion-desktop-x86_64-apple-darwin.dmg",
        "companion-desktop-aarch64-apple-darwin.app.tar.gz",
        "companion-desktop-aarch64-apple-darwin.app.tar.gz.sig",
        "companion-desktop-x86_64-apple-darwin.app.tar.gz",
        "companion-desktop-x86_64-apple-darwin.app.tar.gz.sig",
        "companion-desktop-x86_64-unknown-linux-gnu.AppImage",
        "companion-desktop-x86_64-unknown-linux-gnu.AppImage.sig",
        "companion-desktop-aarch64-unknown-linux-gnu.AppImage",
        "companion-desktop-aarch64-unknown-linux-gnu.AppImage.sig",
        "companion-desktop-x86_64-unknown-linux-gnu.deb",
        "companion-desktop-x86_64-unknown-linux-gnu.deb.sig",
        "companion-desktop-x86_64-pc-windows-msvc.msi",
        "companion-desktop-x86_64-pc-windows-msvc.msi.sig",
        "companion-desktop-aarch64-pc-windows-msvc.msi",
        "companion-desktop-aarch64-pc-windows-msvc.msi.sig",
        "companion-desktop-x86_64-pc-windows-msvc.exe",
        "companion-desktop-aarch64-pc-windows-msvc.exe",
    ]
    got = {k: pick(names, n) for k, n in PLATFORMS.items()}
    for key, needles in PLATFORMS.items():
        assert got[key] == needles[0], got
    # A leg that never uploaded leaves a hole, it does not borrow another arch.
    assert pick([n for n in names if "aarch64" not in n], PLATFORMS["linux-aarch64"]) is None
    # The tag now carries no component, and the manifest version is what the
    # installed app compares against.
    assert "v1.10.0".rsplit("v", 1)[-1] == "1.10.0"
    print("selftest ok")


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        selftest()
    elif len(sys.argv) == 5:
        main(*sys.argv[1:])
    else:
        raise SystemExit(__doc__)
