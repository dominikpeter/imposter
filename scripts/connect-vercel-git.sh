#!/usr/bin/env bash
# Connect the Vercel project to GitHub so every push to main deploys to production.
# The one manual step: let Vercel's GitHub app see this repo (a GitHub permission only you can grant).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
repo=$(gh repo view --json nameWithOwner -q .nameWithOwner)
project=$(jq -r .projectName .vercel/project.json)

# `vercel git connect` also fails when the repo is already linked, so check first
linked=$(vercel api "/v9/projects/$project" 2>/dev/null | jq -r '.link | select(.type == "github") | "\(.org)/\(.repo)"')
if [ "$linked" = "$repo" ]; then
  echo "Already connected: pushes to main deploy $repo to production."
  exit 0
fi

if ! vercel git connect "https://github.com/$repo" --yes; then
  echo
  echo "Vercel's GitHub app can't see $repo yet. In the page that opens now:"
  echo "  1. pick your account ($(dirname "$repo"))"
  echo "  2. Repository access → 'Only select repositories' → add $(basename "$repo") (or 'All repositories')"
  echo "  3. Save / Install"
  open "https://github.com/apps/vercel/installations/new"
  until read -rp "Done? Press Enter to retry (Ctrl+C to stop) " && vercel git connect "https://github.com/$repo" --yes; do :; done
fi
echo "Connected: pushes to main now deploy $repo to production."
