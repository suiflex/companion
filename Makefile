.PHONY: help install \
	check-all check-all-js ci ci-js ci-rust test test-coverage test-vault typecheck typecheck-desktop lint \
	rust-fmt rust-fmt-fix rust-lint rust-check \
	build build-extension build-desktop build-host build-mcp build-sync \
	smoke smoke-mcp smoke-sync \
	pack pack-source sign-firefox lint-firefox sync-start \
	dev dev-extension dev-desktop tauri tauri-dev tauri-bundle native-host-install

# The command surface for this repository.
#
# Documentation and CI both call these targets and never the npm scripts
# underneath — package.json is the implementation, this file is the interface.
# That is the whole point: when the two disagree, nothing tells you, and the
# doc a newcomer follows is the one that turns out to be wrong.
#
# `make ci` is the gate. Run it before opening a pull request; CI runs the
# same target, so a green local run means a green pipeline.

DESKTOP_CRATE := apps/desktop/src-tauri

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS=":.*## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

## ---- setup ----

install: ## Install all workspace dependencies
	npm install

## ---- the gate ----

check-all: typecheck typecheck-desktop lint rust-fmt rust-lint ## Every linter and typechecker, no tests

# Includes the builds and the smokes on purpose: a bundle that fails to build
# and a native host that stops deduping are both things the type checker and
# the unit tests are happy to let through.
ci: ci-js ci-rust ## Everything CI runs — the gate before a PR

# Split along the toolchain boundary so CI can run the two halves on separate
# runners — only one of them needs a Rust toolchain and the Linux WebView
# libraries — while a developer still runs the whole thing with `make ci`.
check-all-js: typecheck typecheck-desktop lint ## Linters and typecheckers that need no Rust toolchain
ci-js: check-all-js test build-extension smoke smoke-mcp smoke-sync ## The JS half of the gate
ci-rust: rust-fmt rust-lint rust-check rust-test smoke-host ## The Rust half of the gate

## ---- verification ----

test: ## Run the whole vitest suite
	npx vitest run

test-coverage: ## vitest with v8 coverage
	npm run test:coverage

test-vault: ## Run only the vault package tests
	npx vitest run packages/vault

typecheck: ## tsc --noEmit for the whole monorepo (the type authority, not eslint)
	npm run typecheck

typecheck-desktop: ## Typecheck the desktop workspace against its own tsconfig
	npx tsc --noEmit -p apps/desktop

lint: ## eslint across the repo
	npm run lint

lint-firefox: ## web-ext lint against the packed Firefox build
	npm run lint:firefox

## ---- rust (desktop backend) ----

rust-fmt: ## cargo fmt --check
	cd $(DESKTOP_CRATE) && cargo fmt --check

rust-fmt-fix: ## cargo fmt (apply)
	cd $(DESKTOP_CRATE) && cargo fmt

# -D warnings, or this is not a gate: a warning that never fails is a warning
# nobody reads.
rust-lint: ## clippy over all targets, warnings are errors
	cd $(DESKTOP_CRATE) && cargo clippy --all-targets -- -D warnings

# Both ways round: `wdio` is compiled out of a release build, so nothing else
# would ever tell us that the feature still builds until someone tries to run
# the desktop suite.
rust-check: ## cargo check, with and without the test-only wdio feature
	cd $(DESKTOP_CRATE) && cargo check
	cd $(DESKTOP_CRATE) && cargo check --features wdio

## ---- build ----

build: ## Full monorepo build (extension + mcp + sync-server)
	npm run build

build-extension: ## Build the extension bundle only
	npm run build -w apps/extension

build-desktop: ## Build the desktop frontend (tsc + vite)
	npm run build -w @meetcc/desktop

build-host: ## Bundle the native-messaging host
	npm run build:host -w @meetcc/desktop

build-mcp: ## Build the MCP server bin
	npm run build -w @meetcc/mcp

build-sync: ## Build the sync-server bin
	npm run build -w @meetcc/sync-server

## ---- run a server ----

