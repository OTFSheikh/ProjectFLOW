# ProjectFLOW

Plateforme de gestion et de suivi des projets étudiants (encadrants, étudiants, admin).

## Stack technique

- **Backend** : Node.js + Express
- **Base de données** : MySQL / MariaDB (InnoDB)
- **Temps réel** : Socket.IO (chat de groupe + notifications)
- **Sessions** : express-session (partagées avec Socket.IO)
- **Emails** : Nodemailer (activation de compte, mot de passe oublié)
- **Front** : HTML/CSS/JS statiques servis depuis `public/`

## Installation et lancement

```bash
git clone <url-du-repo>
cd ProjectFLOW
npm install
npm run dev
```

Le serveur écoute sur `http://localhost:5000` (et sur les IP du réseau local pour un accès WiFi multi-postes).

## Configuration (`.env`)

Crée un fichier `.env` à la racine :

```env
# Base de données
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=ton_mot_de_passe
DB_NAME=plateforme_projets

# Serveur
PORT=5000
SESSION_SECRET=une_chaine_secrete
APP_URL=http://localhost:5000

# Connexion automatique en démo solo (désactivé par défaut)
DEV_AUTO_LOGIN=false

# Emails (optionnel : sans ces variables, les emails sont juste loggés)
SMTP_HOST=smtp.exemple.com
SMTP_PORT=587
SMTP_USER=ton_email
SMTP_PASS=ton_mot_de_passe_smtp
```

## Base de données

Importe le schéma depuis `plateforme_projets.sql`. Si tu pars d'une ancienne version, supprime l'ancienne base puis recrée-la avec ce schéma.

```bash
mysql -u root -p plateforme_projets < plateforme_projets.sql
```

## Jeu de données de démonstration (seed)

Le script `seed.js` remplit la base avec un jeu de données réaliste et volumineux (encadrants, étudiants, projets, groupes, jalons, tâches, livrables, messages, évaluations, notifications) — pratique pour les démonstrations et les tests.

```bash
node seed.js
```

Ce qu'il faut savoir :

- **Prérequis** : la base doit déjà exister avec le schéma (`plateforme_projets.sql` importé) et le `.env` doit être configuré. Le script lit la connexion depuis le `.env`.
- **Reset** : à chaque exécution, le script **vide toutes les données SAUF le compte admin**, puis régénère un nouveau jeu. Il est donc rejouable.
- **Mot de passe commun** : tous les comptes générés utilisent le mot de passe `demo123`. Les emails suivent le format `prenom.nom@isen.demo`.
- **Volumes** : ajustables en haut du fichier `seed.js` (nombre d'étudiants, de groupes par projet, etc.).

Comptes utiles après le seed (mot de passe `demo123`) :

- Encadrant : `awa.diallo@isen.demo`
- Étudiant (Team Leader) : `yanis.cisse@isen.demo`
- Admin : `admin@plateforme.local` / `admin123`

> ⚠️ Le seed est destiné au développement / à la démo. Ne le lance pas sur une base de production : il supprime les données existantes.

## Connexion admin

- Page : http://localhost:5000/login.html
- Email : `admin@plateforme.local`
- Mot de passe : `admin123`
- Rôle : Admin

Une fois connecté, tu es redirigé vers le dashboard admin.

## Rôles

- **Admin** : gestion des utilisateurs (création, activation/désactivation).
- **Encadrant** : crée des projets, des groupes, des sujets, des critères d'évaluation ; suit les groupes, valide les livrables, note les groupes.
- **Étudiant** : rejoint un groupe, gère jalons/tâches, dépose des livrables, échange dans le chat de groupe.

## Messagerie temps réel

Le chat est organisé en **un fil par groupe**, partagé entre :

- les **étudiants membres** du groupe (table `Membre_de`) ;
- l'**encadrant propriétaire** du projet auquel le groupe appartient.

Caractéristiques :

- **Temps réel** via Socket.IO : chaque client rejoint le salon `group:<id>` (après vérification d'accès) et reçoit les messages instantanément. Chaque utilisateur rejoint aussi un salon personnel `user:<id>` pour ses notifications.
- **Notifications** : quand l'**encadrant** poste un message, tous les membres du groupe reçoivent une notification (persistée + poussée en direct). Les messages entre étudiants ne génèrent pas de notification (anti-bruit).
- **Suppression** :
  - un étudiant ne peut supprimer que **ses propres** messages ;
  - l'encadrant propriétaire peut supprimer **n'importe quel** message du groupe (modération).
  - La suppression est répercutée en direct chez tous les participants.

Les autorisations sont toujours vérifiées côté serveur ; les boutons du front ne sont qu'un confort.

## Structure du projet

```
server.js              # Point d'entrée : Express, sessions, Socket.IO, auth
routes/
  admin.js             # Gestion des utilisateurs
  encadrant.js         # Projets, groupes, sujets, évaluations, chat, livrables
  etudiant.js          # Projets/groupes de l'étudiant, jalons/tâches, chat, notifications
middleware/auth.js     # Contrôle d'accès par rôle
utils/
  password.js          # Hash / comparaison bcrypt (fallback clair pour la migration)
  mailer.js            # Emails d'activation et de réinitialisation
public/                # Front statique (admin / encadrant / etudiant)
plateforme_projets.sql # Schéma de la base
seed.js                # Jeu de données de démonstration (reset + remplissage)
```
