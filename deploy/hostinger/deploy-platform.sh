#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/mynapay/app}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env.prod}"

cd "${APP_DIR}"

if [ ! -f "${ENV_FILE}" ]; then
  echo "Fichier env introuvable: ${ENV_FILE}" >&2
  echo "Copier .env.prod.example vers .env.prod puis renseigner les secrets." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "${ENV_FILE}"
set +a

: "${ORANGE_MONEY_CERTS_DIR:=/opt/mynapay/secrets/orange}"
: "${LETSENCRYPT_DIR:=/opt/mynapay/letsencrypt}"
: "${CERTBOT_WWW_DIR:=/opt/mynapay/certbot-www}"

if [ ! -d "${ORANGE_MONEY_CERTS_DIR}" ]; then
  echo "Dossier secrets Orange introuvable: ${ORANGE_MONEY_CERTS_DIR}" >&2
  exit 1
fi

docker compose \
  --env-file "${ENV_FILE}" \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  config --quiet

docker compose \
  --env-file "${ENV_FILE}" \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  pull nginx postgres redis || true

docker compose \
  --env-file "${ENV_FILE}" \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  up -d --build

docker compose \
  --env-file "${ENV_FILE}" \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  ps
