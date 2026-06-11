# Deploiement MynaPay sur Hostinger KVM2

Objectif : heberger la plateforme MynaPay sur le meme VPS que le tunnel VPN Orange BF afin que les appels CASHIN sortent depuis l'IP whitelistée `187.127.233.228`.

La production officielle du projet est maintenant documentee dans :

```text
deploy/hostinger/PRODUCTION.md
```

Ce README garde les commandes d'installation et de redeploiement. Pour l'etat courant, les chemins actifs, le TLS, le VPN, le super-admin et le retrait DigitalOcean, utiliser `PRODUCTION.md`.

## Architecture cible

```text
Internet
  |
  v
Hostinger KVM2 - 187.127.233.228
  |
  +- nginx public : 80/443
  +- frontend Next.js : 127.0.0.1:3000
  +- backend Go : 127.0.0.1:8080
  +- PostgreSQL : 127.0.0.1:5432
  +- Redis : 127.0.0.1:6379
  +- strongSwan IPsec : tunnel OBF
       |
       +- OBF gateway : 197.239.106.3
       +- OBF hosts : 197.239.106.83, 197.239.106.84
       +- OBF services : tcp/8243, tcp/9443
```

## Pre-requis

1. Acces SSH root ou utilisateur sudo au VPS Hostinger.
2. DNS `pay.myna-etoile.com` pointant vers `187.127.233.228`.
3. Fichier `.env.prod` renseigne dans le dossier applicatif.
4. Secrets Orange dans `/opt/mynapay/secrets/orange`.
5. PSK VPN convenue avec Orange via canal separe.

## Etape 1 - Bootstrap VPS

Depuis le VPS :

```bash
bash deploy/hostinger/bootstrap-kvm2.sh
```

Ce script installe Docker, Compose, strongSwan, UFW, fail2ban, certbot et cree :

```text
/opt/mynapay/app
/opt/mynapay/secrets/orange
/opt/mynapay/letsencrypt
/opt/mynapay/certbot-www
/opt/mynapay/backups
```

## Etape 2 - Copier l'application

Option simple :

```bash
mkdir -p /opt/mynapay/app
git clone <repo-url> /opt/mynapay/app
cd /opt/mynapay/app
cp .env.prod.example .env.prod
```

Renseigner `.env.prod` avec les secrets reels. Pour Hostinger :

```env
ORANGE_MONEY_CERTS_DIR=/opt/mynapay/secrets/orange
LETSENCRYPT_DIR=/opt/mynapay/letsencrypt
CERTBOT_WWW_DIR=/opt/mynapay/certbot-www
POSTGRES_PORT_BIND=127.0.0.1:5432
REDIS_PORT_BIND=127.0.0.1:6379
BACKEND_PORT_BIND=127.0.0.1:8080
FRONTEND_PORT_BIND=127.0.0.1:3000
```

## Etape 3 - Certificat TLS

DNS obligatoire avant cette etape.
La production utilise le challenge Let's Encrypt `webroot` via nginx. Le conteneur `masspay_nginx` doit donc etre actif avant de lancer le script.

```bash
cd /opt/mynapay/app
EMAIL=admin@myna-etoile.com DOMAIN=pay.myna-etoile.com bash deploy/hostinger/issue-cert.sh
```

## Etape 4 - Deployer la plateforme

```bash
cd /opt/mynapay/app
bash deploy/hostinger/deploy-platform.sh
```

Verification :

```bash
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps
curl -fsS https://pay.myna-etoile.com/health
```

## Etape 5 - VPN Orange

Configurer la PSK :

```bash
export OBF_VPN_PSK='<psk-a-echanger-avec-orange>'
cd /opt/mynapay/app
bash deploy/vpn/setup-hostinger-obf.sh
```

Verification :

```bash
ipsec statusall
journalctl -u strongswan-starter -n 100 --no-pager
```

## Etape 6 - Bascule depuis DigitalOcean

Ne pas supprimer DigitalOcean avant les controles suivants :

1. Backup PostgreSQL DigitalOcean effectue et restaure/teste si necessaire.
2. DNS pointe vers Hostinger.
3. Healthcheck public OK.
4. Login admin OK.
5. VPN OBF etabli.
6. Orange confirme les endpoints CASHIN accessibles via tunnel.
7. Premier CASHIN de test valide.

Apres seulement :

```text
- prendre un snapshot final DigitalOcean
- couper les services applicatifs DigitalOcean
- conserver le snapshot 7 a 14 jours
- supprimer la droplet/ressource DigitalOcean
```

## Securite

- Remplacer le mot de passe root partage en clair.
- Desactiver `PasswordAuthentication` apres ajout de la cle SSH.
- Garder `.env.prod`, les certificats Orange, la PSK et le PIN agent hors Git.
