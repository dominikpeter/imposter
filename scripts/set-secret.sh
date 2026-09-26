#!/usr/bin/env bash
# Stores any secret without it ever showing up on screen, in the shell history or in a chat:
#   just secret NAME   → asks for the value silently, writes NAME to .env.local and to Vercel production.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

name="${1:-}"
[[ $name =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "Usage: just secret NAME   (NAME in CAPS, e.g. STRIPE_SECRET_KEY)"; exit 1; }
read -rsp "$name (hidden): " value; echo
[ -z "$value" ] && { echo "Empty, nothing changed."; exit 1; }
put "$name" "$value"
echo "Done. Redeploy with: just redeploy"
