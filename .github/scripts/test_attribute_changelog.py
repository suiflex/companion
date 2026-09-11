#!/usr/bin/env python3
"""Self-check for attribute_changelog.py."""

from attribute_changelog import attribute

AUTHORS = {
    "aaa": ("ekacahya21", "Eka Cahya", "eka@example.com"),
    "bbb": ("wahyuakbarwibowo", "Wahyu Akbar", "wahyu@example.com"),
    "ccc": ("mulhamna", "Mulham", "mulham@example.com"),
    "ddd": (None, "Anon Person", "anon@example.com"),
    "eee": ("ekacahya21", "Eka Cahya", "eka@example.com"),
}

ROOT = """# Changelog

## [1.12.0](https://github.com/suiflex/companion/compare/v1.11.0...v1.12.0) (2026-09-11)

### Features

* **mcp:** shiny new thing ([aaa](https://github.com/suiflex/companion/commit/aaaaaa))
* **extension:** another new thing ([eee](https://github.com/suiflex/companion/commit/eeeeee))

### Bug Fixes

* **api:** fix a thing ([bbb](https://github.com/suiflex/companion/commit/bbbbbb))
* **ci:** a maintainer chore ([ccc](https://github.com/suiflex/companion/commit/cccccc))

## Historical milestones

Old stuff.
"""


def _resolve(sha):
    return AUTHORS[sha]


def test_appends_handles_and_sections():
    out = attribute(ROOT, resolve=_resolve, history=lambda _: {"eka@example.com", "wahyu@example.com"})
    assert "shiny new thing (@ekacahya21) ([aaa]" in out
    assert "fix a thing (@wahyuakbarwibowo) ([bbb]" in out
    assert "### Thanks" in out
    assert out.count("* @ekacahya21\n") == 1
    assert "* @wahyuakbarwibowo\n" in out


def test_maintainers_stay_plain():
    out = attribute(ROOT, resolve=_resolve, history=lambda _: set())
    assert "a maintainer chore ([ccc]" in out
    assert "@mulhamna" not in out


def test_new_contributors_use_previous_tag_history():
    root = ROOT.replace(
        "* **ci:** a maintainer chore ([ccc](https://github.com/suiflex/companion/commit/cccccc))",
        "* **cli:** anon fix ([ddd](https://github.com/suiflex/companion/commit/dddddd))",
    )
    out = attribute(root, resolve=_resolve, history=lambda _: {"eka@example.com"})
    assert "### New Contributors" in out
    assert "* @wahyuakbarwibowo made their first contribution" in out
    assert "* Anon Person made their first contribution" in out
    assert "@ekacahya21 made their first contribution" not in out


def test_older_sections_are_untouched():
    out = attribute(ROOT, resolve=_resolve, history=lambda _: set())
    assert out.split("## Historical milestones")[1].strip() == "Old stuff."


def test_is_idempotent():
    once = attribute(ROOT, resolve=_resolve, history=lambda _: {"eka@example.com"})
    assert attribute(once, resolve=_resolve, history=lambda _: {"eka@example.com"}) == once


def test_maintainer_only_release_is_unchanged():
    root = """# Changelog

## [1.12.0](https://github.com/suiflex/companion/compare/v1.11.0...v1.12.0)

* **ci:** maintainer chore ([ccc](https://github.com/suiflex/companion/commit/cccccc))
"""
    out = attribute(root, resolve=_resolve, history=lambda _: set())
    assert out == root
    assert "### Thanks" not in out


if __name__ == "__main__":
    cases = sorted((name, fn) for name, fn in globals().items() if name.startswith("test_"))
    for name, fn in cases:
        fn()
        print(f"ok {name}")
    print("all checks passed")
