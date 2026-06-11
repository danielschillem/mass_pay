# Production MynaPay - Hostinger KVM2

Ce document est la source de verite pour l'infrastructure de production MynaPay.
Depuis le 11 juin 2026, la cible de production du projet est le VPS Hostinger KVM2.
DigitalOcean ne doit plus etre considere comme l'infrastructure cible, sauf comme ancien environnement a conserver le temps des derniers controles et backups.

## Etat actuel

```text
Provider: Hostinger VPS KVM2
Hostname VPS: srv1750255
IP publique: 187.127.233.228
Domaine public: pay.myna-etoile.com
URL plateforme: https://pay.myna-etoile.com
Healthcheck: https://pay.myna-etoile.com/health
OS: Ubuntu 24.04 LTS
Runtime: Docker + Docker Compose
Reverse proxy: nginx
VPN: strongSwan IPsec
```

Le DNS `pay.myna-etoile.com` pointe vers `187.127.233.228`.
Le certificat HTTPS est emis par Let's Encrypt et le renouvellement automatique a ete valide par `certbot renew --dry-run`.

## Acces serveur

Acces SSH par cle uniquement :

```powershell
ssh -i "$env:USERPROFILE\.ssh\mynapay_hostinger_ed25519" root@187.127.233.228
```

Politique SSH appliquee :

```text
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin without-password
```

Ne pas reutiliser ni documenter de mot de passe root. Les secrets restent uniquement dans le VPS ou dans un coffre externe.

## Arborescence production

```text
/opt/mynapay/app                 Code applicatif deploye
/opt/mynapay/app/.env.prod       Variables production, chmod 600, hors Git
/opt/mynapay/secrets/orange      Certificats/cles Orange, chmod 700, hors Git
/opt/mynapay/letsencrypt         Certificats Let's Encrypt
/opt/mynapay/certbot-www         Webroot ACME challenge
/opt/mynapay/backups             Backups locaux temporaires
```

Fichiers Orange attendus dans `/opt/mynapay/secrets/orange` :

```text
star_orange_bf.pem
OrangeBFV22026.key
pin_public_key.pem
```

Ces fichiers peuvent rester absents tant qu'Orange n'a pas livre les credentials definitifs, mais le dossier doit exister.

## Services Docker

La production utilise :

```bash
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml
```

Services attendus :

```text
masspay_nginx   nginx public 80/443
masspay_web     frontend Next.js, bind 127.0.0.1:3000
masspay_api     backend Go, bind 127.0.0.1:8080
masspay_db      PostgreSQL, bind 127.0.0.1:5432
masspay_redis   Redis, bind 127.0.0.1:6379
```

Verifier l'etat :

```bash
cd /opt/mynapay/app
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps
curl -fsS https://pay.myna-etoile.com/health
```

## Variables production

Le fichier `/opt/mynapay/app/.env.prod` est le seul fichier d'environnement production actif sur le VPS.
Il ne doit jamais etre commite.

Etat de securite attendu :

```env
ENV=production
GIN_MODE=release
SEED_SUPER_ADMIN=false
TOTP_REQUIRED=true
POSTGRES_PORT_BIND=127.0.0.1:5432
REDIS_PORT_BIND=127.0.0.1:6379
BACKEND_PORT_BIND=127.0.0.1:8080
FRONTEND_PORT_BIND=127.0.0.1:3000
ORANGE_MONEY_CERTS_DIR=/opt/mynapay/secrets/orange
LETSENCRYPT_DIR=/opt/mynapay/letsencrypt
CERTBOT_WWW_DIR=/opt/mynapay/certbot-www
```

Secrets obligatoires :

```text
DB_PASSWORD
REDIS_PASSWORD
JWT_SECRET
FIELD_ENCRYPTION_KEY      64 caracteres hexadecimaux
```

Credentials CashIn Orange encore a renseigner apres validation du tunnel VPN :

```text
ORANGE_MONEY_CASHIN_TOKEN_URL
ORANGE_MONEY_CASHIN_URL
ORANGE_MONEY_CASHIN_API_KEY
ORANGE_MONEY_CASHIN_USERNAME
ORANGE_MONEY_CASHIN_PASSWORD
ORANGE_MONEY_AGENT_ALIAS
ORANGE_MONEY_AGENT_PIN
ORANGE_MONEY_PIN_PUBLIC_KEY_CONTAINER=/run/secrets/orange/pin_public_key.pem
```

## Compte super-admin

Un super-admin initial existe sur Hostinger :

```text
Email: admin@mynapay.com
Role: super_admin
Etat: actif
```

Ne pas documenter le mot de passe en clair. Apres premiere connexion, activer la 2FA depuis l'interface.
Le seed est referme avec `SEED_SUPER_ADMIN=false` et `SUPER_ADMIN_PASSWORD` vide.

## Deploiement applicatif

Depuis le VPS :

```bash
cd /opt/mynapay/app
bash deploy/hostinger/deploy-platform.sh
```

