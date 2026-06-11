# Retrait DigitalOcean apres migration Hostinger

Ce fichier sert de garde-fou. Ne supprimer DigitalOcean qu'apres validation complete sur Hostinger.
La production cible officielle est Hostinger KVM2, documentee dans `deploy/hostinger/PRODUCTION.md`.

## Etat de migration au 11 juin 2026

```text
[x] Hostinger KVM2 provisionne
[x] DNS pay.myna-etoile.com -> 187.127.233.228
[x] HTTPS Let's Encrypt valide sur Hostinger
[x] Plateforme Docker active sur Hostinger
[x] Healthcheck public OK
[x] Super-admin Hostinger cree
[ ] Backup final DigitalOcean
[ ] Choix migration ou archivage des anciennes donnees
[ ] Tunnel VPN Orange etabli
[ ] Credentials CashIn Orange valides
[ ] Premier CashIn reel valide
```

## 1. Inventaire DigitalOcean

Completer avant action :

```text
Droplet name:
Droplet public IP:
Region:
Volumes attaches:
Snapshots existants:
Managed DB:
Spaces/S3:
DNS zone:
Firewall:
Load balancer:
```

## 2. Backup obligatoire

PostgreSQL :

```bash
pg_dump --format=custom --file=masspay_do_final.dump "$DATABASE_URL"
```

Fichiers applicatifs a verifier :

```text
.env.prod
certificats Orange
uploads/
backups/
logs utiles
```

## 3. Migration vers Hostinger

Sur Hostinger :

```bash
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml ps
curl -fsS https://pay.myna-etoile.com/health
```

Verifier dans l'application :

```text
- login super admin
- tenants visibles
- wallet/batches visibles
- worker running
- email transactionnel
- VPN OBF up
- premier test CASHIN valide
```

## 4. Bascule DNS

```text
pay.myna-etoile.com -> 187.127.233.228
TTL temporaire recommande: 300 secondes
```

Le DNS pointe deja vers Hostinger. Conserver DigitalOcean actif jusqu'au backup final, a la decision sur les donnees historiques et a la validation CashIn.

## 5. Arret DigitalOcean

Ordre recommande :

```text
1. Stopper backend/worker sur DigitalOcean
2. Garder PostgreSQL en lecture seule ou stoppe apres backup final
3. Creer snapshot final
4. Attendre 7 a 14 jours
5. Supprimer Droplet/Volumes/Load balancer inutiles
6. Supprimer DNS/firewall DO uniquement si plus utilises
```

## 6. Points de non-retour

Ne pas supprimer tant que :

```text
- le dump DB n'a pas ete teste
- les uploads ne sont pas copies
- le tunnel Orange n'est pas stable
- les credentials CASHIN ne sont pas valides sur Hostinger
- le premier test CASHIN reel n'est pas valide
```
