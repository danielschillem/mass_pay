# Roadmap Globale MynaPay BF

## Phase 1 : Stabilisation MVP

- Finaliser le rebranding complet `MassPay` vers `MynaPay`.
- Corriger les textes mal encodes : accents, apostrophes et caracteres speciaux.
- Nettoyer `docker-compose.yml` : retirer l'attribut obsolete `version` et harmoniser les noms si besoin.
- Ajouter un seed officiel pour le compte `super_admin`.
- Documenter les acces de developpement et le demarrage local.
- Ajouter des tests backend sur l'authentification, les tenants, le wallet et les batchs.
- Ajouter une validation frontend claire sur les formulaires critiques.

## Phase 2 : Experience Admin

- Finaliser le tableau de bord super admin.
- Ajouter une gestion KYB detaillee : documents, statuts, commentaires et historique.
- Permettre la creation, modification, suspension et activation des tenants.
- Ajouter la recharge wallet tenant depuis l'espace admin.
- Ajouter une vue globale des volumes, commissions, tenants actifs et alertes.
- Ajouter la gestion des administrateurs tenant.

## Phase 3 : Experience Tenant

- Finaliser le dashboard tenant : solde, batchs recents, echecs et volume mensuel.
- Completer la gestion des beneficiaires.
- Ajouter un import CSV robuste avec previsualisation et erreurs ligne par ligne.
- Finaliser la creation de batch assistee en plusieurs etapes.
- Ajouter les parcours de validation et d'execution des batchs.
- Completer l'historique detaille des virements.
- Ajouter les exports CSV et PDF des rapports.

## Phase 4 : Paiements et Fiabilite

- Integrer Orange Money BF en environnement reel.
- Integrer Moov Money BF en environnement reel.
- Ajouter les webhooks operateurs.
- Stabiliser le retry automatique des virements.
- Ajouter la reconciliation des transactions.
- Journaliser toutes les operations sensibles.
- Ajouter des alertes sur les echecs, les delais et les soldes faibles.

## Phase 5 : Securite et Production

- Ajouter les refresh tokens.
- Prevoir la rotation du secret JWT.
- Renforcer le RBAC par role.
- Rendre la double validation configurable par tenant.
- Ajouter du rate limiting sur l'API.
- Mettre en place des logs structures.
- Ajouter le monitoring API, PostgreSQL, Redis et workers.
- Mettre en place les backups PostgreSQL.
- Ajouter une CI/CD GitHub Actions.
- Structurer les environnements `dev`, `staging` et `prod`.

## Phase 6 : Produit Avance

- Prevoir le multi-devise si le marche le demande.
- Ajouter une application mobile agents ou terrain.
- Ajouter une API publique pour integration ERP et paie.
- Ajouter des webhooks clients.
- Ajouter les notifications email, SMS ou WhatsApp.
- Ajouter la facturation automatique des commissions.
- Ajouter les rapports financiers mensuels.
- Ajouter un module conformite et audit exportable.

## Priorites Immediates

1. Corriger les textes et l'encodage, puis finaliser `MynaPay` partout.
2. Ajouter un seed `super_admin` propre et reproductible.
3. Stabiliser Docker et le demarrage local.
4. Securiser l'authentification et les roles.
5. Finaliser les parcours admin et tenant critiques.
