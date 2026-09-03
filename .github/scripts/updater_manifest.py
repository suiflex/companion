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
# Matched as "all these substrings appear in the filename", which is enough to
# separate the architectures without pinning Tauri's exact naming scheme.
PLATFORMS = {
    "darwin-aarch64": ["aarch64-apple-darwin.app.tar.gz"],
    "darwin-x86_64": ["x86_64-apple-darwin.app.tar.gz"],
    "linux-x86_64": ["amd64", ".AppImage"],
    "linux-aarch64": ["aarch64", ".AppImage"],
    "windows-x86_64": ["x64", ".msi"],
    "windows-aarch64": ["arm64", ".msi"],
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
    here that can be quietly wrong, so they get a check. GitHub rewrites spaces
    in asset names to dots on upload, which is why names come from the release
    rather than from the build directory."""
    # Taken from the real companion-desktop-v0.3.1 release, signatures
    # included: leaving those out is what let the ambiguity ship.
    names = [
        "Companion.Desktop_0.3.0_aarch64.dmg",
        "Companion.Desktop_0.3.0_x64.dmg",
        "Companion.Desktop.aarch64-apple-darwin.app.tar.gz",
        "Companion.Desktop.aarch64-apple-darwin.app.tar.gz.sig",
        "Companion.Desktop.x86_64-apple-darwin.app.tar.gz",
        "Companion.Desktop.x86_64-apple-darwin.app.tar.gz.sig",
        "companion-desktop_0.3.0_amd64.AppImage",
        "companion-desktop_0.3.0_amd64.AppImage.sig",
        "companion-desktop_0.3.0_aarch64.AppImage",
        "companion-desktop_0.3.0_aarch64.AppImage.sig",
        "companion-desktop_0.3.0_amd64.deb",
        "companion-desktop_0.3.0_amd64.deb.sig",
        "Companion.Desktop_0.3.0_x64_en-US.msi",
        "Companion.Desktop_0.3.0_x64_en-US.msi.sig",
        "Companion.Desktop_0.3.0_arm64_en-US.msi",
        "Companion.Desktop_0.3.0_arm64_en-US.msi.sig",
        "Companion.Desktop_0.3.0_x64-setup.exe",
        "Companion.Desktop_0.3.0_arm64-setup.exe",
    ]
    got = {k: pick(names, n) for k, n in PLATFORMS.items()}
    assert got["darwin-aarch64"] == "Companion.Desktop.aarch64-apple-darwin.app.tar.gz", got
    assert got["darwin-x86_64"] == "Companion.Desktop.x86_64-apple-darwin.app.tar.gz", got
    assert got["linux-x86_64"] == "companion-desktop_0.3.0_amd64.AppImage", got
    assert got["linux-aarch64"] == "companion-desktop_0.3.0_aarch64.AppImage", got
    assert got["windows-x86_64"] == "Companion.Desktop_0.3.0_x64_en-US.msi", got
    assert got["windows-aarch64"] == "Companion.Desktop_0.3.0_arm64_en-US.msi", got
    # A leg that never uploaded leaves a hole, it does not borrow another arch.
    assert pick([n for n in names if "aarch64" not in n], PLATFORMS["linux-aarch64"]) is None
    print("selftest ok")


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        selftest()
    elif len(sys.argv) == 5:
        main(*sys.argv[1:])
    else:
        raise SystemExit(__doc__)
