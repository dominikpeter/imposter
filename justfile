# Imposter — common tasks. `just` lists them.
default:
    @just --list

# install deps, git hooks (prek) and the Playwright browser
setup:
    npm install
    prek install
    npx playwright install chromium

# dev server on :3000 (in-memory room store)
dev:
    npm run dev

# dev server backed by a local Upstash stand-in (needs redis-server)
dev-redis:
    #!/usr/bin/env bash
    set -euo pipefail
    redis-server --port 6380 --save '' --daemonize yes
    npm run redis:local & trap 'kill $!' EXIT
    KV_REST_API_URL=http://localhost:8079 KV_REST_API_TOKEN=local npm run dev

# eslint + shadcn design lint
lint:
    npx eslint --max-warnings 0

typecheck:
    npx tsc --noEmit

# unit tests
test:
    npm test

# Playwright e2e (starts its own dev server); pass args, e.g. `just e2e layout`
e2e *args:
    npx playwright test {{args}}

# everything CI would run
check: lint typecheck test e2e

# production build
build:
    npm run build

# run all git hooks on every file
hooks:
    prek run --all-files

# OAuth sign-in keys for AI features; prompts for secrets, never echoes them
auth-setup:
    bash scripts/setup-auth.sh

# rebuild the newest working production deployment, e.g. after changing env vars (pushes to main deploy on their own)
redeploy:
    vercel redeploy "$(vercel ls imposter --environment production --status READY 2>/dev/null | head -1)" --target production
