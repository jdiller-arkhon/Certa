#!/usr/bin/env bash
# Restores a backup made by backup.sh into the Docker Compose stack. DESTRUCTIVE: replaces the
# current database and object storage. Verifies checksums first.
#
#   infra/scripts/restore.sh backups/certa-20261008T120000Z
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC="${1:?usage: restore.sh <backup-dir>}"
COMPOSE=(docker compose -f infra/docker/compose.yml --env-file .env)
set -a; source .env; set +a

(cd "$SRC" && sha256sum -c SHA256SUMS)
read -r -p "This replaces ALL current Certa data with $SRC. Type 'restore' to continue: " ok
[ "$ok" = "restore" ] || { echo "Aborted."; exit 1; }

"${COMPOSE[@]}" stop api worker web caddy
DB="${POSTGRES_DB:-certa}"; U="${POSTGRES_USER:-certa_owner}"
"${COMPOSE[@]}" exec -T postgres psql -U "$U" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" -c "CREATE DATABASE \"$DB\""
"${COMPOSE[@]}" exec -T postgres pg_restore -U "$U" -d "$DB" --no-owner --exit-on-error < "$SRC/database.dump"

"${COMPOSE[@]}" stop objects
docker run --rm -v certa_objects:/data -v "$(cd "$SRC" && pwd)":/in:ro alpine:3.22 \
  sh -c 'rm -rf /data/* && tar -C /data -xzf /in/objects.tar.gz'

# Re-run the migrator: re-creates the app login role/grants and applies any newer migrations.
"${COMPOSE[@]}" up -d objects
"${COMPOSE[@]}" run --rm migrate
"${COMPOSE[@]}" up -d
echo "Restore complete."
