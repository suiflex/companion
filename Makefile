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
native-host-install: build-host ## Register the native host (macOS/Linux): make native-host-install ID=... [CHANNEL=chrome]
	apps/desktop/scripts/install-native-host.sh $(ID) $(CHANNEL)

## ---- smoke ----

smoke: build-host ## Smoke the native host with a framed batch (vault round-trip)
	@echo "piping a demo batch through the native host"
	@set -e; tmp=$$(mktemp -d); \
		printf '{"operationId":"op-smoke","roomId":"meet/smoke","platform":"google-meet","startedAt":"2026-08-28T14:00:00+07:00","participants":["A"],"entries":[{"speaker":"A","text":"halo","time":"2026-08-28T14:01:00Z"}]}' > /tmp/cc-batch.json; \
		node -e 'const fs=require("fs");const m=Buffer.from(fs.readFileSync("/tmp/cc-batch.json","utf8"));const h=Buffer.alloc(4);h.writeUInt32LE(m.length,0);process.stdout.write(Buffer.concat([h,m]))' \
		  | COMPANION_VAULT=$$tmp node apps/desktop/dist-native/native-host.mjs 2>/dev/null \
		  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const b=Buffer.from(d);const o=JSON.parse(b.slice(4).toString());console.log(o.status==="ok"?"HOST SMOKE OK":("HOST SMOKE FAIL: "+JSON.stringify(o)))})'; \
		rm -rf $$tmp /tmp/cc-batch.json

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS=":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
