#!/usr/bin/env bash
set -euo pipefail

PARTNER_PUBLIC_IP="${PARTNER_PUBLIC_IP:-187.127.233.228}"
OBF_GATEWAY_IP="${OBF_GATEWAY_IP:-197.239.106.3}"
OBF_REMOTE_SUBNETS="${OBF_REMOTE_SUBNETS:-197.239.106.83/32,197.239.106.84/32}"
LOCAL_SUBNET="${LOCAL_SUBNET:-${PARTNER_PUBLIC_IP}/32}"

if [ -z "${OBF_VPN_PSK:-}" ]; then
  echo "OBF_VPN_PSK est requis. Exemple: export OBF_VPN_PSK='<psk>'" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y strongswan strongswan-pki ufw curl tcpdump

cat >/etc/ipsec.conf <<EOF
config setup
    uniqueids=no
    charondebug="ike 1, knl 1, cfg 1"

conn obf-cashin
    auto=start
    type=tunnel
    keyexchange=ikev2
    authby=psk
    left=%defaultroute
    leftid=${PARTNER_PUBLIC_IP}
    leftsubnet=${LOCAL_SUBNET}
    right=${OBF_GATEWAY_IP}
    rightid=${OBF_GATEWAY_IP}
    rightsubnet=${OBF_REMOTE_SUBNETS}
    ike=aes256-sha256-modp3072!
    esp=aes256-sha256-modp3072!
    ikelifetime=86400s
    lifetime=3600s
    dpddelay=30s
    dpdtimeout=120s
    dpdaction=restart
    fragmentation=yes
    reauth=no
EOF

umask 077
cat >/etc/ipsec.secrets <<EOF
${PARTNER_PUBLIC_IP} ${OBF_GATEWAY_IP} : PSK "${OBF_VPN_PSK}"
EOF

cat >/etc/sysctl.d/99-mynapay-vpn.conf <<EOF
net.ipv4.ip_forward=1
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.all.send_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.default.send_redirects=0
EOF
sysctl --system

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow from "${OBF_GATEWAY_IP}" to any port 500 proto udp
ufw allow from "${OBF_GATEWAY_IP}" to any port 4500 proto udp
ufw allow proto esp from "${OBF_GATEWAY_IP}" to any
ufw --force enable

systemctl enable strongswan-starter
systemctl restart strongswan-starter

echo "Tunnel OBF configure. Verifier avec: ipsec statusall"
