#!/usr/bin/env bash
# Creates .env from .env.example with freshly generated secrets. Refuses to overwrite.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -e .env ] && { echo ".env already exists — not overwriting."; exit 1; }
gen() { openssl rand -hex "$1"; }
PGPW=$(gen 16); APPPW=$(gen 16)
sed -e "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$PGPW/" \
    -e "s/^APP_DB_PASSWORD=$/APP_DB_PASSWORD=$APPPW/" \
    -e "s/^AUTH_SECRET=$/AUTH_SECRET=$(gen 32)/" \
    -e "s/^S3_SECRET_ACCESS_KEY=$/S3_SECRET_ACCESS_KEY=$(gen 16)/" \
    -e "s#^DATABASE_URL=.*#DATABASE_URL=postgres://certa_api:$APPPW@localhost:5432/certa#" \
    -e "s#^DATABASE_ADMIN_URL=.*#DATABASE_ADMIN_URL=postgres://certa_owner:$PGPW@localhost:5432/certa#" \
    .env.example > .env
chmod 600 .env
echo "Wrote .env with generated secrets."