Validation avant demarrage :

```bash
cd /opt/mynapay/app
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml config --quiet
```

Logs utiles :

```bash
docker logs --tail 100 masspay_api
docker logs --tail 100 masspay_web
docker logs --tail 100 masspay_nginx
```

Redemarrer uniquement le backend :

```bash
cd /opt/mynapay/app
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate --no-deps backend
```

## TLS Let's Encrypt

La production utilise le challenge HTTP `webroot`.
Nginx sert le dossier `/opt/mynapay/certbot-www` sur `/.well-known/acme-challenge/`.

Emettre ou reconfigurer le certificat :

```bash
cd /opt/mynapay/app
EMAIL=admin@myna-etoile.com DOMAIN=pay.myna-etoile.com bash deploy/hostinger/issue-cert.sh
```

Verifier le certificat :

```bash
openssl x509 \
  -in /opt/mynapay/letsencrypt/live/pay.myna-etoile.com/fullchain.pem \
  -noout -subject -issuer -enddate
```

Tester le renouvellement automatique :

```bash
certbot renew --dry-run \
  --config-dir /opt/mynapay/letsencrypt \
  --work-dir /opt/mynapay/certbot-work \
  --logs-dir /opt/mynapay/certbot-logs
```

Le hook de renouvellement envoie `HUP` a `masspay_nginx` pour recharger le certificat sans interruption.

## VPN Orange BF

strongSwan est installe et actif sur le VPS.
Le firewall autorise :

```text
500/udp
4500/udp
ESP
```

Parametres Orange documentes :

```text
Gateway Orange: 197.239.106.3
Encryption domain Orange: 197.239.106.83/32, 197.239.106.84/32
Services Orange: tcp/8243, tcp/9443
IKEv2, PSK, AES-256, SHA-256, DH group 15, lifetime 86400
ESP, PFS group 15, AES-256, SHA-256, lifetime 3600
```

Fichier a partager avec Orange :

```text
deploy/vpn/mynapay-obf-vpn-parameters.txt
```

Configurer le tunnel apres reception/accord de la PSK :

```bash
export OBF_VPN_PSK='<psk-echangee-avec-orange>'
cd /opt/mynapay/app
bash deploy/vpn/setup-hostinger-obf.sh
```

Verifier :

```bash
ipsec statusall
journalctl -u strongswan-starter -n 100 --no-pager
```

## Orange CashIn

Le flux applicatif attendu est :

```text
MynaPay backend
  -> token Orange CashIn
  -> requete CASHIN avec PIN agent chiffre RSA
  -> Orange debite le compte/alias agent MynaPay
  -> Orange credite le beneficiaire
  -> MynaPay met a jour batch, wallet et transaction
```

Avant test reel :

```text
1. Tunnel IPsec etabli et confirme par Orange.
2. Credentials CashIn prod recus.
3. Certificats/cle publique PIN places dans /opt/mynapay/secrets/orange.
4. .env.prod complete avec les variables CashIn.
5. Healthcheck OK.
6. Test CashIn explicite avec montant minimal.
```

## Backups et base de donnees

Acceder a PostgreSQL local :

```bash
cd /opt/mynapay/app
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml exec postgres psql -U masspay -d masspay_bf
```

Dump manuel Hostinger :

```bash
cd /opt/mynapay/app
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U masspay -d masspay_bf --format=custom > /opt/mynapay/backups/masspay_$(date +%Y%m%d%H%M%S).dump
```

Avant suppression DigitalOcean, faire un dump final de l'ancienne base et decider explicitement :

```text
- soit restaurer les donnees historiques sur Hostinger,
- soit archiver le dump et repartir avec la nouvelle base Hostinger.
```

Aujourd'hui, la base Hostinger est initialisee et contient le super-admin cree pour cette production.

## DigitalOcean

DigitalOcean est un ancien environnement. Ne pas le supprimer tant que les points suivants ne sont pas termines :

```text
[x] DNS pay.myna-etoile.com vers Hostinger
[x] HTTPS Let's Encrypt sur Hostinger
[x] Healthcheck public OK
[x] Super-admin Hostinger cree et login teste
[ ] Backup final DigitalOcean pris
[ ] Decision prise sur migration ou archivage des donnees historiques
[ ] Tunnel VPN Orange etabli
[ ] Credentials CashIn Orange valides
[ ] Premier test CashIn reel valide
[ ] Snapshot final DigitalOcean conserve 7 a 14 jours
```

La procedure detaillee de retrait est dans `deploy/hostinger/digitalocean-retirement.md`.

## Commandes d'urgence

Verifier l'etat general :

```bash
systemctl status docker --no-pager
systemctl status strongswan-starter --no-pager
ufw status numbered
docker ps
curl -fsS https://pay.myna-etoile.com/health
```

Redemarrer toute la plateforme :

```bash
cd /opt/mynapay/app
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Arreter la plateforme sans supprimer les volumes :

```bash
cd /opt/mynapay/app
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml stop
```
