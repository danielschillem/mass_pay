# Roadmap globale MynaPay BF

## Phase 1 : Stabilisation MVP

- Finaliser le rebranding complet vers `MynaPay`.
- Corriger les textes mal encodés : accents, apostrophes et caractères spéciaux.
- Nettoyer `docker-compose.yml` : retirer l'attribut obsolète `version` et harmoniser les noms si besoin.
- Ajouter un seed officiel pour le compte `super_admin`.
- Documenter les accès de développement et le démarrage local.
- Ajouter des tests backend sur l'authentification, les tenants, le wallet et les batchs.
- Ajouter une validation frontend claire sur les formulaires critiques.

## Phase 2 : Expérience admin

- Finaliser le tableau de bord super admin.
- Ajouter une gestion KYB détaillée : documents, statuts, commentaires et historique.
- Permettre la création, modification, suspension et activation des tenants.
- Ajouter la recharge wallet tenant depuis l'espace admin.
- Ajouter une vue globale des volumes, commissions, tenants actifs et alertes.
- Ajouter la gestion des administrateurs tenant.

## Phase 3 : Expérience tenant

- Finaliser le dashboard tenant : solde, batchs récents, échecs et volume mensuel.
- Compléter la gestion des bénéficiaires.
- Ajouter un import CSV robuste avec prévisualisation et erreurs ligne par ligne.
- Finaliser la création de batch assistée en plusieurs étapes.
- Ajouter les parcours de validation et d'exécution des batchs.
- Compléter l'historique détaillé des virements.
- Ajouter les exports CSV et PDF des rapports.

## Phase 4 : Paiements et fiabilité

- Intégrer Orange Money BF en environnement réel.
- Intégrer Moov Money BF en environnement réel.
- Ajouter les webhooks opérateurs.
- Stabiliser le retry automatique des virements.
- Ajouter la réconciliation des transactions.
- Journaliser toutes les opérations sensibles.
- Ajouter des alertes sur les échecs, les délais et les soldes faibles.

## Phase 5 : Sécurité et production

- Ajouter les refresh tokens.
- Prévoir la rotation du secret JWT.
- Renforcer le RBAC par rôle.
- Rendre la double validation configurable par tenant.
- Ajouter du rate limiting sur l'API.
- Mettre en place des logs structurés.
- Ajouter le monitoring API, PostgreSQL, Redis et workers.
- Mettre en place les backups PostgreSQL.
- Ajouter une CI/CD GitHub Actions.
- Structurer les environnements `dev`, `staging` et `prod`.

## Phase 6 : Produit avancé

- Prévoir le multi-devise si le marché le demande.
- Ajouter une application mobile agents ou terrain.
- Ajouter une API publique pour intégration ERP et paie.
- Ajouter des webhooks clients.
- Ajouter les notifications email, SMS ou WhatsApp.
- Ajouter la facturation automatique des commissions.
- Ajouter les rapports financiers mensuels.
- Ajouter un module conformité et audit exportable.

## Priorités immédiates

1. Corriger les textes et l'encodage, puis finaliser `MynaPay` partout.
2. Ajouter un seed `super_admin` propre et reproductible.
3. Stabiliser Docker et le démarrage local.
4. Sécuriser l'authentification et les rôles.
5. Finaliser les parcours admin et tenant critiques.
