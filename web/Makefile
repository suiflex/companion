.PHONY: install deps dev build preview deploy deploy-check check lint format format-check verify test audit capture assets links

install:
	npm ci --legacy-peer-deps=false
deps:
	npm install --legacy-peer-deps=false
dev:
	npm run dev
build:
	npm run build
preview:
	npm run preview
deploy:
	npm run deploy
deploy-check:
	npm run deploy:check
check:
	npm run check
lint:
	npm run lint
format:
	npm run format
format-check:
	npm run format:check
verify: check lint format-check build
test:
	npm run test
audit:
	npm run audit
capture:
	node scripts/capture-product.mjs
assets:
	node scripts/social.mjs
links:
	node scripts/check-links.mjs
