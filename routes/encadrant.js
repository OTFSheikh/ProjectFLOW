const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { requireEncadrant } = require("../middleware/auth");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, "..", "uploads", "sujets");
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

module.exports = function (db) {
    const router = express.Router();
    router.use(requireEncadrant);

    // --- DASHBOARD ---
    router.get("/dashboard", (req, res) => {
        const userId = req.session.userId;
        const sql = `
            SELECT
                (SELECT COUNT(*) FROM Projet WHERE id_utilisateur = ?) AS projets_actifs,
                (SELECT COUNT(*) FROM Groupe g JOIN Projet p ON g.id_projet = p.id_projet WHERE p.id_utilisateur = ?) AS groupes_total,
                (SELECT COUNT(*) FROM Tache t JOIN Jalon j ON t.id_jalon = j.id_jalon JOIN Groupe g ON j.id_groupe = g.id_groupe JOIN Projet p ON g.id_projet = p.id_projet WHERE p.id_utilisateur = ? AND t.statut = 'En_cours') AS taches_en_cours,
                (SELECT COUNT(*) FROM Livrable l JOIN Groupe g ON l.id_groupe = g.id_groupe JOIN Projet p ON g.id_projet = p.id_projet WHERE p.id_utilisateur = ? AND l.statut_validation = 'En_attente') AS livrables_attente
        `;
        db.query(sql, [userId, userId, userId, userId], (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
            res.json({ success: true, stats: results[0] });
        });
    });

    // --- PROJETS ---
    router.get("/projects", (req, res) => {
        const userId = req.session.userId;
        db.query(
            `SELECT p.*,
                (SELECT COUNT(*) FROM Groupe WHERE id_projet = p.id_projet) AS nb_groupes
             FROM Projet p WHERE p.id_utilisateur = ? ORDER BY p.date_debut DESC`,
            [userId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                res.json({ success: true, projects: results });
            }
        );
    });

    router.get("/projects/:id", (req, res) => {
        const userId = req.session.userId;
        db.query(
            "SELECT * FROM Projet WHERE id_projet = ? AND id_utilisateur = ?",
            [req.params.id, userId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (results.length === 0) return res.status(404).json({ success: false, message: "Projet introuvable" });
                const project = results[0];
                db.query(
                    `SELECT g.*, s.titre AS sujet_titre,
                        (SELECT COUNT(*) FROM Membre_de WHERE id_groupe = g.id_groupe) AS nb_membres
                     FROM Groupe g LEFT JOIN Sujet s ON g.id_sujet = s.id_sujet
                     WHERE g.id_projet = ?`,
                    [project.id_projet],
                    (err2, groups) => {
                        if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                        db.query("SELECT * FROM Sujet WHERE id_projet = ?", [project.id_projet], (err3, sujets) => {
                            if (err3) return res.status(500).json({ success: false, message: "Erreur serveur" });
                            db.query("SELECT * FROM Critere_evaluation WHERE id_projet = ?", [project.id_projet], (err4, criteres) => {
                                if (err4) return res.status(500).json({ success: false, message: "Erreur serveur" });
                                res.json({ success: true, project, groups, sujets, criteres });
                            });
                        });
                    }
                );
            }
        );
    });

    router.post("/projects", (req, res) => {
        const userId = req.session.userId;
        const { nom, description, date_debut, date_fin, promo, sujets, criteres } = req.body;

        if (!nom || !date_debut || !date_fin) {
            return res.status(400).json({ success: false, message: "Nom et dates requis" });
        }

        db.query(
            "INSERT INTO Projet (nom, description, date_debut, date_fin, promo, id_utilisateur) VALUES (?, ?, ?, ?, ?, ?)",
            [nom, description || null, date_debut, date_fin, promo || null, userId],
            (err, result) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                const projectId = result.insertId;

                if (sujets && sujets.length > 0) {
                    const sujetValues = sujets.map(s => [s.titre, s.description || null, projectId]);
                    db.query("INSERT INTO Sujet (titre, description, id_projet) VALUES ?", [sujetValues], () => {});
                }

                if (criteres && criteres.length > 0) {
                    const critereValues = criteres.map(c => [c.nom, c.ponderation, c.description || null, projectId]);
                    db.query("INSERT INTO Critere_evaluation (nom, ponderation, description, id_projet) VALUES ?", [critereValues], () => {});
                }

                res.status(201).json({ success: true, message: "Projet créé", projectId });
            }
        );
    });

    // --- MODIFIER UN PROJET ---
    router.put("/projects/:id", (req, res) => {
        const userId = req.session.userId;
        const { nom, description, date_debut, date_fin, promo, etat } = req.body;

        if (!nom || !date_debut || !date_fin) {
            return res.status(400).json({ success: false, message: "Nom et dates requis" });
        }

        db.query(
            "UPDATE Projet SET nom = ?, description = ?, date_debut = ?, date_fin = ?, promo = ?, etat = ? WHERE id_projet = ? AND id_utilisateur = ?",
            [nom, description || null, date_debut, date_fin, promo || null, etat || "Ouvert", req.params.id, userId],
            (err, result) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Projet introuvable" });
                res.json({ success: true, message: "Projet mis à jour" });
            }
        );
    });

    // --- SUPPRIMER UN PROJET ---
    router.delete("/projects/:id", (req, res) => {
        const userId = req.session.userId;

        db.query(
            "SELECT id_projet FROM Projet WHERE id_projet = ? AND id_utilisateur = ?",
            [req.params.id, userId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (results.length === 0) return res.status(404).json({ success: false, message: "Projet introuvable" });

                db.query("DELETE FROM Projet WHERE id_projet = ?", [req.params.id], (err2) => {
                    if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                    res.json({ success: true, message: "Projet supprimé" });
                });
            }
        );
    });

    // --- CRITÈRES D'ÉVALUATION (CRUD) ---
    router.put("/projects/:id/criteres", (req, res) => {
        const userId = req.session.userId;
        const { criteres } = req.body;

        db.query(
            "SELECT id_projet FROM Projet WHERE id_projet = ? AND id_utilisateur = ?",
            [req.params.id, userId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (results.length === 0) return res.status(404).json({ success: false, message: "Projet introuvable" });

                db.query("DELETE FROM Critere_evaluation WHERE id_projet = ?", [req.params.id], (err2) => {
                    if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });

                    if (!criteres || criteres.length === 0) {
                        return res.json({ success: true, message: "Critères mis à jour" });
                    }

                    const values = criteres.map(c => [c.nom, c.ponderation, c.description || null, req.params.id]);
                    db.query(
                        "INSERT INTO Critere_evaluation (nom, ponderation, description, id_projet) VALUES ?",
                        [values],
                        (err3) => {
                            if (err3) return res.status(500).json({ success: false, message: "Erreur serveur" });
                            res.json({ success: true, message: "Critères mis à jour" });
                        }
                    );
                });
            }
        );
    });

    // --- UPLOAD DOCUMENTS SUR UN SUJET ---
    router.post("/sujets/:id/documents", upload.array("fichiers", 5), (req, res) => {
        const sujetId = req.params.id;
        const userId = req.session.userId;

        db.query(
            `SELECT s.id_sujet FROM Sujet s
             JOIN Projet p ON s.id_projet = p.id_projet
             WHERE s.id_sujet = ? AND p.id_utilisateur = ?`,
            [sujetId, userId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (results.length === 0) return res.status(404).json({ success: false, message: "Sujet introuvable" });

                if (!req.files || req.files.length === 0) {
                    return res.status(400).json({ success: false, message: "Aucun fichier" });
                }

                const values = req.files.map(f => [f.originalname, f.filename, sujetId]);
                db.query(
                    "INSERT INTO Document_sujet (nom_fichier, chemin_fichier, id_sujet) VALUES ?",
                    [values],
                    (err2) => {
                        if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                        res.status(201).json({
                            success: true,
                            message: `${req.files.length} fichier(s) uploadé(s)`,
                            documents: req.files.map(f => ({ nom_fichier: f.originalname, chemin_fichier: f.filename }))
                        });
                    }
                );
            }
        );
    });

    // --- LISTER DOCUMENTS D'UN SUJET ---
    router.get("/sujets/:id/documents", (req, res) => {
        db.query(
            "SELECT * FROM Document_sujet WHERE id_sujet = ? ORDER BY date_upload DESC",
            [req.params.id],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                res.json({ success: true, documents: results });
            }
        );
    });

    // --- SUPPRIMER UN DOCUMENT ---
    router.delete("/documents/:id", (req, res) => {
        const userId = req.session.userId;
        db.query(
            `SELECT d.* FROM Document_sujet d
             JOIN Sujet s ON d.id_sujet = s.id_sujet
             JOIN Projet p ON s.id_projet = p.id_projet
             WHERE d.id_document = ? AND p.id_utilisateur = ?`,
            [req.params.id, userId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (results.length === 0) return res.status(404).json({ success: false, message: "Document introuvable" });

                const filePath = path.join(__dirname, "..", "uploads", "sujets", results[0].chemin_fichier);
                fs.unlink(filePath, () => {});

                db.query("DELETE FROM Document_sujet WHERE id_document = ?", [req.params.id], (err2) => {
                    if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                    res.json({ success: true, message: "Document supprimé" });
                });
            }
        );
    });

    // --- GROUPES ---
    router.post("/projects/:id/groups", (req, res) => {
        const userId = req.session.userId;
        const { nom, membres } = req.body;

        if (!nom) return res.status(400).json({ success: false, message: "Nom du groupe requis" });

        db.query("SELECT id_projet FROM Projet WHERE id_projet = ? AND id_utilisateur = ?", [req.params.id, userId], (err, results) => {
            if (err || results.length === 0) return res.status(404).json({ success: false, message: "Projet introuvable" });

            db.query("INSERT INTO Groupe (nom, id_projet) VALUES (?, ?)", [nom, req.params.id], (err2, result) => {
                if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                const groupId = result.insertId;

                if (membres && membres.length > 0) {
                    const membreValues = membres.map(m => [m, groupId, false]);
                    db.query("INSERT INTO Membre_de (id_utilisateur, id_groupe, est_team_leader) VALUES ?", [membreValues], () => {});
                }

                res.status(201).json({ success: true, message: "Groupe créé", groupId });
            });
        });
    });

    router.get("/groups/:id", (req, res) => {
        db.query(
            `SELECT g.*, p.nom AS projet_nom, p.id_utilisateur, s.titre AS sujet_titre
             FROM Groupe g
             JOIN Projet p ON g.id_projet = p.id_projet
             LEFT JOIN Sujet s ON g.id_sujet = s.id_sujet
             WHERE g.id_groupe = ?`,
            [req.params.id],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (results.length === 0) return res.status(404).json({ success: false, message: "Groupe introuvable" });
                if (results[0].id_utilisateur !== req.session.userId) {
                    return res.status(403).json({ success: false, message: "Accès refusé" });
                }
                const group = results[0];
                db.query(
                    `SELECT u.id_utilisateur, u.nom, u.prenom, u.email, u.classe, m.est_team_leader
                     FROM Membre_de m JOIN Utilisateur u ON m.id_utilisateur = u.id_utilisateur
                     WHERE m.id_groupe = ?`,
                    [group.id_groupe],
                    (err2, membres) => {
                        if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                        res.json({ success: true, group, membres });
                    }
                );
            }
        );
    });

    router.patch("/groups/:id/team-leader", (req, res) => {
        const { userId: memberId } = req.body;
        const groupId = req.params.id;

        db.query("UPDATE Membre_de SET est_team_leader = FALSE WHERE id_groupe = ?", [groupId], (err) => {
            if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
            db.query("UPDATE Membre_de SET est_team_leader = TRUE WHERE id_groupe = ? AND id_utilisateur = ?", [groupId, memberId], (err2, result) => {
                if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Membre introuvable" });
                res.json({ success: true, message: "Team Leader désigné" });
            });
        });
    });

    // --- MODIFIER UN GROUPE ---
    router.put("/groups/:id", (req, res) => {
        const userId = req.session.userId;
        const { nom, membres } = req.body;

        if (!nom) return res.status(400).json({ success: false, message: "Nom du groupe requis" });

        db.query(
            `SELECT g.id_groupe FROM Groupe g
             JOIN Projet p ON g.id_projet = p.id_projet
             WHERE g.id_groupe = ? AND p.id_utilisateur = ?`,
            [req.params.id, userId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (results.length === 0) return res.status(404).json({ success: false, message: "Groupe introuvable" });

                db.query("UPDATE Groupe SET nom = ? WHERE id_groupe = ?", [nom, req.params.id], (err2) => {
                    if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });

                    if (membres !== undefined) {
                        db.query("SELECT id_utilisateur, est_team_leader FROM Membre_de WHERE id_groupe = ?", [req.params.id], (err3, existing) => {
                            if (err3) return res.status(500).json({ success: false, message: "Erreur serveur" });

                            const leaderMap = {};
                            existing.forEach(m => { leaderMap[m.id_utilisateur] = m.est_team_leader; });

                            db.query("DELETE FROM Membre_de WHERE id_groupe = ?", [req.params.id], (err4) => {
                                if (err4) return res.status(500).json({ success: false, message: "Erreur serveur" });

                                if (membres.length > 0) {
                                    const values = membres.map(m => [m, req.params.id, leaderMap[m] || false]);
                                    db.query("INSERT INTO Membre_de (id_utilisateur, id_groupe, est_team_leader) VALUES ?", [values], () => {});
                                }

                                res.json({ success: true, message: "Groupe modifié" });
                            });
                        });
                    } else {
                        res.json({ success: true, message: "Groupe modifié" });
                    }
                });
            }
        );
    });

    // --- TÂCHES (lecture seule) ---
    router.get("/groups/:id/tasks", (req, res) => {
        db.query(
            `SELECT t.*, j.titre AS jalon_titre,
                GROUP_CONCAT(CONCAT(u.prenom, ' ', u.nom) SEPARATOR ', ') AS assignes
             FROM Tache t
             JOIN Jalon j ON t.id_jalon = j.id_jalon
             LEFT JOIN Assigne_a a ON t.id_tache = a.id_tache
             LEFT JOIN Utilisateur u ON a.id_utilisateur = u.id_utilisateur
             WHERE j.id_groupe = ?
             GROUP BY t.id_tache
             ORDER BY t.priorite DESC, t.date_limite ASC`,
            [req.params.id],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                res.json({ success: true, tasks: results });
            }
        );
    });

    // --- MESSAGES ---
    // Vérifie que le groupe appartient bien à un projet de cet encadrant.
    function ownsGroup(userId, groupId, cb) {
        db.query(
            `SELECT g.id_groupe, g.id_projet, g.nom AS groupe_nom
             FROM Groupe g JOIN Projet p ON g.id_projet = p.id_projet
             WHERE g.id_groupe = ? AND p.id_utilisateur = ?`,
            [groupId, userId],
            (err, rows) => cb(err, rows && rows.length ? rows[0] : null)
        );
    }

    router.get("/groups/:id/messages", (req, res) => {
        ownsGroup(req.session.userId, req.params.id, (err, grp) => {
            if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
            if (!grp) return res.status(403).json({ success: false, message: "Accès refusé" });

            db.query(
                `SELECT m.*, u.nom, u.prenom, u.est_encadrant
                 FROM Message m JOIN Utilisateur u ON m.id_utilisateur = u.id_utilisateur
                 WHERE m.id_groupe = ?
                 ORDER BY m.date_envoi ASC`,
                [req.params.id],
                (err2, results) => {
                    if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                    res.json({ success: true, messages: results });
                }
            );
        });
    });

    router.post("/groups/:id/messages", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.id;
        const { contenu } = req.body;
        if (!contenu || !contenu.trim()) {
            return res.status(400).json({ success: false, message: "Message vide" });
        }

        ownsGroup(userId, groupId, (err, grp) => {
            if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
            if (!grp) return res.status(403).json({ success: false, message: "Accès refusé" });

            db.query(
                "INSERT INTO Message (contenu, id_utilisateur, id_groupe) VALUES (?, ?, ?)",
                [contenu, userId, groupId],
                (err2, result) => {
                    if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                    const messageId = result.insertId;
                    const io = req.app.get("io");

                    // Récupère le message complet pour la diffusion temps réel.
                    db.query(
                        `SELECT m.*, u.nom, u.prenom, u.est_encadrant
                         FROM Message m JOIN Utilisateur u ON m.id_utilisateur = u.id_utilisateur
                         WHERE m.id_message = ?`,
                        [messageId],
                        (err3, msgRows) => {
                            if (!err3 && msgRows.length && io) {
                                io.to("group:" + groupId).emit("new-message", msgRows[0]);
                            }
                        }
                    );

                    // Message de l'encadrant => notifier TOUS les membres du groupe.
                    db.query(
                        "SELECT id_utilisateur FROM Membre_de WHERE id_groupe = ?",
                        [groupId],
                        (err4, membres) => {
                            if (!err4 && membres.length) {
                                const texte = `Nouveau message de l'encadrant dans le groupe « ${grp.groupe_nom} »`;
                                const values = membres.map(mb => [texte, "message", mb.id_utilisateur, grp.id_projet]);
                                db.query(
                                    "INSERT INTO Notification (contenu, type, id_utilisateur, id_projet) VALUES ?",
                                    [values],
                                    () => {}
                                );
                                if (io) {
                                    membres.forEach(mb => {
                                        io.to("user:" + mb.id_utilisateur).emit("new-notification", {
                                            contenu: texte,
                                            type: "message",
                                            id_projet: grp.id_projet,
                                            id_groupe: Number(groupId)
                                        });
                                    });
                                }
                            }

                            res.status(201).json({ success: true, message: "Message envoyé", id_message: messageId });
                        }
                    );
                }
            );
        });
    });

    // Supprimer un message (l'encadrant propriétaire peut supprimer n'importe
    // quel message du groupe — modération).
    router.delete("/groups/:id/messages/:msgId", (req, res) => {
        const userId = req.session.userId;
        const groupId = req.params.id;
        const msgId = req.params.msgId;

        ownsGroup(userId, groupId, (err, grp) => {
            if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
            if (!grp) return res.status(403).json({ success: false, message: "Accès refusé" });

            db.query(
                "DELETE FROM Message WHERE id_message = ? AND id_groupe = ?",
                [msgId, groupId],
                (err2, result) => {
                    if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                    if (result.affectedRows === 0) {
                        return res.status(404).json({ success: false, message: "Message introuvable" });
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

    // --- LIVRABLES ---
    router.get("/groups/:id/deliverables", (req, res) => {
        db.query(
            `SELECT l.*, u.nom AS deposant_nom, u.prenom AS deposant_prenom
             FROM Livrable l
             JOIN Utilisateur u ON l.id_etudiant_deposant = u.id_utilisateur
             WHERE l.id_groupe = ?
             ORDER BY l.date_depot DESC`,
            [req.params.id],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                res.json({ success: true, deliverables: results });
            }
        );
    });

    router.patch("/deliverables/:id/validate", (req, res) => {
        let { statut, commentaire } = req.body;
        // Le front étudiant attend 'Valide' / 'Refuse'. On tolère l'ancien 'Rejete'.
        if (statut === "Rejete") statut = "Refuse";
        const validStatuts = ["Valide", "Refuse"];
        if (!validStatuts.includes(statut)) {
            return res.status(400).json({ success: false, message: "Statut invalide" });
        }

        db.query(
            "UPDATE Livrable SET statut_validation = ?, commentaire_validation = ?, date_validation = NOW(), id_encadrant_validant = ? WHERE id_livrable = ?",
            [statut, commentaire || null, req.session.userId, req.params.id],
            (err, result) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Livrable introuvable" });

                // Notifier l'étudiant qui a déposé le livrable (feedback encadrant)
                const sqlInfo = `
                    SELECT l.nom, l.id_etudiant_deposant,
                           COALESCE(g.id_projet, gp.id_projet) AS id_projet
                    FROM Livrable l
                    LEFT JOIN Groupe g  ON g.id_groupe = l.id_groupe
                    LEFT JOIN Tache t   ON t.id_tache = l.id_tache
                    LEFT JOIN Jalon j   ON j.id_jalon = t.id_jalon
                    LEFT JOIN Groupe gp ON gp.id_groupe = j.id_groupe
                    WHERE l.id_livrable = ?
                `;
                db.query(sqlInfo, [req.params.id], (e2, rows) => {
                    if (!e2 && rows.length) {
                        const r = rows[0];
                        const type = statut === "Valide" ? "validation" : "refus";
                        const contenu = statut === "Valide"
                            ? `Votre livrable « ${r.nom} » a été validé`
                            : `Votre livrable « ${r.nom} » a été refusé — à corriger`;
                        db.query(
                            "INSERT INTO Notification (contenu, type, id_projet, id_utilisateur) VALUES (?, ?, ?, ?)",
                            [contenu, type, r.id_projet || null, r.id_etudiant_deposant],
                            () => res.json({ success: true, message: "Livrable mis à jour" })
                        );
                    } else {
                        res.json({ success: true, message: "Livrable mis à jour" });
                    }
                });
            }
        );
    });

    // --- ÉVALUATION ---
    router.get("/groups/:id/evaluation", (req, res) => {
        const groupId = req.params.id;
        db.query("SELECT * FROM Evaluation WHERE id_groupe = ?", [groupId], (err, evals) => {
            if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
            if (evals.length === 0) return res.json({ success: true, evaluation: null, notes: [] });

            const evalId = evals[0].id_evaluation;
            db.query(
                `SELECT ns.*, ce.nom AS critere_nom, ce.ponderation
                 FROM Note_sur ns JOIN Critere_evaluation ce ON ns.id_critere = ce.id_critere
                 WHERE ns.id_evaluation = ?`,
                [evalId],
                (err2, notes) => {
                    if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                    res.json({ success: true, evaluation: evals[0], notes });
                }
            );
        });
    });

    router.post("/groups/:id/evaluation", (req, res) => {
        const groupId = req.params.id;
        const { commentaire_global, note_finale, notes } = req.body;

        db.query("SELECT id_evaluation FROM Evaluation WHERE id_groupe = ?", [groupId], (err, existing) => {
            if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });

            if (existing.length > 0) {
                const evalId = existing[0].id_evaluation;
                db.query(
                    "UPDATE Evaluation SET commentaire_global = ?, note_finale = ? WHERE id_evaluation = ?",
                    [commentaire_global || null, note_finale, evalId],
                    (err2) => {
                        if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                        if (notes && notes.length > 0) {
                            db.query("DELETE FROM Note_sur WHERE id_evaluation = ?", [evalId], () => {
                                const noteValues = notes.map(n => [evalId, n.id_critere, n.note]);
                                db.query("INSERT INTO Note_sur (id_evaluation, id_critere, note) VALUES ?", [noteValues], () => {});
                            });
                        }
                        res.json({ success: true, message: "Évaluation mise à jour" });
                    }
                );
            } else {
                db.query(
                    "INSERT INTO Evaluation (commentaire_global, note_finale, id_groupe) VALUES (?, ?, ?)",
                    [commentaire_global || null, note_finale, groupId],
                    (err2, result) => {
                        if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                        const evalId = result.insertId;
                        if (notes && notes.length > 0) {
                            const noteValues = notes.map(n => [evalId, n.id_critere, n.note]);
                            db.query("INSERT INTO Note_sur (id_evaluation, id_critere, note) VALUES ?", [noteValues], () => {});
                        }
                        res.status(201).json({ success: true, message: "Évaluation créée" });
                    }
                );
            }
        });
    });

    router.get("/evaluations", (req, res) => {
        const userId = req.session.userId;
        db.query(
            `SELECT e.*, g.nom AS groupe_nom, p.nom AS projet_nom
             FROM Evaluation e
             JOIN Groupe g ON e.id_groupe = g.id_groupe
             JOIN Projet p ON g.id_projet = p.id_projet
             WHERE p.id_utilisateur = ?
             ORDER BY e.date_evaluation DESC`,
            [userId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                res.json({ success: true, evaluations: results });
            }
        );
    });

    // --- NOTES D'ENTREVUE ---
    router.get("/notes", (req, res) => {
        const userId = req.session.userId;
        const { projet, groupe } = req.query;
        let sql = `SELECT n.*, g.nom AS groupe_nom, p.nom AS projet_nom, p.id_projet
                   FROM Note_entrevue n
                   JOIN Groupe g ON n.id_groupe = g.id_groupe
                   JOIN Projet p ON g.id_projet = p.id_projet
                   WHERE p.id_utilisateur = ?`;
        const params = [userId];

        if (projet) {
            sql += " AND p.id_projet = ?";
            params.push(projet);
        }

        if (groupe) {
            sql += " AND n.id_groupe = ?";
            params.push(groupe);
        }

        sql += " ORDER BY n.date_creation DESC";

        db.query(sql, params, (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
            res.json({ success: true, notes: results });
        });
    });

    router.post("/notes", (req, res) => {
        const { titre, contenu, id_groupe } = req.body;
        if (!contenu || !id_groupe) return res.status(400).json({ success: false, message: "Contenu et groupe requis" });

        db.query(
            "INSERT INTO Note_entrevue (titre, contenu, id_utilisateur, id_groupe) VALUES (?, ?, ?, ?)",
            [titre || null, contenu, req.session.userId, id_groupe],
            (err) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                res.status(201).json({ success: true, message: "Note créée" });
            }
        );
    });

    router.put("/notes/:id", (req, res) => {
        const { titre, contenu } = req.body;
        if (!contenu) return res.status(400).json({ success: false, message: "Contenu requis" });

        db.query(
            "UPDATE Note_entrevue SET titre = ?, contenu = ? WHERE id_note = ? AND id_utilisateur = ?",
            [titre || null, contenu, req.params.id, req.session.userId],
            (err, result) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Note introuvable" });
                res.json({ success: true, message: "Note modifiée" });
            }
        );
    });

    router.delete("/notes/:id", (req, res) => {
        db.query(
            "DELETE FROM Note_entrevue WHERE id_note = ? AND id_utilisateur = ?",
            [req.params.id, req.session.userId],
            (err, result) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Note introuvable" });
                res.json({ success: true, message: "Note supprimée" });
            }
        );
    });

    // --- PROFIL ---
    router.get("/profile", (req, res) => {
        db.query(
            "SELECT id_utilisateur, nom, prenom, email, matiere, date_inscription FROM Utilisateur WHERE id_utilisateur = ?",
            [req.session.userId],
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                res.json({ success: true, profile: results[0] });
            }
        );
    });

    router.put("/profile", (req, res) => {
        const { nom, prenom, email, matiere } = req.body;
        db.query(
            "UPDATE Utilisateur SET nom = ?, prenom = ?, email = ?, matiere = ? WHERE id_utilisateur = ?",
            [nom, prenom, email, matiere, req.session.userId],
            (err) => {
                if (err) {
                    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Email déjà utilisé" });
                    return res.status(500).json({ success: false, message: "Erreur serveur" });
                }
                res.json({ success: true, message: "Profil mis à jour" });
            }
        );
    });

    router.put("/profile/password", (req, res) => {
        const { current, nouveau } = req.body;
        if (!current || !nouveau) return res.status(400).json({ success: false, message: "Champs requis" });
        if (nouveau.length < 6) return res.status(400).json({ success: false, message: "6 caractères minimum" });

        const { comparePassword, hashPassword } = require("../utils/password");
        db.query("SELECT mot_de_passe FROM Utilisateur WHERE id_utilisateur = ?", [req.session.userId], async (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
            const match = await comparePassword(current, results[0].mot_de_passe);
            if (!match) {
                return res.status(401).json({ success: false, message: "Mot de passe actuel incorrect" });
            }
            const hashed = await hashPassword(nouveau);
            db.query("UPDATE Utilisateur SET mot_de_passe = ? WHERE id_utilisateur = ?", [hashed, req.session.userId], (err2) => {
                if (err2) return res.status(500).json({ success: false, message: "Erreur serveur" });
                res.json({ success: true, message: "Mot de passe changé" });
            });
        });
    });

    // --- ÉTUDIANTS DISPONIBLES (pour créer un groupe) ---
    router.get("/students", (req, res) => {
        db.query(
            "SELECT id_utilisateur, nom, prenom, email, classe FROM Utilisateur WHERE est_etudiant = TRUE AND est_actif = TRUE ORDER BY nom, prenom",
            (err, results) => {
                if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
                res.json({ success: true, students: results });
            }
        );
    });

    return router;
};
