const express = require("express");
const crypto = require("crypto");
const { requireAdmin } = require("../middleware/auth");
const { hashPassword } = require("../utils/password");
const { sendActivationEmail } = require("../utils/mailer");

module.exports = function (db) {
    const router = express.Router();

    router.use(requireAdmin);

    // GET /api/admin/users — Lister avec filtres
    router.get("/users", (req, res) => {
        const { role, search } = req.query;

        let sql = `SELECT id_utilisateur, nom, prenom, email, est_etudiant, est_encadrant, est_admin, classe, matiere, est_actif, date_inscription FROM Utilisateur WHERE 1=1`;
        const params = [];

        if (role === "etudiant") {
            sql += " AND est_etudiant = TRUE";
        } else if (role === "encadrant") {
            sql += " AND est_encadrant = TRUE";
        } else if (role === "admin") {
            sql += " AND est_admin = TRUE";
        }

        if (search) {
            sql += " AND (nom LIKE ? OR prenom LIKE ? OR email LIKE ?)";
            const like = `%${search}%`;
            params.push(like, like, like);
        }

        sql += " ORDER BY date_inscription DESC";

        db.query(sql, params, (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Erreur serveur" });
            }
            res.json({ success: true, users: results });
        });
    });

    // GET /api/admin/users/:id — Récupérer un utilisateur
    router.get("/users/:id", (req, res) => {
        const sql = `SELECT id_utilisateur, nom, prenom, email, est_etudiant, est_encadrant, est_admin, classe, matiere, est_actif, date_inscription FROM Utilisateur WHERE id_utilisateur = ?`;

        db.query(sql, [req.params.id], (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Erreur serveur" });
            }
            if (results.length === 0) {
                return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
            }
            res.json({ success: true, user: results[0] });
        });
    });

    // POST /api/admin/users — Créer un utilisateur
    router.post("/users", async (req, res) => {
        const { nom, prenom, email, role, classe, matiere } = req.body;

        if (!nom || !prenom || !email || !role) {
            return res.status(400).json({ success: false, message: "Champs obligatoires manquants" });
        }

        const validRoles = ["etudiant", "encadrant", "admin"];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: "Rôle invalide" });
        }

        if (role === "etudiant") {
            const validClasses = ["ISEN 1", "ISEN 2", "ISEN 3", "ISEN 4", "ISEN 5"];
            if (!classe || !validClasses.includes(classe)) {
                return res.status(400).json({ success: false, message: "Classe invalide pour un étudiant" });
            }
        }

        const token = crypto.randomBytes(32).toString("hex");
        const expiration = new Date(Date.now() + 48 * 60 * 60 * 1000);

        const sql = `INSERT INTO Utilisateur (nom, prenom, email, mot_de_passe, est_actif, est_etudiant, est_encadrant, est_admin, classe, matiere, token_activation, token_expiration) VALUES (?, ?, ?, NULL, FALSE, ?, ?, ?, ?, ?, ?, ?)`;

        const params = [
            nom,
            prenom,
            email,
            role === "etudiant" ? 1 : 0,
            role === "encadrant" ? 1 : 0,
            role === "admin" ? 1 : 0,
            role === "etudiant" ? classe : null,
            role === "encadrant" ? matiere : null,
            token,
            expiration
        ];

        db.query(sql, params, async (err, result) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY") {
                    return res.status(409).json({ success: false, message: "Cet email existe déjà" });
                }
                return res.status(500).json({ success: false, message: "Erreur serveur" });
            }

            try {
                await sendActivationEmail(email, token, prenom);
            } catch (mailErr) {
                console.error("[MAIL ERROR]", mailErr.message);
            }

            res.status(201).json({
                success: true,
                message: "Utilisateur créé. Email d'activation envoyé.",
                userId: result.insertId
            });
        });
    });

    // PUT /api/admin/users/:id — Modifier un utilisateur
    router.put("/users/:id", (req, res) => {
        const { nom, prenom, email, role, classe, matiere } = req.body;
        const id = req.params.id;

        if (!nom || !prenom || !email || !role) {
            return res.status(400).json({ success: false, message: "Champs obligatoires manquants" });
        }

        const validRoles = ["etudiant", "encadrant", "admin"];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: "Rôle invalide" });
        }

        if (role === "etudiant") {
            const validClasses = ["ISEN 1", "ISEN 2", "ISEN 3", "ISEN 4", "ISEN 5"];
            if (!classe || !validClasses.includes(classe)) {
                return res.status(400).json({ success: false, message: "Classe invalide pour un étudiant" });
            }
        }

        const sql = `UPDATE Utilisateur SET nom = ?, prenom = ?, email = ?, est_etudiant = ?, est_encadrant = ?, est_admin = ?, classe = ?, matiere = ? WHERE id_utilisateur = ?`;

        const params = [
            nom,
            prenom,
            email,
            role === "etudiant" ? 1 : 0,
            role === "encadrant" ? 1 : 0,
            role === "admin" ? 1 : 0,
            role === "etudiant" ? classe : null,
            role === "encadrant" ? matiere : null,
            id
        ];

        db.query(sql, params, (err, result) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY") {
                    return res.status(409).json({ success: false, message: "Cet email existe déjà" });
                }
                return res.status(500).json({ success: false, message: "Erreur serveur" });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
            }
            res.json({ success: true, message: "Utilisateur modifié" });
        });
    });

    // PATCH /api/admin/users/:id/toggle-active — Activer/Désactiver
    router.patch("/users/:id/toggle-active", (req, res) => {
        const id = req.params.id;

        db.query("SELECT est_actif FROM Utilisateur WHERE id_utilisateur = ?", [id], (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Erreur serveur" });
            }
            if (results.length === 0) {
                return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
            }

            const newStatus = results[0].est_actif ? 0 : 1;

            db.query("UPDATE Utilisateur SET est_actif = ? WHERE id_utilisateur = ?", [newStatus, id], (err2) => {
                if (err2) {
                    return res.status(500).json({ success: false, message: "Erreur serveur" });
                }
                res.json({
                    success: true,
                    message: newStatus ? "Utilisateur activé" : "Utilisateur désactivé",
                    est_actif: !!newStatus
                });
            });
        });
    });

    return router;
};
