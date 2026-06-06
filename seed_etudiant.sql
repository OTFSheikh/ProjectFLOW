-- ============================================================
-- SEED DE TEST — Espace étudiant ProjectFLOW
-- ------------------------------------------------------------
-- À charger APRÈS plateforme_projets.sql :
--   mysql -u pf -p plateforme_projets < seed_etudiant.sql
--
-- Comptes créés (mot de passe en clair, accepté en phase dev) :
--   Encadrant : enc.demo@test.local      / enc123
--   Étudiants : etu.demo@test.local      / etu123   (Team Leader Groupe Alpha)
--               etu.alpha@test.local     / etu123
--               etu.beta@test.local      / etu123
--               etu.gamma@test.local     / etu123   (Team Leader Groupe Beta)
--
-- Pour tester le CHAT à plusieurs sur le même WiFi : chaque personne se
-- connecte sur http://<IP>:5000/login.html avec un compte étudiant différent,
-- puis ouvre le même projet -> onglet Chat.
-- ============================================================

-- Idempotent : on nettoie d'éventuelles données de seed précédentes
DELETE FROM Utilisateur WHERE email IN (
  'enc.demo@test.local','etu.demo@test.local','etu.alpha@test.local',
  'etu.beta@test.local','etu.gamma@test.local'
);

-- ---------- Utilisateurs ----------
INSERT INTO Utilisateur (nom, prenom, email, mot_de_passe, est_actif, est_etudiant, classe, est_encadrant, matiere, est_admin) VALUES
('Diallo', 'Awa',    'enc.demo@test.local',   'enc123', TRUE, FALSE, NULL,      TRUE,  'Génie logiciel', FALSE),
('Martin', 'Sophie', 'etu.demo@test.local',   'etu123', TRUE, TRUE,  'ISEN 3',  FALSE, NULL, FALSE),
('Bernard','Lucas',  'etu.alpha@test.local',  'etu123', TRUE, TRUE,  'ISEN 3',  FALSE, NULL, FALSE),
('Petit',  'Inès',   'etu.beta@test.local',   'etu123', TRUE, TRUE,  'ISEN 3',  FALSE, NULL, FALSE),
('Moreau', 'Hugo',   'etu.gamma@test.local',  'etu123', TRUE, TRUE,  'ISEN 3',  FALSE, NULL, FALSE);

-- ============================================================
-- PROJET 1 — plusieurs sujets => le groupe DEVRA choisir (Étape 4)
-- ============================================================
INSERT INTO Projet (nom, description, date_debut, date_fin, etat, promo, id_utilisateur)
VALUES (
  'Plateforme de gestion de projets',
  'Concevoir une application web de suivi de projets étudiants.',
  DATE_SUB(CURDATE(), INTERVAL 10 DAY), DATE_ADD(CURDATE(), INTERVAL 30 DAY),
  'Ouvert', 'ISEN 3',
  (SELECT id_utilisateur FROM Utilisateur WHERE email = 'enc.demo@test.local')
);

INSERT INTO Sujet (titre, description, id_projet) VALUES
('Application web de suivi',  'Suivi des tâches, jalons et livrables avec tableau de bord.',
  (SELECT id_projet FROM Projet WHERE nom = 'Plateforme de gestion de projets')),
('Tableau de bord analytique','Visualisation de l''avancement et des indicateurs projet.',
  (SELECT id_projet FROM Projet WHERE nom = 'Plateforme de gestion de projets'));

-- Critères d'évaluation du projet 1
INSERT INTO Critere_evaluation (nom, ponderation, description, id_projet) VALUES
('Technique',     50.00, 'Qualité technique et fonctionnalités', (SELECT id_projet FROM Projet WHERE nom = 'Plateforme de gestion de projets')),
('Présentation',  30.00, 'Soutenance et démonstration',         (SELECT id_projet FROM Projet WHERE nom = 'Plateforme de gestion de projets')),
('Documentation', 20.00, 'Rapport et documentation',            (SELECT id_projet FROM Projet WHERE nom = 'Plateforme de gestion de projets'));

