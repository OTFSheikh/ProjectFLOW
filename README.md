# ProjectFLOW

Plateforme de gestion et suivi des projets étudiants.

## Installation et lancement

```bash
git clone <url-du-repo>
cd ProjectFLOW
npm install
npm run dev
```

## Base de données

La base a changé : il faut supprimer l'ancienne et la recréer avec le nouveau schéma.

```sql
DROP DATABASE IF EXISTS plateforme_projets;
CREATE DATABASE plateforme_projets;
```

```bash
mysql -u root -p plateforme_projets < plateforme_projets.sql
```

## Connexion admin

- Page : http://localhost:5000/login.html
- Email : `admin@plateforme.local`
- Mot de passe : `admin123`
- Rôle : Admin

Une fois connecté, tu es redirigé vers le dashboard admin.
