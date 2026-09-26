# shared by the setup scripts: source it, then `put NAME VALUE`
put() { # put NAME VALUE: replace in .env.local, and set in Vercel production
  [[ $2 == *"'"* ]] && { echo "  $1 contains a single quote: add it to .env.local by hand"; return 1; }
  touch .env.local
  grep -v "^$1=" .env.local > .env.local.tmp || true
  printf "%s='%s'\n" "$1" "$2" >> .env.local.tmp # single quotes: Next doesn't expand $ inside them
  mv .env.local.tmp .env.local
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production >/dev/null
  echo "  $1 set"
}
