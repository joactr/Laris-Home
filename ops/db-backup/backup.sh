#!/bin/sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

wait_for_db() {
  until pg_isready -h "${PGHOST:-db}" -p "${PGPORT:-5432}" -U "${PGUSER:?PGUSER is required}" -d "${PGDATABASE:?PGDATABASE is required}" >/dev/null 2>&1; do
    echo "[db-backup] waiting for postgres..."
    sleep 5
  done
}

run_backup() {
  timestamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
  filename="${PGDATABASE}_${timestamp}.sql.gz"
  filepath="${BACKUP_DIR}/${filename}"

  echo "[db-backup] creating backup ${filepath}"
  pg_dump -h "${PGHOST:-db}" -p "${PGPORT:-5432}" -U "${PGUSER}" -d "${PGDATABASE}" | gzip > "${filepath}"

  echo "[db-backup] pruning backups older than ${BACKUP_RETENTION_DAYS} days"
  find "$BACKUP_DIR" -type f -name '*.sql.gz' -mtime +"${BACKUP_RETENTION_DAYS}" -delete
}

wait_for_db

if [ "${1:-}" = "once" ]; then
  run_backup
  exit 0
fi

run_backup

while true; do
  sleep "$BACKUP_INTERVAL_SECONDS"
  run_backup
done
