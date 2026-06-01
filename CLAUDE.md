# CLAUDE.md

## Projet

ProjectFLOW — Plateforme de gestion et suivi des projets étudiants.

**Stack :**
- Backend : Node.js + Express (server.js, routes modulaires)
- Frontend : HTML / CSS / JS pur (PAS de React, pas de framework front)
- Base de données : MySQL (schéma dans plateforme_projets.sql)
- Sessions : express-session (cookie, stockage mémoire)
- Mail : nodemailer configuré avec Gmail (SMTP)

## État d'avancement

### Fait
- Page d'accueil (public/index.html)
- Page de connexion (public/login.html) avec sélection de rôle
- Authentification backend (login/logout/session)
- Dashboard admin complet :
  - Liste des utilisateurs avec filtres (rôle, recherche)
  - Ajout d'utilisateur (étudiant/encadrant/admin) avec envoi de mail d'activation
  - Modification d'utilisateur
  - Activation/désactivation de compte (pas de suppression)
- Page d'activation de compte par token (public/activate.html)
- Schéma SQL complet avec toutes les tables et FK

### Reste à faire
- Dashboard encadrant (création projets, sujets, groupes, évaluation)
- Dashboard étudiant (vue tâches, dépôt livrables, messagerie)
- Messagerie de groupe
- Notifications
- Gestion des jalons/tâches

## Structure des dossiers

```
ProjectFLOW/
├── server.js              # Point d'entrée Express + auth routes
├── routes/                # Routes API par module
│   └── admin.js           # CRUD utilisateurs admin
├── middleware/
│   └── auth.js            # Middleware requireAdmin
├── utils/
│   ├── mailer.js          # Envoi mail Gmail, fallback console
│   └── password.js        # hashPassword/comparePassword (en clair pour l'instant)
├── public/                # Fichiers statiques servis par express.static
│   ├── index.html
│   ├── login.html
│   ├── activate.html
│   └── admin/
│       └── dashboard.html
├── plateforme_projets.sql
├── .env
└── package.json
```

## Conventions

### Palette de couleurs (définie dans login.html et réutilisée partout)
- Primary : #FF8904 (orange)
- Primary dark : #FFB86A
- Primary light : #dbeafe
- Secondary : #10b981 (vert)
- Danger : #ef4444 (rouge)
- Grays : #111827 à #f9fafb

### Mots de passe
Stockés EN CLAIR pour l'instant (phase dev). La logique est isolée dans utils/password.js — quand on passera à bcrypt il suffira de modifier ces 2 fonctions.

### API
- Toutes les routes admin : `/api/admin/*` (protégées par middleware session)
- Auth : `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/activate`
- Requêtes préparées partout (anti-injection SQL)

## Règles métier (base de données)

- Table Utilisateur : 3 booléens `est_etudiant`, `est_encadrant`, `est_admin` avec CHECK : exactement un seul = TRUE
- Pas de suppression d'utilisateurs : on désactive (`est_actif = FALSE`)
- Activation par token : colonnes `token_activation` (VARCHAR 64) + `token_expiration` (DATETIME, 48h)
- Un utilisateur créé par l'admin a `mot_de_passe = NULL` et `est_actif = FALSE` jusqu'à activation
- FK `Projet.id_utilisateur` → `Utilisateur` avec ON DELETE RESTRICT (impossible de supprimer un user qui a des projets)
- Classes étudiants : valeurs exactes ISEN 1, ISEN 2, ISEN 3, ISEN 4, ISEN 5

## Prochaine session

- Implémenter le dashboard encadrant :
  - Création/gestion de projets
  - Ajout de sujets avec documents
  - Création de groupes et assignation d'étudiants
  - Désignation des team leaders
  - Grille d'évaluation et notation
