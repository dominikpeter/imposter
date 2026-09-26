#!/usr/bin/env bash
# Sets up sign-in with a code by email (Resend). Asks for the API key silently, writes it to .env.local and Vercel production.
# The sender must be on a domain verified in Resend (resend.com/domains); onboarding@resend.dev only delivers to your own Resend address.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

read -rsp "Resend API key (re_…): " key; echo
[ -z "$key" ] && { echo "No key, nothing changed."; exit 1; }
read -rp "Sender [Imposter <code@whoislying.ch>]: " from
put RESEND_API_KEY "$key"
put RESEND_FROM "${from:-Imposter <code@whoislying.ch>}"
echo "Done. Redeploy with: just redeploy"
