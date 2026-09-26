<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project workflow

Use the `justfile` for everything (`just` lists recipes). Don't invent ad-hoc commands when a recipe exists.

| Task | Command |
| --- | --- |
| First-time setup (deps, git hooks, browser) | `just setup` |
| Dev server | `just dev` (in-memory store) · `just dev-redis` (local Upstash stand-in) |
| Lint (ESLint + shadcn design rules) | `just lint` |
| Types | `just typecheck` |
| Unit tests | `just test` |
| E2E (Playwright) | `just e2e` · one spec: `just e2e layout` |
| Everything before a release | `just check` (CI runs the same on every push and PR: `.github/workflows/ci.yml`) |
| Release (bump, tag, GitHub release; CI then deploys it to Vercel and starts the iOS build) | `just release 1.13.0 "notes"` |
| Settings version = GitHub release | `just version-check` (also a pre-push hook and in CI) |
| Run all git hooks | `just hooks` |
| Sign-in keys (Google/GitHub/Microsoft) → .env.local + Vercel | `just auth-setup`, then `just redeploy` |
| Email sign-in key (Resend) → .env.local + Vercel | `just email-setup`, then `just redeploy` |
| "Buy me a coffee" (Stripe key + webhook secret) → .env.local + Vercel | `just stripe-setup`, then `just redeploy` |
| Any other secret (typed hidden) → .env.local + Vercel | `just secret NAME`, then `just redeploy` |
| A GitHub Actions secret (store builds, CI) (typed hidden) | `just secret-gh NAME` |
| One-time: let CI deploy to Vercel (token + ids as GitHub secrets) | `just vercel-ci-setup` |
| Deploy | push to `main` (auto) · `just redeploy` after env changes |
| Store apps: local debug build | `just app-android` (APK) · `just app-ios` (opens Xcode) |
| Store apps: signed release, built and uploaded by CI | GitHub → Actions → "iOS release" / "Android release" → Run workflow (needs one-time secrets, see each workflow file) |

## Standards

- Git hooks run through [prek](https://github.com/j178/prek) (`.pre-commit-config.yaml`): lint + typecheck on commit, the manual check on the commit message, unit tests on push.
- **User manual:** any commit that touches `src/app`, `src/components`, or `src/lib/{i18n,topics,vocab}.ts` must also update `docs/MANUAL.md`. `scripts/check-manual.sh` enforces this in the git hook and in a Claude Code `PreToolUse` hook (`.claude/settings.json`). If nothing players see changed, put `[skip-manual]` in the commit message.
- Design: no emojis (use lucide icons), no raw colors or arbitrary Tailwind values (use the tokens in `globals.css`), mobile-first, and keep every screen free of horizontal scroll at 320px (`just e2e layout`).
- All UI text goes in `src/lib/i18n.ts` for EN, FR and DE.
