#!/usr/bin/env bash
# Sets up "Buy me a coffee" (Stripe Checkout). Asks for the keys silently, writes them to .env.local and Vercel production.
#
# 1. API key: use a restricted key (rk_…), not the secret key. Stripe Dashboard → Developers → API keys →
#    Create restricted key, with only "Checkout Sessions: Write". Test keys (rk_test_…) first, live keys to go live.
# 2. Webhook: Developers → Webhooks → Add endpoint
#      URL:    https://whoislying.ch/api/stripe/webhook
#      Events: checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed
#    then copy its signing secret (whsec_…). Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
#    prints a whsec_ for your machine.
# 3. Payment methods (cards, TWINT, Apple Pay, Google Pay…) are switched on in Settings → Payment methods; the code
#    never lists them.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/env.sh

read -rsp "Stripe restricted key (rk_…): " key; echo
[ -z "$key" ] && { echo "No key, nothing changed."; exit 1; }
[[ $key == sk_* ]] && echo "  Note: that's a full secret key. A restricted key (rk_) with Checkout Sessions: Write is safer."
read -rsp "Webhook signing secret (whsec_…): " whsec; echo
put STRIPE_SECRET_KEY "$key"
[ -n "$whsec" ] && put STRIPE_WEBHOOK_SECRET "$whsec" || echo "  No webhook secret: payments work, but the admin page won't count coffees."
echo "Done. Redeploy with: just redeploy"
