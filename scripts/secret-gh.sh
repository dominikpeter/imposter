#!/usr/bin/env bash
# Stores one GitHub Actions secret without it ever showing: `just secret-gh NAME` asks for its value hidden and pipes it
# straight into `gh secret set`. For the CI workflows (store builds, deploy); `just secret` is for the app itself (.env.local
# + Vercel). The value never appears on screen, in shell history or in any log.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/gh-secret.sh
name=${1:-}
[[ $name =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "usage: just secret-gh NAME   (NAME in CAPITALS, e.g. APPLE_TEAM_ID)"; exit 1; }
echo "Paste the value, then press Enter and Ctrl-D (for a multi-line secret like a .p8 or JSON key: paste it all, then Ctrl-D on its own line)."
value=$(cat)
[ -n "$value" ] || { echo "Empty, nothing changed."; exit 1; }
put_gh "$name" "$value"
