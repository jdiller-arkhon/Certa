#!/usr/bin/env bash
# Backs up a running Certa Docker Compose stack: Postgres (pg_dump, custom format) and the
# object store volume. Writes a timestamped directory with a SHA-256 manifest.
#
#   infra/scripts/backup.sh [output-dir]        (default: ./backups)
set -euo pipefail
cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f infra/docker/compose.yml --env-file .env)
set -a; source .env; set +a
OUT="${1:-./backups}/certa-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"

echo "Dumping database ${POSTGRES_DB:-certa}…"
"${COMPOSE[@]}" exec -T postgres pg_dump -U "${POSTGRES_USER:-certa_owner}" -d "${POSTGRES_DB:-certa}" \
  --format=custom --no-owner --compress=9 > "$OUT/database.dump"

echo "Archiving object storage…"
docker run --rm -v certa_objects:/data:ro -v "$(cd "$OUT" && pwd)":/out alpine:3.22 \
  tar -C /data -czf /out/objects.tar.gz .

"${COMPOSE[@]}" exec -T postgres psql -U "${POSTGRES_USER:-certa_owner}" -d "${POSTGRES_DB:-certa}" -At \
  -c "select coalesce(max(created_at)::text, 'none') from drizzle.__drizzle_migrations" > "$OUT/schema-version.txt"
(cd "$OUT" && sha256sum database.dump objects.tar.gz schema-version.txt > SHA256SUMS)
echo "Backup written to $OUT"
