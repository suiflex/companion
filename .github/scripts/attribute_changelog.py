#!/usr/bin/env python3
"""Add contributor attribution to the newest release block of CHANGELOG.md.

Runs after release-please updates the changelog on the pending release branch.
It adds GitHub handles to contributor lines, a Thanks section, and a New
Contributors section. Maintainer commits remain unchanged.
"""

import os
import re
import subprocess
import sys

MAINTAINERS = {"mulhamna", "badrus123"}
_PREVTAG_RE = re.compile(r"/compare/(.+?)\.\.\.")
_BULLET_RE = re.compile(r"^(\* (?:\*\*[^:*]+:\*\* )?)(.*?)( \(\[[0-9a-f]+\]\([^)]*\)\))\s*$")
_SHA_RE = re.compile(r"\[([0-9a-f]+)\]")


def _split_top_block(text):
    parts = re.split(r"^(?=## )", text, flags=re.MULTILINE)
    head = parts[0] if parts and not parts[0].startswith("## ") else ""
    sections = parts[1:] if head else parts
    if not sections:
        return text, "", ""
    return head, sections[0], "".join(sections[1:])


def gh_author(sha):
    repo = os.environ.get("GITHUB_REPOSITORY", "suiflex/companion")
    proc = subprocess.run(
        [
            "gh",
            "api",
            f"repos/{repo}/commits/{sha}",
            "--jq",
            "[.author.login, .commit.author.name, .commit.author.email] | @tsv",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return (None, None, None)
    login, name, email, *_ = (*proc.stdout.rstrip("\n").split("\t"), "", "", "")
    return (login or None, name or None, email or None)


def prev_emails(prevtag):
    if not prevtag:
        return set()
    proc = subprocess.run(
        ["git", "log", prevtag, "--format=%ae"],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return set()
    return {line.strip() for line in proc.stdout.splitlines() if line.strip()}


def _token(login, name):
    return f"@{login}" if login else (name or "an unknown contributor")


def attribute(text, resolve=gh_author, history=prev_emails, product="Meet Companion"):
    before, block, after = _split_top_block(text)
    if not block or "### Thanks" in block or "### New Contributors" in block:
        return text

    lines = block.splitlines()
    head_re = re.compile(r"^## (?:(?:" + re.escape(product) + r"): )?\[([^\]]+)\]\(([^)]*)\)")
    head_match = head_re.match(lines[0])
    if not head_match:
        return text
    prevtag_match = _PREVTAG_RE.search(head_match.group(2))
    prevtag = prevtag_match.group(1) if prevtag_match else None

    cache = {}
    contributors = []
    seen_tokens = set()
    release_emails = {}
    out_lines = []
    for line in lines:
        match = _BULLET_RE.match(line)
        if not match:
            out_lines.append(line)
            continue
        prefix, subject, link = match.groups()
        sha = _SHA_RE.search(link).group(1)
        if sha not in cache:
            cache[sha] = resolve(sha)
        login, name, email = cache[sha]
        if login and login.lower() in MAINTAINERS:
            out_lines.append(line)
            continue

        token = _token(login, name)
        out_lines.append(f"{prefix}{subject} ({token}){link}")
        if token not in seen_tokens:
            seen_tokens.add(token)
            contributors.append(token)
        if email:
            release_emails.setdefault(email, token)

    if not contributors:
        return text

    known = history(prevtag)
    newcomers = [token for email, token in release_emails.items() if email not in known]
    block = "\n".join(out_lines).rstrip("\n")
    block += "\n\n\n### Thanks\n\nThanks to everyone who contributed to this release:\n\n"
    block += "\n".join(f"* {token}" for token in contributors) + "\n"
    if prevtag and newcomers:
        block += "\n\n### New Contributors\n\n"
        block += "\n".join(f"* {token} made their first contribution" for token in newcomers) + "\n"

    rebuilt = before + block.rstrip("\n")
    if after:
        rebuilt += "\n\n" + after
    return rebuilt.rstrip("\n") + "\n"


def main():
    dst = sys.argv[1] if len(sys.argv) > 1 else "CHANGELOG.md"
    product = os.environ.get("PRODUCT_NAME", "Meet Companion")
    if not os.path.exists(dst):
        print(f"{dst} not present; nothing to attribute")
        return
    with open(dst, encoding="utf-8") as fh:
        text = fh.read()
    out = attribute(text, product=product)
    if out == text:
        print("no attribution changes")
        return
    with open(dst, "w", encoding="utf-8") as fh:
        fh.write(out)
    print(f"attributed contributors in {dst}")


if __name__ == "__main__":
    main()
