# MynaPay BF — Plateforme de virement en masse

Plateforme B2B multi-tenant de disbursement mobile money (Orange Money + Moov Money) pour le Burkina Faso.

## Architecture

```
masspay-platform/
├── backend/          Go 1.22 + Gin + PostgreSQL + Redis
├── frontend/         Next.js 15 + TypeScript + Tailwind CSS
└── docker-compose.yml
```

## Stack

| Couche       | Technologie                          |
|--------------|--------------------------------------|
| Backend      | Go 1.22 · Gin · GORM · JWT           |
| Base données | PostgreSQL 16                        |
| Cache/Queue  | Redis 7                              |
| Frontend     | Next.js 15 · TypeScript · Tailwind   |
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
- API docs : http://localhost:8080/health

Si l'interface ne correspond pas au code local, reconstruire et recréer les services applicatifs :

```bash
docker-compose up -d --build --force-recreate backend frontend
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
DATABASE_URL=       # PostgreSQL DSN
REDIS_URL=          # Redis URL
ORANGE_API_KEY=     # Clé API Orange Money BF
MOOV_API_KEY=       # Clé API Moov Africa BF
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
