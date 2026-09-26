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

# retake the screenshots in docs/manual (real OpenAI for the AI ones if .env.local has a key)
manual-shots:
    MANUAL_SHOTS=1 npx playwright test e2e/manual.spec.ts --workers=1

# precompute "Explain with AI" for every pack word into production Redis (pulls prod env temporarily)
warm-explanations:
    #!/usr/bin/env bash
    set -euo pipefail
    vercel env pull .env.warm.local --environment production --yes >/dev/null
    trap 'rm -f .env.warm.local' EXIT
    # Vercel hands out a placeholder for sensitive vars: Redis comes from production, the OpenAI key from .env.local
    npx tsx --env-file=.env.warm.local --env-file=.env.local scripts/warm-explanations.mts

# Android app (Capacitor, loads https://whoislying.ch): debug APK in android/app/build/outputs/apk/debug
app-android:
    npx cap sync android
    cd android && JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || echo /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home)" ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}" ./gradlew assembleDebug

# iOS app (Capacitor): needs full Xcode; opens the project to build/run/sign there
app-ios:
    npx cap sync ios
    npx cap open ios

# everything CI would run
check: lint typecheck test e2e

# the version in Settings (package.json) matches the release tag and isn't behind GitHub's latest release
version-check:
    bash scripts/check-version.sh

# The pushed v-tag makes .github/workflows/ci.yml check again, deploy to Vercel and start the iOS build, so a release
# deploys exactly once, from CI (not from here, not from Vercel's own git hook).
# full release: checks, bump, tag, push, GitHub release. `just release 1.13.0 "notes"`
release version notes: check
    npm version {{version}} --no-git-tag-version --allow-same-version
    git add package.json package-lock.json && git commit -m "chore: release v{{version}} [skip-manual]" || true
    git tag v{{version}}
    just version-check
    git push && git push --tags
    gh release create v{{version}} --title "v{{version}}" --notes {{quote(notes)}}

# production build
build:
    npm run build

# run all git hooks on every file
hooks:
    prek run --all-files

# OAuth sign-in keys for AI features; prompts for secrets, never echoes them
auth-setup:
    bash scripts/setup-auth.sh

# email sign-in keys (Resend) → .env.local + Vercel
email-setup:
    bash scripts/setup-email.sh

# any secret, typed hidden → .env.local + Vercel production, e.g. `just secret OPENAI_API_KEY`
secret NAME:
    bash scripts/set-secret.sh {{NAME}}

# a GitHub Actions secret (store builds, CI deploy), typed hidden → `gh secret set`, e.g. `just secret-gh APPLE_TEAM_ID`
secret-gh NAME:
    bash scripts/secret-gh.sh {{NAME}}

# one-time: Vercel token + ids as GitHub secrets, so ci.yml deploys each release tag (asks for the token hidden)
vercel-ci-setup:
    bash scripts/setup-vercel-ci.sh

# "Buy me a coffee" keys (Stripe restricted key + webhook secret) → .env.local + Vercel
stripe-setup:
    bash scripts/setup-stripe.sh

# rebuild the newest working production deployment, e.g. after changing env vars (pushes to main deploy on their own)
redeploy:
    vercel redeploy "$(vercel ls imposter --environment production --status READY 2>/dev/null | head -1)" --target production
