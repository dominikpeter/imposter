#!/usr/bin/env bash
# One-time: gives GitHub Actions (ci.yml's deploy job) what it needs to run `vercel deploy` on its own.
# VERCEL_ORG_ID and VERCEL_PROJECT_ID aren't secret (every checkout's .vercel/project.json has them), so they're read from
# there. VERCEL_TOKEN is the one real secret: asked for hidden, never shown, never saved to disk.
# Last, it sets the repository variable VERCEL_CI_READY=true, which switches ci.yml's deploy job on.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/gh-secret.sh

[ -f .vercel/project.json ] || { echo ".vercel/project.json is missing — run 'vercel link' once first."; exit 1; }
put_gh VERCEL_ORG_ID "$(node -p "require('./.vercel/project.json').orgId")"
put_gh VERCEL_PROJECT_ID "$(node -p "require('./.vercel/project.json').projectId")"

echo "Create a token at https://vercel.com/account/tokens (scope: your team), then paste it here (hidden):"
read -rs token
echo
[ -n "$token" ] || { echo "Empty, nothing changed."; exit 1; }
put_gh VERCEL_TOKEN "$token"
gh variable set VERCEL_CI_READY --body true >/dev/null && echo "  VERCEL_CI_READY=true set on GitHub"

echo "Done. The next 'just release' deploys from GitHub Actions."
