#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/mynapay}"
APP_DIR="${APP_DIR:-${APP_ROOT}/app}"
DOMAIN="${DOMAIN:-pay.myna-etoile.com}"
SSH_PORT="${SSH_PORT:-22}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Ce script doit etre execute en root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y \
  ca-certificates \
  curl \
  git \
  gnupg \
  lsb-release \
  ufw \
  unattended-upgrades \
  fail2ban \
  strongswan \
  strongswan-pki \
  tcpdump \
  certbot

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "Docker + Compose deja installes, installation Docker ignoree."
  systemctl enable --now docker
else
  rm -f /etc/apt/sources.list.d/docker.list /etc/apt/sources.list.d/docker.sources
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  . /etc/os-release
  cat >/etc/apt/sources.list.d/docker.list <<EOF
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable
EOF

  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

mkdir -p \
  "${APP_DIR}" \
  "${APP_ROOT}/secrets/orange" \
  "${APP_ROOT}/letsencrypt" \
  "${APP_ROOT}/certbot-www" \
  "${APP_ROOT}/backups"
chmod 700 "${APP_ROOT}/secrets"
chmod 700 "${APP_ROOT}/secrets/orange"

cat >/etc/sysctl.d/99-mynapay-hostinger.conf <<EOF
net.ipv4.ip_forward=1
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.default.send_redirects=0
EOF
sysctl --system

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 500/udp
ufw allow 4500/udp
ufw allow proto esp from any to any
ufw --force enable

systemctl enable --now fail2ban

cat <<EOF
Hostinger KVM2 bootstrap termine.

Repertoires:
- App: ${APP_DIR}
- Secrets Orange: ${APP_ROOT}/secrets/orange
- LetsEncrypt: ${APP_ROOT}/letsencrypt
- Certbot webroot: ${APP_ROOT}/certbot-www

Prochaine etape:
1. Copier le repo dans ${APP_DIR}
2. Copier .env.prod dans ${APP_DIR}/.env.prod
3. Placer les fichiers Orange dans ${APP_ROOT}/secrets/orange
4. Lancer deploy/hostinger/deploy-platform.sh
EOF
