#!/bin/bash
# Backup PostgreSQL vers fichier local + upload S3 (optionnel)
# Usage: ./scripts/backup-pg.sh
#
# Variables d'environnement :
#   BACKUP_PG_DATABASE  — nom de la base (defaut: masspay_bf)
#   BACKUP_PG_USER      — utilisateur PostgreSQL
#   BACKUP_PG_PASSWORD  — mot de passe PostgreSQL
#   BACKUP_S3_BUCKET    — bucket S3 (optionnel, si vide → pas d'upload)
#   BACKUP_S3_REGION    — région S3 (defaut: eu-west-3)
#   BACKUP_RETENTION_DAYS — rétention locale en jours (defaut: 7)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/../backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

DB_NAME="${BACKUP_PG_DATABASE:-masspay_bf}"
DB_USER="${BACKUP_PG_USER:-masspay}"
DB_PASS="${BACKUP_PG_PASSWORD:-}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
S3_REGION="${BACKUP_S3_REGION:-eu-west-3}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

mkdir -p "${BACKUP_DIR}"

# ── Dump ───────────────────────────────────────────────────────────
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[backup] Dumping ${DB_NAME} → ${BACKUP_FILE}"

if [ -n "${DB_PASS}" ]; then
  export PGPASSWORD="${DB_PASS}"
fi

pg_dump \
  --username="${DB_USER}" \
  --host="${PGHOST:-localhost}" \
  --port="${PGPORT:-5432}" \
  --dbname="${DB_NAME}" \
  --no-owner \
  --no-acl \
  --format=custom \
  --compress=9 \
  --file="${BACKUP_FILE}"

unset PGPASSWORD

echo "[backup] Dump terminé: $(du -h "${BACKUP_FILE}" | cut -f1)"

# ── Upload S3 ──────────────────────────────────────────────────────
if [ -n "${S3_BUCKET}" ]; then
  if command -v aws &>/dev/null; then
    echo "[backup] Upload vers s3://${S3_BUCKET}/"
    aws s3 cp "${BACKUP_FILE}" "s3://${S3_BUCKET}/postgresql/$(basename "${BACKUP_FILE}")" --region "${S3_REGION}"
    echo "[backup] Upload terminé"
  else
    echo "[backup] aws CLI non trouvé, upload S3 ignoré"
  fi
fi

# ── Nettoyage (rétention locale) ───────────────────────────────────
echo "[backup] Nettoyage des fichiers de plus de ${RETENTION_DAYS} jours"
find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete

echo "[backup] Terminé avec succès"
