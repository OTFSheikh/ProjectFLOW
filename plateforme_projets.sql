-- ============================================================
-- Plateforme de gestion et suivi des projets étudiants
-- Base de données complète (MySQL / MariaDB - InnoDB)
-- ============================================================

-- ============================================================
-- Création des tables
-- ============================================================

CREATE TABLE Utilisateur (
  id_utilisateur INT AUTO_INCREMENT NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  mot_de_passe VARCHAR(255) NULL,
  date_inscription DATETIME DEFAULT CURRENT_TIMESTAMP,
  est_actif BOOLEAN NOT NULL DEFAULT FALSE,
  est_etudiant BOOLEAN NOT NULL DEFAULT FALSE,
  classe VARCHAR(50) NULL,
  est_encadrant BOOLEAN NOT NULL DEFAULT FALSE,
  matiere VARCHAR(100) NULL,
  est_admin BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id_utilisateur),
  CHECK (est_etudiant + est_encadrant + est_admin = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Projet (
  id_projet INT AUTO_INCREMENT NOT NULL,
  nom VARCHAR(150) NOT NULL,
  description TEXT,
  date_debut DATE NOT NULL,
  date_fin DATE NOT NULL,
  etat VARCHAR(50) NOT NULL DEFAULT 'Ouvert',
  promo VARCHAR(50) NULL,
  id_utilisateur INT NOT NULL,
  PRIMARY KEY (id_projet)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Sujet (
  id_sujet INT AUTO_INCREMENT NOT NULL,
  titre VARCHAR(150) NOT NULL,
  description TEXT,
  id_projet INT NOT NULL,
  PRIMARY KEY (id_sujet)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Document_sujet (
  id_document INT AUTO_INCREMENT NOT NULL,
  nom_fichier VARCHAR(255) NOT NULL,
  chemin_fichier VARCHAR(255) NOT NULL,
  date_upload DATETIME DEFAULT CURRENT_TIMESTAMP,
  id_sujet INT NOT NULL,
  PRIMARY KEY (id_document)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Groupe (
  id_groupe INT AUTO_INCREMENT NOT NULL,
  nom VARCHAR(100) NOT NULL,
  etat VARCHAR(50) NOT NULL DEFAULT 'Propose',
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  id_projet INT NOT NULL,
  id_sujet INT NULL,
  PRIMARY KEY (id_groupe)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Membre_de (
  id_utilisateur INT NOT NULL,
  id_groupe INT NOT NULL,
  est_team_leader BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id_utilisateur, id_groupe)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Jalon (
  id_jalon INT AUTO_INCREMENT NOT NULL,
  titre VARCHAR(150) NOT NULL,
  description TEXT,
  date_limite DATETIME NOT NULL,
  id_groupe INT NOT NULL,
  PRIMARY KEY (id_jalon)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Tache (
  id_tache INT AUTO_INCREMENT NOT NULL,
  titre VARCHAR(150) NOT NULL,
  description TEXT,
  date_limite DATETIME NOT NULL,
  priorite VARCHAR(50) NOT NULL DEFAULT 'Moyenne',
  statut VARCHAR(50) NOT NULL DEFAULT 'A_faire',
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  id_jalon INT NOT NULL,
  PRIMARY KEY (id_tache)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Assigne_a (
  id_utilisateur INT NOT NULL,
  id_tache INT NOT NULL,
  PRIMARY KEY (id_utilisateur, id_tache)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Livrable (
  id_livrable INT AUTO_INCREMENT NOT NULL,
  nom VARCHAR(150) NOT NULL,
  chemin_fichier VARCHAR(255) NOT NULL,
  date_depot DATETIME DEFAULT CURRENT_TIMESTAMP,
  statut_validation VARCHAR(50) NOT NULL DEFAULT 'En_attente',
  commentaire_validation TEXT,
  date_validation DATETIME,
  id_tache INT NULL,
  id_groupe INT NULL,
  id_etudiant_deposant INT NOT NULL,
  id_encadrant_validant INT NULL,
  PRIMARY KEY (id_livrable),
  CHECK ((id_tache IS NULL) <> (id_groupe IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Commentaire (
  id_commentaire INT AUTO_INCREMENT NOT NULL,
  contenu TEXT NOT NULL,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  id_utilisateur INT NOT NULL,
  id_tache INT NULL,
  id_livrable INT NULL,
  PRIMARY KEY (id_commentaire),
  CHECK ((id_tache IS NULL) <> (id_livrable IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Message (
  id_message INT AUTO_INCREMENT NOT NULL,
  contenu TEXT NOT NULL,
  date_envoi DATETIME DEFAULT CURRENT_TIMESTAMP,
  id_utilisateur INT NOT NULL,
  id_groupe INT NOT NULL,
  PRIMARY KEY (id_message)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Notification (
  id_notification INT AUTO_INCREMENT NOT NULL,
  contenu TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'systeme',
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  lu BOOLEAN NOT NULL DEFAULT FALSE,
  id_utilisateur INT NOT NULL,
  id_projet INT NULL,
  PRIMARY KEY (id_notification)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Critere_evaluation (
  id_critere INT AUTO_INCREMENT NOT NULL,
  nom VARCHAR(100) NOT NULL,
  ponderation DECIMAL(5,2) NOT NULL,
  description TEXT,
  id_projet INT NOT NULL,
  PRIMARY KEY (id_critere)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Evaluation (
  id_evaluation INT AUTO_INCREMENT NOT NULL,
  commentaire_global TEXT,
  date_evaluation DATETIME DEFAULT CURRENT_TIMESTAMP,
  note_finale DECIMAL(5,2),
  id_groupe INT NOT NULL,
  PRIMARY KEY (id_evaluation),
  UNIQUE (id_groupe)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE Note_sur (
  id_evaluation INT NOT NULL,
  id_critere INT NOT NULL,
  note DECIMAL(5,2) NOT NULL,
  PRIMARY KEY (id_evaluation, id_critere)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Clés étrangères
-- ============================================================

ALTER TABLE Projet ADD CONSTRAINT fk_projet_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur (id_utilisateur) ON DELETE RESTRICT;

ALTER TABLE Sujet ADD CONSTRAINT fk_sujet_projet FOREIGN KEY (id_projet) REFERENCES Projet (id_projet) ON DELETE CASCADE;

ALTER TABLE Document_sujet ADD CONSTRAINT fk_document_sujet FOREIGN KEY (id_sujet) REFERENCES Sujet (id_sujet) ON DELETE CASCADE;

ALTER TABLE Groupe ADD CONSTRAINT fk_groupe_projet FOREIGN KEY (id_projet) REFERENCES Projet (id_projet) ON DELETE CASCADE;
ALTER TABLE Groupe ADD CONSTRAINT fk_groupe_sujet FOREIGN KEY (id_sujet) REFERENCES Sujet (id_sujet) ON DELETE SET NULL;

ALTER TABLE Membre_de ADD CONSTRAINT fk_membre_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur (id_utilisateur) ON DELETE CASCADE;
ALTER TABLE Membre_de ADD CONSTRAINT fk_membre_groupe FOREIGN KEY (id_groupe) REFERENCES Groupe (id_groupe) ON DELETE CASCADE;

ALTER TABLE Jalon ADD CONSTRAINT fk_jalon_groupe FOREIGN KEY (id_groupe) REFERENCES Groupe (id_groupe) ON DELETE CASCADE;

ALTER TABLE Tache ADD CONSTRAINT fk_tache_jalon FOREIGN KEY (id_jalon) REFERENCES Jalon (id_jalon) ON DELETE CASCADE;

ALTER TABLE Assigne_a ADD CONSTRAINT fk_assigne_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur (id_utilisateur) ON DELETE CASCADE;
ALTER TABLE Assigne_a ADD CONSTRAINT fk_assigne_tache FOREIGN KEY (id_tache) REFERENCES Tache (id_tache) ON DELETE CASCADE;

ALTER TABLE Livrable ADD CONSTRAINT fk_livrable_tache FOREIGN KEY (id_tache) REFERENCES Tache (id_tache) ON DELETE CASCADE;
ALTER TABLE Livrable ADD CONSTRAINT fk_livrable_groupe FOREIGN KEY (id_groupe) REFERENCES Groupe (id_groupe) ON DELETE CASCADE;
ALTER TABLE Livrable ADD CONSTRAINT fk_livrable_etudiant FOREIGN KEY (id_etudiant_deposant) REFERENCES Utilisateur (id_utilisateur) ON DELETE CASCADE;
ALTER TABLE Livrable ADD CONSTRAINT fk_livrable_encadrant FOREIGN KEY (id_encadrant_validant) REFERENCES Utilisateur (id_utilisateur) ON DELETE SET NULL;

ALTER TABLE Commentaire ADD CONSTRAINT fk_commentaire_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur (id_utilisateur) ON DELETE CASCADE;
ALTER TABLE Commentaire ADD CONSTRAINT fk_commentaire_tache FOREIGN KEY (id_tache) REFERENCES Tache (id_tache) ON DELETE CASCADE;
ALTER TABLE Commentaire ADD CONSTRAINT fk_commentaire_livrable FOREIGN KEY (id_livrable) REFERENCES Livrable (id_livrable) ON DELETE CASCADE;

ALTER TABLE Message ADD CONSTRAINT fk_message_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur (id_utilisateur) ON DELETE CASCADE;
ALTER TABLE Message ADD CONSTRAINT fk_message_groupe FOREIGN KEY (id_groupe) REFERENCES Groupe (id_groupe) ON DELETE CASCADE;

ALTER TABLE Notification ADD CONSTRAINT fk_notification_utilisateur FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur (id_utilisateur) ON DELETE CASCADE;
ALTER TABLE Notification ADD CONSTRAINT fk_notification_projet FOREIGN KEY (id_projet) REFERENCES Projet (id_projet) ON DELETE CASCADE;

ALTER TABLE Critere_evaluation ADD CONSTRAINT fk_critere_projet FOREIGN KEY (id_projet) REFERENCES Projet (id_projet) ON DELETE CASCADE;

ALTER TABLE Evaluation ADD CONSTRAINT fk_evaluation_groupe FOREIGN KEY (id_groupe) REFERENCES Groupe (id_groupe) ON DELETE CASCADE;

ALTER TABLE Note_sur ADD CONSTRAINT fk_note_evaluation FOREIGN KEY (id_evaluation) REFERENCES Evaluation (id_evaluation) ON DELETE CASCADE;
ALTER TABLE Note_sur ADD CONSTRAINT fk_note_critere FOREIGN KEY (id_critere) REFERENCES Critere_evaluation (id_critere) ON DELETE CASCADE;

-- ============================================================
-- Notes d'entrevue (encadrant)
-- ============================================================

CREATE TABLE Note_entrevue (
  id_note INT AUTO_INCREMENT NOT NULL,
  titre VARCHAR(150) NULL,
  contenu TEXT NOT NULL,
  date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
  id_utilisateur INT NOT NULL,
  id_groupe INT NOT NULL,
  PRIMARY KEY (id_note),
  FOREIGN KEY (id_utilisateur) REFERENCES Utilisateur(id_utilisateur),
  FOREIGN KEY (id_groupe) REFERENCES Groupe(id_groupe) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Colonnes pour l'activation de compte
-- ============================================================

ALTER TABLE Utilisateur ADD COLUMN token_activation VARCHAR(64) NULL;
ALTER TABLE Utilisateur ADD COLUMN token_expiration DATETIME NULL;

-- ============================================================
-- Admin initial (seed)
-- ============================================================

INSERT INTO Utilisateur (
  nom, prenom, email, mot_de_passe,
  date_inscription, est_actif,
  est_etudiant, est_encadrant, est_admin
) VALUES (
  'Admin', 'Principal', 'admin@plateforme.local',
  'admin123',
  NOW(), TRUE,
  FALSE, FALSE, TRUE
);

-- ============================================================
-- Migration : ajout colonne promo à Projet
-- (exécuter sur une base existante)
-- ============================================================

-- ALTER TABLE Projet ADD COLUMN promo VARCHAR(50) NULL AFTER etat;
-- ALTER TABLE Note_entrevue ADD COLUMN titre VARCHAR(150) NULL AFTER id_note;

-- ============================================================
-- Migration : colonnes type + id_projet sur Notification
-- (à exécuter sur une base existante, sinon déjà inclus ci-dessus)
-- ============================================================

-- ALTER TABLE Notification ADD COLUMN type VARCHAR(50) NOT NULL DEFAULT 'systeme' AFTER contenu;
-- ALTER TABLE Notification ADD COLUMN id_projet INT NULL AFTER id_utilisateur;
-- ALTER TABLE Notification ADD CONSTRAINT fk_notification_projet FOREIGN KEY (id_projet) REFERENCES Projet (id_projet) ON DELETE CASCADE;
