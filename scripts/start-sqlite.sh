#!/usr/bin/env sh
set -eu

cd /app
case "$DATABASE_URL" in
  file:/*) database_path=${DATABASE_URL#file:}; database_path=${database_path%%\?*} ;;
  *) echo "Container DATABASE_URL must be an absolute SQLite file URL." >&2; exit 1 ;;
esac

database_dir=$(dirname "$database_path")
mkdir -p "$database_dir"
if [ ! -s "$database_path" ]; then
  cp /app/seed.sqlite "$database_path"
fi
pnpm exec prisma migrate deploy

if [ -z "${NEXTAUTH_SECRET:-}" ]; then
  secret_path="$database_dir/.nextauth-secret"
  if [ ! -s "$secret_path" ]; then
    (umask 077; node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("base64url"))' > "$secret_path")
  fi
  NEXTAUTH_SECRET=$(cat "$secret_path")
  export NEXTAUTH_SECRET
fi
if [ -z "${NEXTAUTH_URL:-}" ]; then
  export AUTH_TRUST_HOST="${AUTH_TRUST_HOST:-true}"
fi

cd .next/standalone
exec node server.js