# Reads COMPANION_TOKEN from the environment, so the token never has to be
# typed into a workspace-flag incantation.
sync-start: build-sync ## Run the sync server (COMPANION_TOKEN=... make sync-start)
	npm run start -w @meetcc/sync-server

## ---- package & sign ----

pack: ## Pack the Chromium and Firefox zips
	npm run pack

pack-source: ## Pack the source archive AMO requires
	npm run pack:source

sign-firefox: ## Submit the Firefox build to AMO (needs AMO credentials)
	npm run sign:firefox

## ---- run ----

dev: dev-extension ## Alias for dev-extension; use dev-desktop for the desktop app

dev-extension: ## Extension dev server
	npm run dev -w @meetcc/extension

dev-desktop: ## Desktop Vite dev server only (no window; use tauri-dev for that)
	npm run dev -w @meetcc/desktop

tauri: ## Build the desktop app (release binary, no installer)
	cd apps/desktop && npx tauri build --no-bundle

tauri-bundle: ## Build the desktop app with installers (.app/.dmg, .msi, .AppImage)
	cd apps/desktop && npx tauri build

tauri-dev: ## Run the desktop app in dev mode (vite + window)
	cd apps/desktop && npx tauri dev

## ---- native host ----

# No build-host prerequisite: the install script builds the host itself.
# The extension id (Chromium: pkgpllhlmhhocidmipbokpigndoeiemb,
# Firefox: companion@suiflex.dev) must match the browser's loaded build.
native-host-install: ## Register the native host (macOS/Linux): make native-host-install ID=... [CHANNEL=chrome]
	apps/desktop/scripts/install-native-host.sh $(ID) $(CHANNEL)

## ---- smoke ----

smoke: build-host ## Smoke the native host: two identical frames in one write
	@echo "piping two identical batches through the native host in one write"
	@set -e; tmp=$$(mktemp -d); \
		node -e 'const b=Buffer.from(JSON.stringify({operationId:"op-smoke",roomId:"meet/smoke",platform:"google-meet",startedAt:"2026-08-28T14:00:00+07:00",participants:["A"],entries:[{speaker:"A",text:"halo",time:"2026-08-28T14:01:00Z"}]}));const h=Buffer.alloc(4);h.writeUInt32LE(b.length,0);const f=Buffer.concat([h,b]);process.stdout.write(Buffer.concat([f,f]))' \
		  | COMPANION_VAULT=$$tmp node apps/desktop/dist-native/native-host.mjs 2>/dev/null \
		  | node -e 'const d=[];process.stdin.on("data",c=>d.push(c));process.stdin.on("end",()=>{let b=Buffer.concat(d);const out=[];while(b.length>=4){const n=b.readUInt32LE(0);out.push(JSON.parse(b.slice(4,4+n).toString()));b=b.slice(4+n)}const ok=out[0]?.status==="ok"&&out[1]?.status==="duplicate";console.log(ok?"HOST FRAMING OK":"HOST FRAMING FAIL: "+JSON.stringify(out));process.exit(ok?0:1)})'; \
		test -n "$$(find $$tmp -name '*.md')" || { echo "HOST SMOKE FAIL: no note written"; exit 1; }; \
		test "$$(cat $$tmp/.transcript/*.jsonl | wc -l | tr -d ' ')" = "1" || { echo "HOST SMOKE FAIL: transcript not appended exactly once"; exit 1; }; \
		echo "HOST SMOKE OK"; \
		rm -rf $$tmp

rust-test: ## cargo test for the desktop crate
	cd apps/desktop/src-tauri && cargo test

smoke-host: ## The desktop binary answers native messaging in --native-host mode
	@cd apps/desktop/src-tauri && cargo build --quiet
	@node scripts/smoke-host-rs.mjs apps/desktop/src-tauri/target/debug/companion-desktop

smoke-mcp: build-mcp ## The built MCP bin answers over stdio
	npm run smoke -w @meetcc/mcp

smoke-sync: build-sync ## The built sync bin answers over HTTP
	npm run smoke -w @meetcc/sync-server
