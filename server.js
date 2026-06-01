require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

/*
----------------------------------
Connexion MySQL
----------------------------------
*/

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {

    if (err) {
        console.error(err);
        return;
    }

    console.log("MySQL connecté");
});

/*
----------------------------------
Route de test
----------------------------------
*/

app.get("/", (req, res) => {

    res.json({
        message: "Backend ProjectFlow actif"
    });

});

/*
----------------------------------
AUTHENTIFICATION
----------------------------------
*/

app.post("/api/auth/login", (req, res) => {

    const {
        email,
        password,
        role
    } = req.body;

    if (!email || !password || !role) {

        return res.status(400).json({
            success: false,
            message: "Tous les champs sont obligatoires"
        });
    }

    db.query(
        "SELECT * FROM utilisateur WHERE email = ?",
        [email],
        (err, result) => {

            if (err) {

                return res.status(500).json({
                    success: false,
                    message: "Erreur serveur"
                });
            }

            if (result.length === 0) {

                return res.status(404).json({
                    success: false,
                    message: "Utilisateur introuvable"
                });
            }

            const user = result[0];

            /*
            Vérification mot de passe
            */

            if (password !== user.mot_de_passe) {

                return res.status(401).json({
                    success: false,
                    message: "Mot de passe incorrect"
                });
            }

            /*
            Vérification rôle
            */

            let dbRole = "";

            if (user.est_admin === 1) {

                dbRole = "admin";

            } else if (user.est_encadrant === 1) {

                dbRole = "encadrant";

            } else {

                dbRole = "etudiant";
            }

            if (role !== dbRole) {

                return res.status(403).json({
                    success: false,
                    message: "Le rôle sélectionné est incorrect"
                });
            }

            /*
            Succès
            */

            return res.json({

                success: true,

                message: "Connexion réussie",

                utilisateur: {
                    id: user.id_utilisateur,
                    nom: user.nom,
                    prenom: user.prenom,
                    email: user.email
                },

                role: dbRole

            });

        }
    );
});

/*
----------------------------------
Lancement serveur
----------------------------------
*/

app.listen(process.env.PORT, () => {

    console.log(
        `Serveur démarré sur http://localhost:${process.env.PORT}`
    );

});