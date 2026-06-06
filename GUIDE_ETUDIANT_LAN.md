# ProjectFLOW — Côté étudiant + connexion WiFi local

Ce document résume **ce qui a été fait côté étudiant (backend)**, comment lancer
le projet et **se connecter à plusieurs sur le même WiFi pour utiliser le chat**.

Aucune ligne de CSS / mise en page n'a été modifiée. Le front utilise déjà des
URLs relatives (`/api/etudiant/...`, `/uploads/...`), donc il fonctionne tel quel
quand on accède au serveur depuis une autre machine du réseau.

---

## 1. Lancer en local

### a) Base de données (MySQL/MariaDB sur le port 3307)

Le `.env` pointe déjà sur le port **3307** (cohérent avec ta config qui évite le
conflit sur 3306).

```sql
CREATE DATABASE plateforme_projets CHARACTER SET utf8mb4;
CREATE USER 'pf'@'localhost' IDENTIFIED BY 'pf1234';
GRANT ALL ON plateforme_projets.* TO 'pf'@'localhost';
FLUSH PRIVILEGES;
```

Puis charger le schéma **et** le jeu de données de test :

```bash
mysql -u pf -p -P 3307 plateforme_projets < plateforme_projets.sql
mysql -u pf -p -P 3307 plateforme_projets < seed_etudiant.sql
```

### b) Serveur

```bash
npm install        # (déjà inclus dans le zip, mais au cas où)
npm run dev        # ou : npm start
```

Au démarrage, la console affiche directement les adresses à partager :

```
  Sur cette machine : http://localhost:5000
  Pour les autres (même WiFi) :
      http://192.168.x.x:5000
```

---

## 2. Se connecter à plusieurs (même WiFi) pour le chat

1. **Une seule machine** lance le serveur (= le « serveur » du groupe).
2. Sur cette machine, noter l'adresse `http://192.168.x.x:5000` affichée.
3. Les autres, connectés **au même WiFi**, ouvrent cette adresse + `/login.html`
   dans leur navigateur : `http://192.168.x.x:5000/login.html`.
4. **Chacun se connecte avec un compte étudiant DIFFÉRENT** (voir comptes ci-dessous).
5. Ils ouvrent le **même projet** → onglet **Chat** : les messages sont partagés
   en temps quasi réel (rafraîchissement à l'ouverture / envoi).

> Important : le faux « auto-login démo » est **désactivé** (`DEV_AUTO_LOGIN=false`
> dans `.env`). Sinon tout le monde serait vu comme le même étudiant et le chat
> n'aurait aucun sens. Pour revenir au mode solo (auto-connecté), mettre
> `DEV_AUTO_LOGIN=true`.

> Si une autre machine n'arrive pas à se connecter : autoriser le **port 5000**
> dans le pare-feu Windows de la machine serveur (réseau privé), et vérifier que
> le WiFi n'est pas en « isolation des clients ».

---

## 3. Comptes de test (créés par `seed_etudiant.sql`)

| Rôle           | Email                    | Mot de passe | Détail                     |
|----------------|--------------------------|--------------|----------------------------|
| Encadrant      | enc.demo@test.local      | enc123       | propriétaire des 2 projets |
| Étudiant (TL)  | etu.demo@test.local      | etu123       | Team Leader Groupe Alpha   |
| Étudiant       | etu.alpha@test.local     | etu123       | Groupe Alpha               |
| Étudiant       | etu.beta@test.local      | etu123       | Groupe Alpha               |
| Étudiant (TL)  | etu.gamma@test.local     | etu123       | Team Leader Groupe Beta    |

Deux projets sont créés :
- **Plateforme de gestion de projets** : 2 sujets → le Groupe Alpha (état
  « Proposé ») doit **choisir un sujet** (étape 4).
- **Refonte du portail étudiant** : 1 sujet, Groupe Beta déjà « En cours » avec
  une échéance dépassée → il bascule **automatiquement en « En retard »**.

---

## 4. Ce qui a été corrigé / ajouté côté étudiant (backend)

Tout est conforme au flow (étapes A→Z) et au cahier des charges. Testé de bout en
bout contre une vraie base MySQL.

**Corrections de bugs**
- Table `Notification` : ajout des colonnes `type` et `id_projet` (le code et le
  front les utilisaient mais elles n'existaient pas → plantage à la création de
  tâche). *(schéma + migration commentée dans `plateforme_projets.sql`)*
- Statut de livrable : l'encadrant écrivait `Rejete` alors que le front attend
  `Refuse` → les livrables refusés ne s'affichaient jamais. Aligné sur
  `Valide` / `Refuse` (`routes/encadrant.js`), et le dashboard tolère les deux.
- Téléchargement des documents/livrables : le front pointe `/uploads/<fichier>`
  alors que les fichiers sont rangés dans `/uploads/sujets` et
  `/uploads/livrables` → ajout d'un « fallthrough » statique côté serveur
  (`server.js`), sans toucher au front.
- Changement de mot de passe : utilise désormais le helper tolérant
  (clair ↔ bcrypt) au lieu de `bcrypt.compare` brut.

**Fonctionnalités ajoutées (transitions d'état du flow)**
- **Étape 4 — Choix du sujet** :
  - `GET  /api/etudiant/projects/:id/subjects` (liste des sujets + sujet choisi)
  - `POST /api/etudiant/groups/:groupId/subject` `{ id_sujet }` (Team Leader,
    autorisé seulement tant que le groupe est « Proposé »)
- **Étape 5 — Proposé → En cours** : automatique dès que le Team Leader crée un
  jalon ou une tâche.
- **Étape 6 — bascule automatique « En retard »** : recalculée à chaque lecture
  (dashboard, liste projets, détail projet, jalons) si une échéance de tâche, de
  jalon ou la date de fin globale est dépassée avec du travail non terminé.
  Retour automatique à « En cours » si tout repasse au vert.
- **Étape 8 — Marquer « Livré »** :
  - `POST /api/etudiant/groups/:groupId/deliver` (Team Leader, depuis
    En cours / En retard, au moins un livrable déposé)
- **Notifications** ajoutées : nouvelle tâche assignée (déjà présent), nouveau
  livrable déposé, nouveau message de chat, sujet choisi, groupe livré, et
  validation/refus d'un livrable par l'encadrant.

---

## 5. Côté FRONT : tout est câblé

Tout le parcours étudiant est fonctionnel de bout en bout (logique JS ajoutée
dans `public/etudiant/project.html`, sans casser la mise en page) :

- **Choix du sujet** (onglet Sujet) : si le groupe est « Proposé » et que le
  projet a plusieurs sujets, le Team Leader voit la liste des sujets + un bouton
  « Choisir ce sujet ».
- **Marquer « Livré »** (onglet Livrables) : bouton visible pour le Team Leader
  d'un groupe En cours / En retard.
- **Chat en direct** : à l'ouverture de l'onglet Chat, les messages se
  rafraîchissent automatiquement toutes les 4 s (on ne crée plus de notification
  par message). Le défilement ne te ramène en bas que si tu y étais déjà.
- **Livrables** : bouton de téléchargement, et suppression (déposant ou TL) pour
  pouvoir redéposer une nouvelle version.
- **Tâches** : le Team Leader peut supprimer une tâche directement depuis la
  liste (le backend gère aussi la modification d'une tâche).
