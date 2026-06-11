# MynaPay BF — Plateforme de virement en masse

Plateforme B2B multi-tenant de disbursement mobile money (Orange Money + Moov Money) pour le Burkina Faso.

## Architecture

```
mynapay-platform/
├── backend/          Go 1.25 + Gin + PostgreSQL + Redis
├── frontend/         Next.js 16 + TypeScript + Tailwind CSS
└── docker-compose.yml
```

## Stack

| Couche       | Technologie                          |
|--------------|--------------------------------------|
| Backend      | Go 1.25 · Gin · GORM · JWT           |
| Base données | PostgreSQL 16                        |
| Cache/Queue  | Redis 7                              |
| Frontend     | Next.js 16 · TypeScript · Tailwind   |
| Mobile (à venir) | Flutter                          |
| Paiements    | Orange Money BF · Moov Africa BF     |

---

## Démarrage local recommandé (Windows/dev)

Le mode le plus stable en développement garde PostgreSQL et Redis dans Docker, puis lance le backend et le frontend depuis le code local.
Cela évite les images Docker applicatives obsolètes et les conflits autour du port `8080`.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

- Frontend : http://localhost:3000
- Backend API : http://localhost:18080
- Health check : http://localhost:18080/health
- Logs : `%TEMP%\mass_pay-local`

Pour arrêter les processus locaux :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-local.ps1 -Stop
```

---

## Démarrage rapide (Docker complet)

```bash
cp .env.example .env
# Renseigner les variables (JWT_SECRET obligatoire)
docker-compose up -d
```

- Frontend : http://localhost:3000
- Backend API : http://localhost:8080
- Health check : http://localhost:8080/health
- Compte super admin dev : `admin@mynapay.bf` / `MynaPay@2026!`

Si l'interface ne correspond pas au code local, reconstruire et recréer les services applicatifs :

```bash
docker-compose up -d --build --force-recreate backend frontend
```

---

## Déploiement en ligne

La production officielle MynaPay est le VPS Hostinger KVM2 `187.127.233.228`, exposee via `https://pay.myna-etoile.com`.
Le runbook complet est dans `deploy/hostinger/PRODUCTION.md`.

Le déploiement production utilise le compose de base plus l'override prod. PostgreSQL, Redis, le backend et le frontend restent liés à `127.0.0.1`; nginx expose seul les ports `80` et `443`.

```bash
cp .env.prod.example .env.prod
# Renseigner les secrets, Orange Money et les chemins de certificats
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Sur le VPS Hostinger, utiliser plutot :

```bash
cd /opt/mynapay/app
bash deploy/hostinger/deploy-platform.sh
curl -fsS https://pay.myna-etoile.com/health
```

Pour Orange Money BF en production, `ORANGE_MONEY_CERTS_DIR` doit pointer vers un dossier hors Git contenant exactement :

```text
star_orange_bf.pem
OrangeBFV22026.key
pin_public_key.pem
```

Le flux Orange actif est `CASHIN` :

```text
MynaPay -> GET API TOKEN
MynaPay -> POST CASHIN
Orange débite le compte Agent/Alias MynaPay
Orange crédite le MSISDN bénéficiaire
MynaPay règle le wallet interne selon le résultat opérateur
```

Les URLs `ORANGE_MONEY_CASHIN_TOKEN_URL` et `ORANGE_MONEY_CASHIN_URL` sont indiquées `To be defined` dans la documentation CASHIN : elles doivent être confirmées par OMBF avant tout test réel.

Le test Orange est volontairement non transactionnel par défaut :

```bash
cd backend
go run ./cmd/test_orange
# Test réel explicite, montant minimal
go run ./cmd/test_orange --send --phone <MSISDN> --amount 1
```

---

## Démarrage manuel

### Backend

```bash
cd backend
# Charger les variables depuis ../.env ou créer backend/.env
go mod tidy
PORT=18080 go run cmd/server/main.go
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Sur Windows, le script `npm run dev` force Webpack pour éviter les bindings natifs Turbopack manquants.

---

## Modèle économique

- Commission plateforme : **1.5%** sur la masse totale transférée
- Provision requise = masse + 1.5%
- Exemple : 10 bénéficiaires × 50 000 FCFA = 500 000 FCFA masse
  → Commission : 7 500 FCFA → Provision : **507 500 FCFA**

---

## Flux batch

```
Créer batch (draft)
  → Provision réservée sur wallet
  → Statut : draft

Valider batch
  → Double approbation si provision ≥ seuil
  → Statut : validated

Exécuter batch
  → Commission définitivement prélevée
  → Jobs poussés dans Redis queue
  → Statut : processing

Worker Go (goroutines)
  → Appel API Orange Money / Moov Money par item
  → Retry exponentiel (3 tentatives max)
  → Remboursement automatique si échec définitif
  → Statut final : completed | failed
```

---

## Hiérarchie des rôles

| Rôle              | Périmètre                                  |
|-------------------|--------------------------------------------|
| `super_admin`     | Tous les tenants — création KYB activation |
| `tenant_admin`    | Son tenant — créer + valider + exécuter    |
| `tenant_manager`  | Créer batchs + gérer bénéficiaires         |
| `tenant_auditor`  | Lecture seule                              |

---

## Endpoints API principaux

```
POST   /api/v1/auth/login
GET    /api/v1/auth/me

GET    /api/v1/admin/stats
GET    /api/v1/admin/tenants
POST   /api/v1/admin/tenants
PATCH  /api/v1/admin/tenants/:id/activate

GET    /api/v1/tenant/dashboard
GET    /api/v1/tenant/wallet
GET    /api/v1/tenant/batches
POST   /api/v1/tenant/batches
GET    /api/v1/tenant/batches/:id
POST   /api/v1/tenant/batches/:id/validate
POST   /api/v1/tenant/batches/:id/execute
GET    /api/v1/tenant/beneficiaries
POST   /api/v1/tenant/beneficiaries
DELETE /api/v1/tenant/beneficiaries/:id
```

---

## Variables d'environnement critiques

```env
JWT_SECRET=         # min 32 caractères — OBLIGATOIRE
FIELD_ENCRYPTION_KEY= # 64 caractères hex — obligatoire en production
DB_PASSWORD=        # mot de passe PostgreSQL Docker
REDIS_PASSWORD=     # mot de passe Redis Docker
SEED_SUPER_ADMIN=   # true en dev Docker, false recommandé en production
SUPER_ADMIN_EMAIL=
SUPER_ADMIN_PASSWORD=
ORANGE_MONEY_ENV=production
ORANGE_MONEY_MERCHANT_MSISDN=
ORANGE_MONEY_API_USERNAME=
ORANGE_MONEY_API_PASSWORD=
ORANGE_MONEY_CASHIN_TOKEN_URL=
ORANGE_MONEY_CASHIN_URL=
ORANGE_MONEY_CASHIN_API_KEY=
ORANGE_MONEY_AGENT_ALIAS=
ORANGE_MONEY_AGENT_PIN=
ORANGE_MONEY_PIN_PUBLIC_KEY=./certs/orange/pin_public_key.pem
ORANGE_MONEY_CERTS_DIR=./certs/orange
MOOV_USERNAME=
MOOV_PASSWORD=
DEFAULT_COMMISSION_RATE=0.015
```

---

## Roadmap V2

- [ ] Import CSV bénéficiaires (endpoint + parsing)
- [ ] Export PDF rapport batch
- [ ] Déclarations masse salariale (CNSS)
- [ ] App Flutter agents terrain
- [ ] Webhook notifications (batch terminé)
- [ ] Intégration bancaire (Coris Bank, BOA)
