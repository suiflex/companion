.PHONY: install test test-vault typecheck typecheck-desktop lint build build-desktop build-host \
	tauri tauri-dev dev dev-extension native-host-install smoke help

# Companion monorepo convenience targets. Wrap the npm/workspace scripts so
# there is one surface for the common loops.

## ---- setup ----

install: ## Install all workspace dependencies
	npm install

## ---- verification ----

test: ## Run the whole vitest suite
	npm test

test-vault: ## Run only the vault package tests
	npx vitest run packages/vault

typecheck: ## tsc --noEmit for the whole monorepo (the type authority)
	npm run typecheck

typecheck-desktop: ## Typecheck only the desktop workspace
	npx tsc --noEmit -p apps/desktop

lint: ## eslint across the repo
	npm run lint

## ---- build ----

build: ## Full monorepo build (extension + mcp + sync-server)
	npm run build

build-desktop: ## Build the desktop frontend (tsc + vite)
	npm run build -w @meetcc/desktop

build-host: ## Bundle the native-messaging host
	npm run build:host -w @meetcc/desktop

## ---- run ----

dev: ## Desktop Vite dev server only (no window)
	npm run dev -w @meetcc/desktop

dev-extension: ## Extension dev server
	npm run dev -w @meetcc/extension

tauri: ## Build the desktop app (release, no dmg)
	cd apps/desktop && npx tauri build --no-bundle

tauri-dev: ## Run the desktop app in dev mode (vite + tauri)
	cd apps/desktop && npx tauri dev

## ---- native host ----

# Register the native host with Chrome (default) or Firefox. The extension id
# (Chromium: pkgpllhlmhhocidmipbokpigndoeiemb, Firefox: companion@suiflex.dev)
# must match the browser's loaded build.
# The install script builds the host itself, so this does not depend on build-host.
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

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS=":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