-- Groupe Alpha : état « Proposé », AUCUN sujet choisi (pour tester l'étape 4)
INSERT INTO Groupe (nom, etat, id_projet, id_sujet) VALUES
('Groupe Alpha', 'Propose',
  (SELECT id_projet FROM Projet WHERE nom = 'Plateforme de gestion de projets'),
  NULL);

INSERT INTO Membre_de (id_utilisateur, id_groupe, est_team_leader) VALUES
((SELECT id_utilisateur FROM Utilisateur WHERE email='etu.demo@test.local'),  (SELECT id_groupe FROM Groupe WHERE nom='Groupe Alpha'), TRUE),
((SELECT id_utilisateur FROM Utilisateur WHERE email='etu.alpha@test.local'), (SELECT id_groupe FROM Groupe WHERE nom='Groupe Alpha'), FALSE),
((SELECT id_utilisateur FROM Utilisateur WHERE email='etu.beta@test.local'),  (SELECT id_groupe FROM Groupe WHERE nom='Groupe Alpha'), FALSE);

-- ============================================================
-- PROJET 2 — un seul sujet (choix sauté) + groupe déjà actif avec une
-- échéance dépassée => doit basculer automatiquement en « En retard »
-- ============================================================
INSERT INTO Projet (nom, description, date_debut, date_fin, etat, promo, id_utilisateur)
VALUES (
  'Refonte du portail étudiant',
  'Moderniser le portail étudiant de l''école.',
  DATE_SUB(CURDATE(), INTERVAL 20 DAY), DATE_ADD(CURDATE(), INTERVAL 15 DAY),
  'Ouvert', 'ISEN 3',
  (SELECT id_utilisateur FROM Utilisateur WHERE email = 'enc.demo@test.local')
);

INSERT INTO Sujet (titre, description, id_projet) VALUES
('Cahier des charges portail', 'Spécifications fonctionnelles et techniques du nouveau portail.',
  (SELECT id_projet FROM Projet WHERE nom = 'Refonte du portail étudiant'));

-- Groupe Beta : déjà « En cours », sujet unique choisi
INSERT INTO Groupe (nom, etat, id_projet, id_sujet) VALUES
('Groupe Beta', 'En_cours',
  (SELECT id_projet FROM Projet WHERE nom = 'Refonte du portail étudiant'),
  (SELECT id_sujet FROM Sujet WHERE titre = 'Cahier des charges portail'));

INSERT INTO Membre_de (id_utilisateur, id_groupe, est_team_leader) VALUES
((SELECT id_utilisateur FROM Utilisateur WHERE email='etu.gamma@test.local'), (SELECT id_groupe FROM Groupe WHERE nom='Groupe Beta'), TRUE),
((SELECT id_utilisateur FROM Utilisateur WHERE email='etu.demo@test.local'),  (SELECT id_groupe FROM Groupe WHERE nom='Groupe Beta'), FALSE);

-- Jalon avec échéance DÉPASSÉE
INSERT INTO Jalon (titre, description, date_limite, id_groupe) VALUES
('Conception', 'Phase de conception et maquettes', DATE_SUB(NOW(), INTERVAL 2 DAY),
  (SELECT id_groupe FROM Groupe WHERE nom='Groupe Beta'));

-- Tâche en retard (non terminée, échéance passée) -> déclenche « En retard »
INSERT INTO Tache (titre, description, date_limite, priorite, statut, id_jalon) VALUES
('Maquettes Figma', 'Réaliser les maquettes des écrans', DATE_SUB(NOW(), INTERVAL 1 DAY), 'Haute', 'En_cours',
  (SELECT id_jalon FROM Jalon WHERE titre='Conception' AND id_groupe=(SELECT id_groupe FROM Groupe WHERE nom='Groupe Beta'))),
('Specs fonctionnelles', 'Rédiger les spécifications', DATE_ADD(NOW(), INTERVAL 5 DAY), 'Moyenne', 'Terminee',
  (SELECT id_jalon FROM Jalon WHERE titre='Conception' AND id_groupe=(SELECT id_groupe FROM Groupe WHERE nom='Groupe Beta')));

-- Assignations
INSERT INTO Assigne_a (id_utilisateur, id_tache) VALUES
((SELECT id_utilisateur FROM Utilisateur WHERE email='etu.demo@test.local'),
 (SELECT id_tache FROM Tache WHERE titre='Maquettes Figma')),
((SELECT id_utilisateur FROM Utilisateur WHERE email='etu.gamma@test.local'),
 (SELECT id_tache FROM Tache WHERE titre='Specs fonctionnelles'));

-- Un message de chat initial dans le Groupe Beta
INSERT INTO Message (contenu, id_utilisateur, id_groupe) VALUES
('Bienvenue dans le chat du groupe Beta ! On démarre les maquettes.',
 (SELECT id_utilisateur FROM Utilisateur WHERE email='etu.gamma@test.local'),
 (SELECT id_groupe FROM Groupe WHERE nom='Groupe Beta'));
