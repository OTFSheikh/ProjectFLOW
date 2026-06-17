/* ============================================================
   ROUTES ÉTUDIANT - ProjectFLOW
   Toutes les routes API pour le rôle Étudiant (incluant Team Leader)
   Préfixe : /api/etudiant/*
============================================================ */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const { requireEtudiant } = require("../middleware/auth");
const { comparePassword, hashPassword } = require("../utils/password");

// ============================================================
// Configuration upload de fichiers (livrables)
// ============================================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, "..", "uploads", "livrables");
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ============================================================
// EXPORT du routeur (factory function avec db)
// ============================================================
module.exports = function (db) {
    const router = express.Router();

    // Toutes les routes ci-dessous nécessitent un étudiant connecté
    router.use(requireEtudiant);

    // ============================================================
    // Helper : vérifier si l'étudiant est membre du groupe
    // ============================================================
    function isMember(userId, groupId, callback) {
        db.query(
            "SELECT est_team_leader FROM Membre_de WHERE id_utilisateur = ? AND id_groupe = ?",
            [userId, groupId],
            (err, results) => {
                if (err) return callback(err, null);
                if (results.length === 0) return callback(null, { isMember: false, isLeader: false });
                callback(null, { isMember: true, isLeader: !!results[0].est_team_leader });
            }
        );
    }

    // ============================================================
    // ÉTATS DU GROUPE (doc - récap des états)
    // Propose -> En_cours -> (En_retard) -> Livre -> Soutenu -> Cloture
    // ============================================================

    // Un groupe est "en retard" si une deadline (tâche, jalon ou globale du
    // projet) est dépassée alors que tout le travail n'est pas terminé.
    // (Étape 6 du flow : bascule automatique vers « En retard ».)
    const LATE_PREDICATE = `(
        EXISTS (
            SELECT 1 FROM Jalon j JOIN Tache t ON t.id_jalon = j.id_jalon
            WHERE j.id_groupe = g.id_groupe AND t.statut <> 'Terminee' AND t.date_limite < NOW()
        )
        OR EXISTS (
            SELECT 1 FROM Jalon j
            WHERE j.id_groupe = g.id_groupe AND j.date_limite < NOW()
              AND EXISTS (SELECT 1 FROM Tache t WHERE t.id_jalon = j.id_jalon AND t.statut <> 'Terminee')
        )
        OR EXISTS (
            SELECT 1 FROM Projet p
            WHERE p.id_projet = g.id_projet AND p.date_fin < CURDATE()
              AND EXISTS (SELECT 1 FROM Jalon j JOIN Tache t ON t.id_jalon = j.id_jalon
                          WHERE j.id_groupe = g.id_groupe AND t.statut <> 'Terminee')
        )
    )`;

    // Recalcule l'état (En_cours <-> En_retard) pour les groupes ciblés par
    // scopeSql. On ne touche JAMAIS aux états Propose / Livre / Soutenu / Cloture.
    // scopeSql : ex. "g.id_groupe = ?" ou une sous-requête sur Membre_de.
    function refreshGroupStates(scopeSql, params, cb) {
        const toLate = `UPDATE Groupe g SET g.etat = 'En_retard'
                        WHERE g.etat = 'En_cours' AND ${scopeSql} AND ${LATE_PREDICATE}`;
        const toRecover = `UPDATE Groupe g SET g.etat = 'En_cours'
                           WHERE g.etat = 'En_retard' AND ${scopeSql} AND NOT ${LATE_PREDICATE}`;
        db.query(toLate, params, (e1) => {
            if (e1) return cb(e1);
            db.query(toRecover, params, (e2) => cb(e2 || null));
        });
    }

    // Passage automatique Propose -> En_cours quand le Team Leader commence à
    // organiser le travail (création d'un jalon ou d'une tâche). (Étape 5.)
    function bumpGroupToEnCours(groupId, cb) {
        db.query(
            "UPDATE Groupe SET etat = 'En_cours' WHERE id_groupe = ? AND etat = 'Propose'",
            [groupId],
            (err) => cb && cb(err || null)
        );
    }

    // Insère une notification pour une liste d'utilisateurs (déduplication +
    // ignore les vides). type : voir les catégories du front (assignation,
    // livrable, chat, validation, refus, systeme, ...). idProjet : lien "Voir le projet".
    function notify(userIds, contenu, type, idProjet, cb) {
        const ids = [...new Set((userIds || []).filter(Boolean))];
        if (!ids.length) return cb && cb(null);
        const values = ids.map((uid) => [contenu, type || "systeme", idProjet || null, uid]);
        db.query(
            "INSERT INTO Notification (contenu, type, id_projet, id_utilisateur) VALUES ?",
            [values],
            (err) => cb && cb(err || null)
        );
    }

    // Récupère les co-membres d'un groupe (tous sauf exceptId) + l'id du projet.
    function groupAudience(groupId, exceptId, cb) {
        db.query(
            `SELECT g.id_projet,
                    GROUP_CONCAT(m.id_utilisateur) AS membres
             FROM Groupe g
             JOIN Membre_de m ON m.id_groupe = g.id_groupe
             WHERE g.id_groupe = ?
             GROUP BY g.id_projet`,
            [groupId],
            (err, rows) => {
                if (err || !rows.length) return cb(err, null, []);
                const idProjet = rows[0].id_projet;
                const all = (rows[0].membres || "")
                    .split(",")
                    .map(Number)
                    .filter((id) => id && id !== Number(exceptId));
                cb(null, idProjet, all);
            }
        );
    }

    // Notifie l'encadrant propriétaire d'un projet (insertion + push temps réel).
    function notifyEncadrant(req, idProjet, contenu, type) {
        if (!idProjet) return;
        db.query("SELECT id_utilisateur FROM Projet WHERE id_projet = ?", [idProjet], (e, r) => {
            if (e || !r.length) return;
            const encId = r[0].id_utilisateur;
            notify([encId], contenu, type, idProjet, () => {});
            const io = req.app.get("io");
            if (io) io.to("user:" + encId).emit("new-notification", { contenu, type, id_projet: idProjet });
        });
    }

    // Construit la requête d'activité (livrables + messages) avec une condition
    // de portée injectée (tous mes groupes, ou un groupe précis).
    function activitySql(cond) {
        return `
            (SELECT 'livrable' AS type, l.date_depot AS date_evt, l.nom AS label,
                    l.statut_validation AS extra, u.prenom, u.nom,
                    g.nom AS nom_groupe, p.id_projet
             FROM Livrable l
             JOIN Utilisateur u ON u.id_utilisateur = l.id_etudiant_deposant
             LEFT JOIN Tache t ON t.id_tache = l.id_tache
             LEFT JOIN Jalon j ON j.id_jalon = t.id_jalon
             JOIN Groupe g ON g.id_groupe = COALESCE(l.id_groupe, j.id_groupe)
             JOIN Projet p ON p.id_projet = g.id_projet
             WHERE ${cond})
            UNION ALL
            (SELECT 'message' AS type, m.date_envoi AS date_evt, m.contenu AS label,
                    NULL AS extra, u.prenom, u.nom,
                    g.nom AS nom_groupe, p.id_projet
             FROM Message m
             JOIN Utilisateur u ON u.id_utilisateur = m.id_utilisateur
             JOIN Groupe g ON g.id_groupe = m.id_groupe
             JOIN Projet p ON p.id_projet = g.id_projet
             WHERE ${cond})
            ORDER BY date_evt DESC
            LIMIT 12
        `;
    }

    /* ============================================================
       DASHBOARD - Statistiques de l'étudiant connecté
    ============================================================ */
    router.get("/dashboard", (req, res) => {
        const userId = req.session.userId;

        // Bascule auto En_cours <-> En_retard sur tous mes groupes avant de compter.
        const scope = "g.id_groupe IN (SELECT id_groupe FROM Membre_de WHERE id_utilisateur = ?)";
        refreshGroupStates(scope, [userId], () => {

        // Compter les projets en cours
        const sqlProjects = `
            SELECT COUNT(DISTINCT p.id_projet) AS count
            FROM Projet p
            JOIN Groupe g ON g.id_projet = p.id_projet
            JOIN Membre_de m ON m.id_groupe = g.id_groupe
            WHERE m.id_utilisateur = ? AND p.etat != 'Cloture'
        `;

        // Compter les tâches assignées
        const sqlTasks = `
            SELECT COUNT(*) AS count
            FROM Assigne_a a
            JOIN Tache t ON t.id_tache = a.id_tache
            WHERE a.id_utilisateur = ? AND t.statut IN ('A_faire', 'En_cours')
        `;

        // Compter les tâches en retard
        // FIX : la valeur de l'enum est 'Terminee' (deux 'e'), pas 'Termine'
        const sqlLate = `
            SELECT COUNT(*) AS count
            FROM Assigne_a a
            JOIN Tache t ON t.id_tache = a.id_tache
            WHERE a.id_utilisateur = ?
              AND t.statut != 'Terminee'
              AND t.date_limite < NOW()
        `;

        // Compter les livrables refusés sur ses groupes
        // (on tolère 'Refuse' ET 'Rejete' selon l'historique de saisie encadrant)
        const sqlRefused = `
            SELECT COUNT(*) AS count
            FROM Livrable l
            WHERE l.statut_validation IN ('Refuse', 'Rejete')
              AND (
                  l.id_etudiant_deposant = ?
                  OR l.id_groupe IN (SELECT id_groupe FROM Membre_de WHERE id_utilisateur = ?)
              )
        `;

        db.query(sqlProjects, [userId], (e1, r1) => {
            if (e1) return res.status(500).json({ success: false, error: e1.message });
            db.query(sqlTasks, [userId], (e2, r2) => {
                if (e2) return res.status(500).json({ success: false, error: e2.message });
                db.query(sqlLate, [userId], (e3, r3) => {
                    if (e3) return res.status(500).json({ success: false, error: e3.message });
                    db.query(sqlRefused, [userId, userId], (e4, r4) => {
                        if (e4) return res.status(500).json({ success: false, error: e4.message });
                        res.json({
                            success: true,
                            stats: {
                                projectsCount: r1[0].count,
                                tasksCount: r2[0].count,
                                lateCount: r3[0].count,
                                refusedCount: r4[0].count
                            }
                        });
                    });
                });
            });
        });
        }); // refreshGroupStates
    });

    /* ============================================================
       MES TÂCHES - Toutes les tâches assignées à l'étudiant
       (tous projets confondus) — pour le dashboard
    ============================================================ */
    router.get("/tasks/mine", (req, res) => {
        const userId = req.session.userId;
        const sql = `
            SELECT
                t.id_tache, t.titre, t.statut, t.priorite, t.date_limite,
                j.titre AS jalon_titre,
                g.id_groupe, g.nom AS nom_groupe,
                p.id_projet, p.nom AS nom_projet
            FROM Assigne_a a
            JOIN Tache t ON t.id_tache = a.id_tache
            JOIN Jalon j ON j.id_jalon = t.id_jalon
            JOIN Groupe g ON g.id_groupe = j.id_groupe
            JOIN Projet p ON p.id_projet = g.id_projet
            WHERE a.id_utilisateur = ?
            ORDER BY (t.statut = 'Terminee') ASC, t.date_limite ASC
        `;
        db.query(sql, [userId], (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, tasks: results });
        });
    });

    /* ============================================================
       PROJETS - Liste des projets/groupes de l'étudiant
    ============================================================ */
    router.get("/projects", (req, res) => {
        const userId = req.session.userId;
        const scope = "g.id_groupe IN (SELECT id_groupe FROM Membre_de WHERE id_utilisateur = ?)";
        refreshGroupStates(scope, [userId], () => {
        const sql = `
            SELECT
                p.id_projet, p.nom AS nom_projet, p.etat AS etat_projet,
                p.date_debut, p.date_fin,
                g.id_groupe, g.nom AS nom_groupe, g.etat AS etat_groupe,
                m.est_team_leader,
                s.titre AS sujet,
                (SELECT COUNT(*) FROM Membre_de mm WHERE mm.id_groupe = g.id_groupe) AS nb_membres,
                (SELECT COUNT(*) FROM Tache t JOIN Jalon j ON j.id_jalon = t.id_jalon
                   WHERE j.id_groupe = g.id_groupe) AS nb_taches,
                (SELECT COUNT(*) FROM Tache t JOIN Jalon j ON j.id_jalon = t.id_jalon
                   WHERE j.id_groupe = g.id_groupe AND t.statut = 'Terminee') AS nb_taches_done,
                (SELECT GROUP_CONCAT(CONCAT(u.prenom, ' ', u.nom) SEPARATOR '|')
                   FROM Membre_de mm JOIN Utilisateur u ON u.id_utilisateur = mm.id_utilisateur
                   WHERE mm.id_groupe = g.id_groupe) AS membres_noms
            FROM Membre_de m
            JOIN Groupe g ON g.id_groupe = m.id_groupe
            JOIN Projet p ON p.id_projet = g.id_projet
            LEFT JOIN Sujet s ON s.id_sujet = g.id_sujet
            WHERE m.id_utilisateur = ?
            ORDER BY p.date_fin ASC
        `;
        db.query(sql, [userId], (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            const projects = results.map(r => ({
                ...r,
                progression: r.nb_taches ? Math.round((r.nb_taches_done / r.nb_taches) * 100) : 0
            }));
            res.json({ success: true, projects });
        });
        }); // refreshGroupStates
    });

    /* ============================================================
       PROJET - Détail d'un projet/groupe spécifique
    ============================================================ */
    router.get("/projects/:id", (req, res) => {
        const userId = req.session.userId;
        const projectId = req.params.id;

        // Recalcule l'état du/des groupe(s) de ce projet pour cet étudiant (auto En_retard).
        const scope = "g.id_groupe IN (SELECT id_groupe FROM Membre_de WHERE id_utilisateur = ? AND id_groupe IN (SELECT id_groupe FROM Groupe WHERE id_projet = ?))";
        refreshGroupStates(scope, [userId, projectId], () => {

        // 1. Récupérer le groupe de l'étudiant pour ce projet
        const sqlGroup = `
            SELECT g.*, m.est_team_leader, s.titre AS sujet_titre, s.description AS sujet_description
            FROM Membre_de m
            JOIN Groupe g ON g.id_groupe = m.id_groupe
            LEFT JOIN Sujet s ON s.id_sujet = g.id_sujet
            WHERE m.id_utilisateur = ? AND g.id_projet = ?
        `;
        db.query(sqlGroup, [userId, projectId], (err, groupResults) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (groupResults.length === 0) {
                return res.status(403).json({ success: false, message: "Vous n'êtes pas membre d'un groupe sur ce projet" });
            }

            const group = groupResults[0];

            // 2. Récupérer le projet et l'encadrant
            const sqlProject = `
                SELECT p.*, u.nom AS encadrant_nom, u.prenom AS encadrant_prenom
                FROM Projet p
                JOIN Utilisateur u ON u.id_utilisateur = p.id_utilisateur
                WHERE p.id_projet = ?
            `;
            db.query(sqlProject, [projectId], (err2, projectResults) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });

                // 3. Récupérer les membres du groupe
                const sqlMembers = `
                    SELECT u.id_utilisateur, u.nom, u.prenom, u.email, m.est_team_leader
                    FROM Membre_de m
                    JOIN Utilisateur u ON u.id_utilisateur = m.id_utilisateur
                    WHERE m.id_groupe = ?
                `;
                db.query(sqlMembers, [group.id_groupe], (err3, membersResults) => {
                    if (err3) return res.status(500).json({ success: false, error: err3.message });

                    res.json({
                        success: true,
                        project: projectResults[0],
                        group: group,
                        isTeamLeader: !!group.est_team_leader,
                        members: membersResults
                    });
                });
            });
        });
        }); // refreshGroupStates
    });

    /* ============================================================
       SUJETS DU PROJET (Étape 4 — choix du sujet)
       Liste des sujets disponibles + sujet choisi par le groupe.
    ============================================================ */
    router.get("/projects/:id/subjects", (req, res) => {
        const userId = req.session.userId;
        const projectId = req.params.id;

        // Vérifier que l'étudiant est bien membre d'un groupe de ce projet
        const sqlGroup = `
            SELECT g.id_groupe, g.id_sujet, g.etat, m.est_team_leader
            FROM Membre_de m
            JOIN Groupe g ON g.id_groupe = m.id_groupe
            WHERE m.id_utilisateur = ? AND g.id_projet = ?
            LIMIT 1
        `;
        db.query(sqlGroup, [userId, projectId], (err, gRows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (gRows.length === 0) {
                return res.status(403).json({ success: false, message: "Vous n'êtes pas membre d'un groupe sur ce projet" });
            }
            const grp = gRows[0];

            const sqlSubjects = `
                SELECT s.id_sujet, s.titre, s.description,
                       (SELECT COUNT(*) FROM Document_sujet d WHERE d.id_sujet = s.id_sujet) AS nb_documents
                FROM Sujet s
                WHERE s.id_projet = ?
                ORDER BY s.id_sujet ASC
            `;
            db.query(sqlSubjects, [projectId], (err2, subjects) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });
                res.json({
                    success: true,
                    subjects,
                    id_groupe: grp.id_groupe,
                    sujet_choisi: grp.id_sujet,         // null si pas encore choisi
                    etat_groupe: grp.etat,
                    isTeamLeader: !!grp.est_team_leader,
                    // Si un seul sujet, le choix est implicite (Étape 4 : étape sautée)
                    choixObligatoire: subjects.length > 1
                });
            });
        });
    });

    /* ============================================================
       CHOISIR LE SUJET DU GROUPE (Étape 4 — Team Leader)
       Autorisé uniquement tant que le groupe est « Proposé ».
    ============================================================ */
    router.post("/groups/:groupId/subject", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.groupId;
        const { id_sujet } = req.body;

        if (!id_sujet) {
            return res.status(400).json({ success: false, message: "id_sujet requis" });
        }

        isMember(userId, groupId, (err, info) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!info.isLeader) return res.status(403).json({ success: false, message: "Réservé au Team Leader" });

            // Le groupe doit être à l'état « Proposé »
            db.query("SELECT id_projet, etat FROM Groupe WHERE id_groupe = ?", [groupId], (e1, gRows) => {
                if (e1) return res.status(500).json({ success: false, error: e1.message });
                if (gRows.length === 0) return res.status(404).json({ success: false, message: "Groupe introuvable" });
                if (gRows[0].etat !== "Propose") {
                    return res.status(409).json({ success: false, message: "Le sujet ne peut être choisi que lorsque le groupe est « Proposé »" });
                }
                const idProjet = gRows[0].id_projet;

                // Le sujet doit appartenir au même projet
                db.query("SELECT id_sujet FROM Sujet WHERE id_sujet = ? AND id_projet = ?", [id_sujet, idProjet], (e2, sRows) => {
                    if (e2) return res.status(500).json({ success: false, error: e2.message });
                    if (sRows.length === 0) {
                        return res.status(400).json({ success: false, message: "Ce sujet n'appartient pas à ce projet" });
                    }

                    db.query("UPDATE Groupe SET id_sujet = ? WHERE id_groupe = ?", [id_sujet, groupId], (e3) => {
                        if (e3) return res.status(500).json({ success: false, error: e3.message });
                        // Prévenir les membres du groupe
                        groupAudience(groupId, null, (eA, idProj, members) => {
                            notify(members, "Le sujet du groupe a été choisi", "systeme", idProj || idProjet, () => {
                                res.json({ success: true });
                            });
                        });
                    });
                });
            });
        });
    });

    /* ============================================================
       DOCUMENTS DU SUJET (consignes déposées par l'encadrant)
    ============================================================ */
    router.get("/groups/:groupId/subject-documents", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.groupId;

        isMember(userId, groupId, (err, info) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });

            const sql = `
                SELECT d.id_document, d.nom_fichier, d.chemin_fichier, d.date_upload
                FROM Groupe g
                JOIN Document_sujet d ON d.id_sujet = g.id_sujet
                WHERE g.id_groupe = ?
                ORDER BY d.date_upload ASC
            `;
            db.query(sql, [groupId], (err, results) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, documents: results });
            });
        });
    });

    /* ============================================================
       ÉVALUATION (lecture seule — saisie par l'encadrant)
    ============================================================ */
    router.get("/groups/:groupId/evaluation", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.groupId;

        isMember(userId, groupId, (err, info) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });

            db.query("SELECT * FROM Evaluation WHERE id_groupe = ?", [groupId], (err, evRows) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (evRows.length === 0) {
                    return res.json({ success: true, evaluation: null, criteres: [] });
                }
                const evaluation = evRows[0];
                const sqlCrit = `
                    SELECT c.id_critere, c.nom, c.ponderation, c.description, ns.note
                    FROM Note_sur ns
                    JOIN Critere_evaluation c ON c.id_critere = ns.id_critere
                    WHERE ns.id_evaluation = ?
                    ORDER BY c.id_critere ASC
                `;
                db.query(sqlCrit, [evaluation.id_evaluation], (err2, critRows) => {
                    if (err2) return res.status(500).json({ success: false, error: err2.message });
                    res.json({ success: true, evaluation, criteres: critRows });
                });
            });
        });
    });

    /* ============================================================
       ACTIVITÉ RÉCENTE (livrables + messages)
       Sans groupId : tous mes groupes. Avec ?groupId= : un groupe.
    ============================================================ */
    router.get("/activity", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.query.groupId ? Number(req.query.groupId) : null;

        const send = (sql, params) => db.query(sql, params, (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            res.json({ success: true, activity: results });
        });

        if (groupId) {
            isMember(userId, groupId, (err, info) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });
                send(activitySql("g.id_groupe = ?"), [groupId, groupId]);
            });
        } else {
            send(
                activitySql("g.id_groupe IN (SELECT id_groupe FROM Membre_de WHERE id_utilisateur = ?)"),
                [userId, userId]
            );
        }
    });

    /* ============================================================
       JALONS & TÂCHES
    ============================================================ */

    // Liste des jalons (avec tâches) d'un groupe
    router.get("/groups/:groupId/milestones", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.groupId;

        isMember(userId, groupId, (err, info) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });

            // Recalcule l'état (auto En_retard) avant de renvoyer les jalons/tâches
            refreshGroupStates("g.id_groupe = ?", [groupId], () => {

            // GROUP_CONCAT remonte la liste des id des étudiants assignés à chaque
            // tâche (ex : "3,7,12"), agrégée par tâche. Les noms sont résolus côté
            // front à partir de la liste des membres déjà chargée.
            const sql = `
                SELECT
                    j.id_jalon, j.titre, j.description, j.date_limite,
                    t.id_tache, t.titre AS tache_titre, t.statut, t.priorite, t.date_limite AS tache_date,
                    GROUP_CONCAT(DISTINCT a.id_utilisateur) AS assignes
                FROM Jalon j
                LEFT JOIN Tache t ON t.id_jalon = j.id_jalon
                LEFT JOIN Assigne_a a ON a.id_tache = t.id_tache
                WHERE j.id_groupe = ?
                GROUP BY j.id_jalon, t.id_tache
                ORDER BY j.date_limite ASC, t.date_limite ASC
            `;
            db.query(sql, [groupId], (err, results) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, rows: results, isTeamLeader: info.isLeader });
            });
            }); // refreshGroupStates
        });
    });

    // Créer un jalon (Team Leader uniquement)
    router.post("/groups/:groupId/milestones", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.groupId;
        const { titre, description, date_limite } = req.body;

        isMember(userId, groupId, (err, info) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!info.isLeader) return res.status(403).json({ success: false, message: "Réservé au Team Leader" });

            db.query(
                "INSERT INTO Jalon (titre, description, date_limite, id_groupe) VALUES (?, ?, ?, ?)",
                [titre, description, date_limite, groupId],
                (err, result) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    // Étape 5 : le Team Leader structure le travail -> le groupe passe « En cours »
                    bumpGroupToEnCours(groupId, () => {
                        res.json({ success: true, id_jalon: result.insertId });
                    });
                }
            );
        });
    });

    // Modifier un jalon (Team Leader uniquement)
    router.put("/milestones/:id", (req, res) => {
        const userId = req.session.userId;
        const jalonId = req.params.id;
        const { titre, description, date_limite } = req.body;

        // Récupérer le groupe du jalon pour vérifier les droits
        db.query("SELECT id_groupe FROM Jalon WHERE id_jalon = ?", [jalonId], (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (results.length === 0) return res.status(404).json({ success: false, message: "Jalon introuvable" });

            isMember(userId, results[0].id_groupe, (err2, info) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });
                if (!info.isLeader) return res.status(403).json({ success: false, message: "Réservé au Team Leader" });

                db.query(
                    "UPDATE Jalon SET titre = ?, description = ?, date_limite = ? WHERE id_jalon = ?",
                    [titre, description, date_limite, jalonId],
                    (err) => {
                        if (err) return res.status(500).json({ success: false, error: err.message });
                        res.json({ success: true });
                    }
                );
            });
        });
    });

    // Supprimer un jalon (Team Leader uniquement)
    router.delete("/milestones/:id", (req, res) => {
        const userId = req.session.userId;
        const jalonId = req.params.id;

        db.query("SELECT id_groupe FROM Jalon WHERE id_jalon = ?", [jalonId], (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (results.length === 0) return res.status(404).json({ success: false, message: "Jalon introuvable" });

            isMember(userId, results[0].id_groupe, (err2, info) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });
                if (!info.isLeader) return res.status(403).json({ success: false, message: "Réservé au Team Leader" });

                db.query("DELETE FROM Jalon WHERE id_jalon = ?", [jalonId], (err) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    res.json({ success: true });
                });
            });
        });
    });

    // Créer une tâche dans un jalon (Team Leader uniquement)
    router.post("/milestones/:milestoneId/tasks", (req, res) => {
        const userId = req.session.userId;
        const jalonId = req.params.milestoneId;
        const { titre, description, date_limite, priorite, assignees } = req.body;
        // assignees = tableau d'id_utilisateur à assigner

        db.query("SELECT id_groupe FROM Jalon WHERE id_jalon = ?", [jalonId], (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (results.length === 0) return res.status(404).json({ success: false, message: "Jalon introuvable" });

            const groupId = results[0].id_groupe;

            isMember(userId, groupId, (err2, info) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });
                if (!info.isLeader) return res.status(403).json({ success: false, message: "Réservé au Team Leader" });

                db.query(
                    "INSERT INTO Tache (titre, description, date_limite, priorite, id_jalon) VALUES (?, ?, ?, ?, ?)",
                    [titre, description, date_limite, priorite || "Moyenne", jalonId],
                    (err, result) => {
                        if (err) return res.status(500).json({ success: false, error: err.message });
                        const taskId = result.insertId;

                        // Étape 5 : création de tâche -> le groupe passe « En cours »
                        bumpGroupToEnCours(groupId, () => {

                        // Si des assignations sont fournies, vérifier qu'elles concernent
                        // bien des MEMBRES du groupe avant de les insérer (règle métier doc).
                        if (assignees && assignees.length > 0) {
                            const uniques = [...new Set(assignees)];
                            db.query(
                                "SELECT id_utilisateur FROM Membre_de WHERE id_groupe = ? AND id_utilisateur IN (?)",
                                [groupId, uniques],
                                (errV, memberRows) => {
                                    if (errV) return res.status(500).json({ success: false, error: errV.message });
                                    if (memberRows.length !== uniques.length) {
                                        return res.status(400).json({ success: false, message: "Tous les assignés doivent être membres du groupe" });
                                    }
                                    const values = uniques.map(uid => [uid, taskId]);
                                    db.query("INSERT INTO Assigne_a (id_utilisateur, id_tache) VALUES ?", [values], (err3) => {
                                        if (err3) return res.status(500).json({ success: false, error: err3.message });
                                        // Notifier chaque assigné (type 'assignation' + lien vers le projet)
                                        db.query("SELECT id_projet FROM Groupe WHERE id_groupe = ?", [groupId], (eP, rP) => {
                                            const idProjet = (rP && rP.length) ? rP[0].id_projet : null;
                                            notify(uniques, `Nouvelle tâche assignée : ${titre}`, "assignation", idProjet,
                                                () => res.json({ success: true, id_tache: taskId }));
                                        });
                                    });
                                }
                            );
                        } else {
                            res.json({ success: true, id_tache: taskId });
                        }
                        }); // bumpGroupToEnCours
                    }
                );
            });
        });
    });

    // Modifier le statut d'une tâche (étudiant assigné OU Team Leader)
    router.patch("/tasks/:id/status", (req, res) => {
        const userId = req.session.userId;
        const taskId = req.params.id;
        const { statut } = req.body;

        // Statuts valides (doc : À faire -> En cours -> Terminé)
        const STATUTS = ["A_faire", "En_cours", "Terminee"];
        if (!STATUTS.includes(statut)) {
            return res.status(400).json({ success: false, message: "Statut invalide" });
        }

        // Vérifier que l'étudiant est soit assigné, soit Team Leader du groupe
        const sql = `
            SELECT j.id_groupe, m.est_team_leader,
                   (SELECT COUNT(*) FROM Assigne_a a WHERE a.id_tache = ? AND a.id_utilisateur = ?) AS is_assignee
            FROM Tache t
            JOIN Jalon j ON j.id_jalon = t.id_jalon
            LEFT JOIN Membre_de m ON m.id_groupe = j.id_groupe AND m.id_utilisateur = ?
            WHERE t.id_tache = ?
        `;
        db.query(sql, [taskId, userId, userId, taskId], (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (results.length === 0) return res.status(404).json({ success: false, message: "Tâche introuvable" });

            const row = results[0];
            const isLeader = !!row.est_team_leader;
            const isAssignee = row.is_assignee > 0;

            if (!isLeader && !isAssignee) {
                return res.status(403).json({ success: false, message: "Vous ne pouvez modifier que vos tâches ou en tant que Team Leader" });
            }

            db.query("UPDATE Tache SET statut = ? WHERE id_tache = ?", [statut, taskId], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true });
            });
        });
    });

    // Modifier une tâche (Team Leader uniquement) — titre, description, échéance,
    // priorité et réassignation éventuelle. (Cahier des charges : modification des tâches.)
    router.put("/tasks/:id", (req, res) => {
        const userId = req.session.userId;
        const taskId = req.params.id;
        const { titre, description, date_limite, priorite, assignees } = req.body;

        db.query(
            "SELECT j.id_groupe FROM Tache t JOIN Jalon j ON j.id_jalon = t.id_jalon WHERE t.id_tache = ?",
            [taskId],
            (err, rows) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (rows.length === 0) return res.status(404).json({ success: false, message: "Tâche introuvable" });
                const groupId = rows[0].id_groupe;

                isMember(userId, groupId, (e2, info) => {
                    if (e2) return res.status(500).json({ success: false, error: e2.message });
                    if (!info.isLeader) return res.status(403).json({ success: false, message: "Réservé au Team Leader" });

                    db.query(
                        "UPDATE Tache SET titre = ?, description = ?, date_limite = ?, priorite = ? WHERE id_tache = ?",
                        [titre, description, date_limite, priorite || "Moyenne", taskId],
                        (e3) => {
                            if (e3) return res.status(500).json({ success: false, error: e3.message });

                            // Réassignation optionnelle : on remplace les assignés
                            if (!Array.isArray(assignees)) return res.json({ success: true });
                            const uniques = [...new Set(assignees)];
                            db.query("DELETE FROM Assigne_a WHERE id_tache = ?", [taskId], (e4) => {
                                if (e4) return res.status(500).json({ success: false, error: e4.message });
                                if (!uniques.length) return res.json({ success: true });
                                db.query(
                                    "SELECT id_utilisateur FROM Membre_de WHERE id_groupe = ? AND id_utilisateur IN (?)",
                                    [groupId, uniques],
                                    (e5, memberRows) => {
                                        if (e5) return res.status(500).json({ success: false, error: e5.message });
                                        if (memberRows.length !== uniques.length) {
                                            return res.status(400).json({ success: false, message: "Tous les assignés doivent être membres du groupe" });
                                        }
                                        const values = uniques.map((uid) => [uid, taskId]);
                                        db.query("INSERT INTO Assigne_a (id_utilisateur, id_tache) VALUES ?", [values], (e6) => {
                                            if (e6) return res.status(500).json({ success: false, error: e6.message });
                                            res.json({ success: true });
                                        });
                                    }
                                );
                            });
                        }
                    );
                });
            }
        );
    });

    // Supprimer une tâche (Team Leader uniquement) — cascade : assignations,
    // commentaires et livrables rattachés sont supprimés par la base.
    router.delete("/tasks/:id", (req, res) => {
        const userId = req.session.userId;
        const taskId = req.params.id;

        db.query(
            "SELECT j.id_groupe FROM Tache t JOIN Jalon j ON j.id_jalon = t.id_jalon WHERE t.id_tache = ?",
            [taskId],
            (err, rows) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (rows.length === 0) return res.status(404).json({ success: false, message: "Tâche introuvable" });

                isMember(userId, rows[0].id_groupe, (e2, info) => {
                    if (e2) return res.status(500).json({ success: false, error: e2.message });
                    if (!info.isLeader) return res.status(403).json({ success: false, message: "Réservé au Team Leader" });

                    db.query("DELETE FROM Tache WHERE id_tache = ?", [taskId], (e3) => {
                        if (e3) return res.status(500).json({ success: false, error: e3.message });
                        res.json({ success: true });
                    });
                });
            }
        );
    });

    /* ============================================================
       LIVRABLES
    ============================================================ */

    // Liste des livrables d'un groupe (documents finaux, rattachés au groupe)
    router.get("/groups/:groupId/deliverables", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.groupId;

        isMember(userId, groupId, (err, info) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });

            const sql = `
                SELECT
                    l.*,
                    u.nom AS deposant_nom, u.prenom AS deposant_prenom
                FROM Livrable l
                JOIN Utilisateur u ON u.id_utilisateur = l.id_etudiant_deposant
                WHERE l.id_groupe = ?
                ORDER BY l.date_depot DESC
            `;
            db.query(sql, [groupId], (err, results) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, deliverables: results });
            });
        });
    });

    // Déposer un livrable (document final, rattaché au groupe)
    router.post("/deliverables", upload.single("fichier"), (req, res) => {
        const userId = req.session.userId;
        const { id_groupe, nom } = req.body;

        if (!req.file) return res.status(400).json({ success: false, message: "Fichier manquant" });
        if (!id_groupe) return res.status(400).json({ success: false, message: "Groupe manquant" });

        isMember(userId, id_groupe, (err, info) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!info.isMember) return res.status(403).json({ success: false, message: "Vous n'êtes pas membre de ce groupe" });

            const sql = `
                INSERT INTO Livrable (nom, chemin_fichier, id_groupe, id_etudiant_deposant)
                VALUES (?, ?, ?, ?)
            `;
            db.query(sql, [nom || req.file.originalname, req.file.filename, id_groupe, userId], (err2, result) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });
                // Notifier les autres membres du groupe (type 'livrable')
                groupAudience(id_groupe, userId, (eA, idProjet, others) => {
                    const label = nom || req.file.originalname;
                    notify(others, `Nouveau livrable déposé : ${label}`, "livrable", idProjet, () => {
                        notifyEncadrant(req, idProjet, `Nouveau livrable déposé : ${label}`, "livrable");
                        res.json({ success: true, id_livrable: result.insertId });
                    });
                });
            });
        });
    });

    // Supprimer un livrable (le déposant ou le Team Leader) — permet la
    // « mise à jour » d'un livrable en re-déposant une nouvelle version.
    router.delete("/deliverables/:id", (req, res) => {
        const userId = req.session.userId;
        const livId = req.params.id;

        db.query(
            "SELECT id_etudiant_deposant, id_groupe FROM Livrable WHERE id_livrable = ?",
            [livId],
            (err, rows) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (rows.length === 0) return res.status(404).json({ success: false, message: "Livrable introuvable" });
                const { id_etudiant_deposant, id_groupe } = rows[0];

                isMember(userId, id_groupe, (e2, info) => {
                    if (e2) return res.status(500).json({ success: false, error: e2.message });
                    const isOwner = String(id_etudiant_deposant) === String(userId);
                    if (!isOwner && !info.isLeader) {
                        return res.status(403).json({ success: false, message: "Seul le déposant ou le Team Leader peut supprimer ce livrable" });
                    }
                    db.query("DELETE FROM Livrable WHERE id_livrable = ?", [livId], (e3) => {
                        if (e3) return res.status(500).json({ success: false, error: e3.message });
                        res.json({ success: true });
                    });
                });
            }
        );
    });

    /* ============================================================
       LIVRAISON (Étape 8) — le Team Leader marque le groupe « Livré »
       quand tous les livrables finaux ont été déposés.
       Autorisé depuis En_cours / En_retard uniquement.
    ============================================================ */
    router.post("/groups/:groupId/deliver", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.groupId;

        isMember(userId, groupId, (err, info) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!info.isLeader) return res.status(403).json({ success: false, message: "Réservé au Team Leader" });

            db.query("SELECT etat, id_projet FROM Groupe WHERE id_groupe = ?", [groupId], (e1, gRows) => {
                if (e1) return res.status(500).json({ success: false, error: e1.message });
                if (gRows.length === 0) return res.status(404).json({ success: false, message: "Groupe introuvable" });

                const etat = gRows[0].etat;
                const idProjet = gRows[0].id_projet;
                if (!["En_cours", "En_retard"].includes(etat)) {
                    return res.status(409).json({ success: false, message: "Le groupe ne peut être marqué « Livré » que depuis l'état En cours / En retard" });
                }

                // Au moins un livrable doit exister avant de livrer
                db.query("SELECT COUNT(*) AS n FROM Livrable WHERE id_groupe = ?", [groupId], (e2, dRows) => {
                    if (e2) return res.status(500).json({ success: false, error: e2.message });
                    if (!dRows[0].n) {
                        return res.status(400).json({ success: false, message: "Déposez au moins un livrable avant de marquer le groupe comme livré" });
                    }

                    db.query("UPDATE Groupe SET etat = 'Livre' WHERE id_groupe = ?", [groupId], (e3) => {
                        if (e3) return res.status(500).json({ success: false, error: e3.message });
                        // Prévenir tout le groupe
                        groupAudience(groupId, null, (eA, idProj, members) => {
                            notify(members, "Le groupe a été marqué « Livré »", "systeme", idProj || idProjet, () => {
                                notifyEncadrant(req, idProj || idProjet, "Un groupe a marqué son projet comme « Livré »", "systeme");
                                res.json({ success: true, etat: "Livre" });
                            });
                        });
                    });
                });
            });
        });
    });

    /* ============================================================
       COMMENTAIRES
    ============================================================ */

    // Commenter une tâche (membre du groupe de la tâche uniquement)
    router.post("/tasks/:id/comments", (req, res) => {
        const userId = req.session.userId;
        const taskId = req.params.id;
        const { contenu } = req.body;

        // FIX : vérifier l'appartenance au groupe de la tâche avant de commenter.
        db.query(
            "SELECT j.id_groupe FROM Tache t JOIN Jalon j ON j.id_jalon = t.id_jalon WHERE t.id_tache = ?",
            [taskId],
            (err, rows) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (rows.length === 0) return res.status(404).json({ success: false, message: "Tâche introuvable" });

                isMember(userId, rows[0].id_groupe, (err2, info) => {
                    if (err2) return res.status(500).json({ success: false, error: err2.message });
                    if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });

                    db.query(
                        "INSERT INTO Commentaire (contenu, id_utilisateur, id_tache) VALUES (?, ?, ?)",
                        [contenu, userId, taskId],
                        (err3, result) => {
                            if (err3) return res.status(500).json({ success: false, error: err3.message });
                            res.json({ success: true, id_commentaire: result.insertId });
                        }
                    );
                });
            }
        );
    });

    // Lister les commentaires d'une tâche (membres du groupe de la tâche).
    router.get("/tasks/:id/comments", (req, res) => {
        const userId = req.session.userId;
        const taskId = req.params.id;

        db.query(
            "SELECT j.id_groupe FROM Tache t JOIN Jalon j ON j.id_jalon = t.id_jalon WHERE t.id_tache = ?",
            [taskId],
            (err, rows) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (rows.length === 0) return res.status(404).json({ success: false, message: "Tâche introuvable" });

                isMember(userId, rows[0].id_groupe, (err2, info) => {
                    if (err2) return res.status(500).json({ success: false, error: err2.message });
                    if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });

                    db.query(
                        `SELECT c.id_commentaire, c.contenu, c.date_creation, c.id_utilisateur,
                                u.nom, u.prenom, u.est_encadrant
                         FROM Commentaire c JOIN Utilisateur u ON u.id_utilisateur = c.id_utilisateur
                         WHERE c.id_tache = ?
                         ORDER BY c.date_creation ASC`,
                        [taskId],
                        (err3, comments) => {
                            if (err3) return res.status(500).json({ success: false, error: err3.message });
                            res.json({ success: true, comments });
                        }
                    );
                });
            }
        );
    });

    // Commenter un livrable (membre du groupe du livrable uniquement)
    router.post("/deliverables/:id/comments", (req, res) => {
        const userId = req.session.userId;
        const livrableId = req.params.id;
        const { contenu } = req.body;

        // FIX : résoudre le groupe du livrable (direct ou via sa tâche) puis vérifier l'appartenance.
        db.query(
            `SELECT COALESCE(l.id_groupe, j.id_groupe) AS id_groupe
             FROM Livrable l
             LEFT JOIN Tache t ON t.id_tache = l.id_tache
             LEFT JOIN Jalon j ON j.id_jalon = t.id_jalon
             WHERE l.id_livrable = ?`,
            [livrableId],
            (err, rows) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (rows.length === 0) return res.status(404).json({ success: false, message: "Livrable introuvable" });

                isMember(userId, rows[0].id_groupe, (err2, info) => {
                    if (err2) return res.status(500).json({ success: false, error: err2.message });
                    if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });

                    db.query(
                        "INSERT INTO Commentaire (contenu, id_utilisateur, id_livrable) VALUES (?, ?, ?)",
                        [contenu, userId, livrableId],
                        (err3, result) => {
                            if (err3) return res.status(500).json({ success: false, error: err3.message });
                            res.json({ success: true, id_commentaire: result.insertId });
                        }
                    );
                });
            }
        );
    });

    // Lister les commentaires d'un livrable.
    // Les étudiants voient TOUS les commentaires : ceux des membres + ceux de l'encadrant.
    router.get("/deliverables/:id/comments", (req, res) => {
        const userId = req.session.userId;
        const livrableId = req.params.id;

        db.query("SELECT id_groupe FROM Livrable WHERE id_livrable = ?", [livrableId], (err, rows) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (rows.length === 0) return res.status(404).json({ success: false, message: "Livrable introuvable" });

            isMember(userId, rows[0].id_groupe, (err2, info) => {
                if (err2) return res.status(500).json({ success: false, error: err2.message });
                if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });

                db.query(
                    `SELECT c.id_commentaire, c.contenu, c.date_creation, c.id_utilisateur,
                            u.nom, u.prenom, u.est_encadrant
                     FROM Commentaire c JOIN Utilisateur u ON u.id_utilisateur = c.id_utilisateur
                     WHERE c.id_livrable = ?
                     ORDER BY c.date_creation ASC`,
                    [livrableId],
                    (err3, comments) => {
                        if (err3) return res.status(500).json({ success: false, error: err3.message });
                        res.json({ success: true, comments });
                    }
                );
            });
        });
    });

    /* ============================================================
       CHAT DU GROUPE
    ============================================================ */

    // Récupérer les messages du chat
    router.get("/groups/:groupId/messages", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.groupId;

        isMember(userId, groupId, (err, info) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });

            const sql = `
                SELECT m.*, u.nom, u.prenom, u.est_encadrant
                FROM Message m
                JOIN Utilisateur u ON u.id_utilisateur = m.id_utilisateur
                WHERE m.id_groupe = ?
                ORDER BY m.date_envoi ASC
            `;
            db.query(sql, [groupId], (err, results) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, messages: results });
            });
        });
    });

    // Envoyer un message
    router.post("/groups/:groupId/messages", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.groupId;
        const { contenu } = req.body;

        if (!contenu || !contenu.trim()) {
            return res.status(400).json({ success: false, message: "Message vide" });
        }

        isMember(userId, groupId, (err, info) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });

            db.query(
                "INSERT INTO Message (contenu, id_utilisateur, id_groupe) VALUES (?, ?, ?)",
                [contenu, userId, groupId],
                (err, result) => {
                    if (err) return res.status(500).json({ success: false, error: err.message });
                    const messageId = result.insertId;

                    // Diffusion temps réel à tous les sockets du groupe (membres + encadrant).
                    // NB : on ne crée PAS de notification pour un message entre étudiants
                    // (ce serait du bruit). Les notifications ne sont émises que pour les
                    // messages de l'encadrant (voir routes/encadrant.js).
                    db.query(
                        `SELECT m.*, u.nom, u.prenom, u.est_encadrant
                         FROM Message m JOIN Utilisateur u ON m.id_utilisateur = u.id_utilisateur
                         WHERE m.id_message = ?`,
                        [messageId],
                        (err2, msgRows) => {
                            const io = req.app.get("io");
                            if (!err2 && msgRows.length && io) {
                                io.to("group:" + groupId).emit("new-message", msgRows[0]);
                            }
                            res.json({ success: true, id_message: messageId });
                        }
                    );
                }
            );
        });
    });

    // Supprimer un message (l'étudiant ne peut supprimer que SES propres messages)
    router.delete("/groups/:groupId/messages/:msgId", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.groupId;
        const msgId = req.params.msgId;

        isMember(userId, groupId, (err, info) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (!info.isMember) return res.status(403).json({ success: false, message: "Accès refusé" });

            db.query(
                "DELETE FROM Message WHERE id_message = ? AND id_groupe = ? AND id_utilisateur = ?",
                [msgId, groupId, userId],
                (err2, result) => {
                    if (err2) return res.status(500).json({ success: false, error: err2.message });
                    if (result.affectedRows === 0) {
                        return res.status(403).json({ success: false, message: "Vous ne pouvez supprimer que vos propres messages" });
                    }
                    const io = req.app.get("io");
                    if (io) {
                        io.to("group:" + groupId).emit("message-deleted", {
                            id_message: Number(msgId),
                            id_groupe: Number(groupId)
                        });
                    }
                    res.json({ success: true });
                }
            );
        });
    });

    /* ============================================================
       NOTIFICATIONS
    ============================================================ */

    // Liste des notifications
    router.get("/notifications", (req, res) => {
        const userId = req.session.userId;
        db.query(
            "SELECT * FROM Notification WHERE id_utilisateur = ? ORDER BY date_creation DESC",
            [userId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true, notifications: results });
            }
        );
    });

    // Marquer une notification comme lue
    router.patch("/notifications/:id/read", (req, res) => {
        const userId = req.session.userId;
        const notifId = req.params.id;
        db.query(
            "UPDATE Notification SET lu = TRUE WHERE id_notification = ? AND id_utilisateur = ?",
            [notifId, userId],
            (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true });
            }
        );
    });

    // Tout marquer comme lu
    router.patch("/notifications/read-all", (req, res) => {
        const userId = req.session.userId;
        db.query(
            "UPDATE Notification SET lu = TRUE WHERE id_utilisateur = ?",
            [userId],
            (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true });
            }
        );
    });

    /* ============================================================
       PROFIL - Mon compte
    ============================================================ */

    // Récupérer mes infos
    router.get("/profile", (req, res) => {
        const userId = req.session.userId;
        db.query(
            "SELECT id_utilisateur, nom, prenom, email, classe, date_inscription FROM Utilisateur WHERE id_utilisateur = ?",
            [userId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                if (results.length === 0) return res.status(404).json({ success: false, message: "Profil introuvable" });
                res.json({ success: true, utilisateur: results[0] });
            }
        );
    });

    // Modifier mes infos (prénom, nom, classe)
    router.put("/profile", (req, res) => {
        const userId = req.session.userId;
        const { nom, prenom, classe } = req.body;
        db.query(
            "UPDATE Utilisateur SET nom = ?, prenom = ?, classe = ? WHERE id_utilisateur = ?",
            [nom, prenom, classe, userId],
            (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true });
            }
        );
    });

    // Changer mon mot de passe
    router.put("/profile/password", async (req, res) => {
        const userId = req.session.userId;
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "Ancien et nouveau mot de passe requis" });
        }

        db.query("SELECT mot_de_passe FROM Utilisateur WHERE id_utilisateur = ?", [userId], async (err, results) => {
            if (err) return res.status(500).json({ success: false, error: err.message });
            if (results.length === 0) return res.status(404).json({ success: false, message: "Utilisateur introuvable" });

            // comparePassword gère le fallback "mot de passe en clair" (phase dev)
            const match = await comparePassword(oldPassword, results[0].mot_de_passe);
            if (!match) return res.status(401).json({ success: false, message: "Ancien mot de passe incorrect" });

            const hashed = await hashPassword(newPassword);
            db.query("UPDATE Utilisateur SET mot_de_passe = ? WHERE id_utilisateur = ?", [hashed, userId], (err) => {
                if (err) return res.status(500).json({ success: false, error: err.message });
                res.json({ success: true });
            });
        });
    });

    return router;
};