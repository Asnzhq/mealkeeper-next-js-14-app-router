#!/usr/bin/env sh
set -eu
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-mealkeeper}" -d "${POSTGRES_DB:-mealkeeper}" | gzip > "$BACKUP_DIR/mealkeeper-$STAMP.sql.gz"
find "$BACKUP_DIR" -type f -name 'mealkeeper-*.sql.gz' -mtime +30 -delete
