#!/usr/bin/env bash
# Upgrades a self-hosted install: backup, rebuild images, migrate, restart.
set -euo pipefail
cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f infra/docker/compose.yml --env-file .env)
infra/scripts/backup.sh
"${COMPOSE[@]}" build
"${COMPOSE[@]}" run --rm migrate
"${COMPOSE[@]}" up -d
"${COMPOSE[@]}" ps
