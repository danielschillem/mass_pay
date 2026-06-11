#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-pay.myna-etoile.com}"
EMAIL="${EMAIL:-}"
APP_ROOT="${APP_ROOT:-/opt/mynapay}"
WEBROOT="${WEBROOT:-${APP_ROOT}/certbot-www}"
NGINX_CONTAINER="${NGINX_CONTAINER:-masspay_nginx}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Ce script doit etre execute en root." >&2
  exit 1
fi

if [ -z "${EMAIL}" ]; then
  echo "EMAIL est requis. Exemple: EMAIL=admin@myna-etoile.com bash issue-cert.sh" >&2
  exit 1
fi

mkdir -p \
  "${APP_ROOT}/letsencrypt" \
  "${WEBROOT}/.well-known/acme-challenge" \
  "${APP_ROOT}/certbot-work" \
  "${APP_ROOT}/certbot-logs"

if ! docker ps --format '{{.Names}}' | grep -qx "${NGINX_CONTAINER}"; then
  echo "Le conteneur nginx ${NGINX_CONTAINER} doit etre actif pour le challenge webroot." >&2
  echo "Demarrer la plateforme avant d'executer ce script." >&2
  exit 1
fi

live_dir="${APP_ROOT}/letsencrypt/live/${DOMAIN}"
if [ -d "${live_dir}" ] && [ ! -L "${live_dir}/fullchain.pem" ]; then
  mkdir -p "${APP_ROOT}/letsencrypt-temp-backup"
  mv "${live_dir}" "${APP_ROOT}/letsencrypt-temp-backup/${DOMAIN}-$(date +%Y%m%d%H%M%S)"
fi

certbot certonly \
  --webroot \
  -w "${WEBROOT}" \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --preferred-challenges http \
  --deploy-hook "/usr/bin/docker kill -s HUP ${NGINX_CONTAINER}" \
  --config-dir "${APP_ROOT}/letsencrypt" \
  --work-dir "${APP_ROOT}/certbot-work" \
  --logs-dir "${APP_ROOT}/certbot-logs" \
  -d "${DOMAIN}"

certbot reconfigure \
  --cert-name "${DOMAIN}" \
  --webroot \
  -w "${WEBROOT}" \
  --deploy-hook "/usr/bin/docker kill -s HUP ${NGINX_CONTAINER}" \
  --non-interactive \
  --config-dir "${APP_ROOT}/letsencrypt" \
  --work-dir "${APP_ROOT}/certbot-work" \
  --logs-dir "${APP_ROOT}/certbot-logs"

docker kill -s HUP "${NGINX_CONTAINER}" >/dev/null || docker restart "${NGINX_CONTAINER}"

openssl x509 \
  -in "${APP_ROOT}/letsencrypt/live/${DOMAIN}/fullchain.pem" \
  -noout -subject -issuer -dates

echo "Certificat webroot genere/configure pour ${DOMAIN} dans ${APP_ROOT}/letsencrypt"
