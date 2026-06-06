require("dotenv").config();

const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { hashPassword, comparePassword } = require("./utils/password");
const adminRoutes = require("./routes/admin");
const encadrantRoutes = require("./routes/encadrant");
const etudiantRoutes = require("./routes/etudiant");

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || "projectflow-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true
    }
}));

/*
----------------------------------
Connexion MySQL
----------------------------------
*/

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Id de l'étudiant utilisé pour la session par défaut (mode "sans connexion")
let defaultEtudiantId = null;

db.connect((err) => {
    if (err) {
        console.error("Erreur connexion MySQL:", err);
        return;
    }
    console.log("MySQL connecté");

    // On résout une fois l'étudiant démo pour la session automatique
    db.query(
        "SELECT id_utilisateur FROM Utilisateur WHERE email = 'etu.demo@test.local' LIMIT 1",
        (e, r) => {
            if (!e && r.length) {
                defaultEtudiantId = r[0].id_utilisateur;
                console.log("Session étudiant par défaut active (id =", defaultEtudiantId + ")");
            } else {
                console.warn("Étudiant démo introuvable — lance le SQL de seed (etu.demo@test.local).");
            }
        }
    );
});

/*
----------------------------------
MODE SANS CONNEXION (DEV)
Injecte automatiquement une session étudiant si aucune session active.
DÉSACTIVÉ par défaut : pour le chat multi-utilisateurs sur le même WiFi,
chaque personne doit se connecter avec SON propre compte (sinon tout le monde
serait vu comme le même étudiant démo).
Pour réactiver le mode démo solo : mettre DEV_AUTO_LOGIN=true dans le .env
----------------------------------
*/
const DEV_AUTO_LOGIN = process.env.DEV_AUTO_LOGIN === "true";

app.use((req, res, next) => {
    if (DEV_AUTO_LOGIN && !req.session.userId && defaultEtudiantId) {
        req.session.userId = defaultEtudiantId;
        req.session.role = "etudiant";
    }
    next();
});

// La racine : espace étudiant si mode démo, sinon page de connexion
app.get("/", (req, res) => {
    if (DEV_AUTO_LOGIN) {
        return res.redirect("/etudiant/dashboard-student.html");
    }
    res.redirect("/login.html");
});

app.use(express.static(path.join(__dirname, "public")));
// Les fichiers sont rangés dans uploads/sujets et uploads/livrables, mais le
// front construit les URLs sous la forme /uploads/<fichier>. On ajoute donc un
// "fallthrough" sur les sous-dossiers pour que /uploads/<fichier> les retrouve.
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/uploads", express.static(path.join(__dirname, "uploads", "sujets")));
app.use("/uploads", express.static(path.join(__dirname, "uploads", "livrables")));

/*
----------------------------------
AUTHENTIFICATION
----------------------------------
*/

app.post("/api/auth/login", (req, res) => {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
        return res.status(400).json({
            success: false,
            message: "Tous les champs sont obligatoires"
        });
    }

    db.query(
        "SELECT * FROM Utilisateur WHERE email = ?",
        [email],
        async (err, result) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Erreur serveur" });
            }

            if (result.length === 0) {
                return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
            }

            const user = result[0];

            if (!user.est_actif) {
                return res.status(403).json({ success: false, message: "Compte non activé" });
            }

            const passwordMatch = await comparePassword(password, user.mot_de_passe);
            if (!passwordMatch) {
                return res.status(401).json({ success: false, message: "Mot de passe incorrect" });
            }

            let dbRole = "";
            if (user.est_admin === 1) {
                dbRole = "admin";
            } else if (user.est_encadrant === 1) {
                dbRole = "encadrant";
            } else {
                dbRole = "etudiant";
            }

            if (role !== dbRole) {
                return res.status(403).json({ success: false, message: "Le rôle sélectionné est incorrect" });
            }

            req.session.userId = user.id_utilisateur;
            req.session.role = dbRole;

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

app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: "Déconnexion réussie" });
    });
});

app.get("/api/auth/me", (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ success: false, message: "Non connecté" });
    }
    db.query(
        "SELECT id_utilisateur, nom, prenom, email, est_admin, est_encadrant, est_etudiant FROM Utilisateur WHERE id_utilisateur = ?",
        [req.session.userId],
        (err, results) => {
            if (err || results.length === 0) {
                return res.status(500).json({ success: false, message: "Erreur serveur" });
            }
            res.json({ success: true, utilisateur: results[0], role: req.session.role });
        }
    );
});

/*
----------------------------------
ACTIVATION DE COMPTE
----------------------------------
*/

app.post("/api/auth/activate", (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ success: false, message: "Token et mot de passe requis" });
    }

    if (password.length < 6) {
        return res.status(400).json({ success: false, message: "Le mot de passe doit contenir au moins 6 caractères" });
    }

    db.query(
        "SELECT id_utilisateur, token_expiration FROM Utilisateur WHERE token_activation = ?",
        [token],
        async (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Erreur serveur" });
            }

            if (results.length === 0) {
                return res.status(400).json({ success: false, message: "Token invalide" });
            }

            const user = results[0];

            if (new Date() > new Date(user.token_expiration)) {
                return res.status(400).json({ success: false, message: "Token expiré" });
            }

            const hashedPassword = await hashPassword(password);

            db.query(
                "UPDATE Utilisateur SET mot_de_passe = ?, est_actif = TRUE, token_activation = NULL, token_expiration = NULL WHERE id_utilisateur = ?",
                [hashedPassword, user.id_utilisateur],
                (err2) => {
                    if (err2) {
                        return res.status(500).json({ success: false, message: "Erreur serveur" });
                    }
                    res.json({ success: true, message: "Compte activé avec succès" });
                }
            );
        }
    );
});

/*
----------------------------------
ROUTES API
----------------------------------
*/

app.use("/api/admin", adminRoutes(db));
app.use("/api/encadrant", encadrantRoutes(db));
app.use("/api/etudiant", etudiantRoutes(db));

/*
----------------------------------
Lancement serveur (écoute sur tout le réseau pour l'accès WiFi local)
----------------------------------
*/

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("============================================================");
    console.log(`  ProjectFLOW démarré sur le port ${PORT}`);
    console.log("------------------------------------------------------------");
    console.log(`  Sur cette machine : http://localhost:${PORT}`);

    // Affiche les adresses IP du réseau local (pour les autres machines en WiFi)
    const nets = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net.family === "IPv4" && !net.internal) {
                addresses.push(net.address);
            }
        }
    }
    if (addresses.length) {
        console.log("  Pour les autres (même WiFi) :");
        addresses.forEach((ip) => console.log(`      http://${ip}:${PORT}`));
    } else {
        console.log("  (Aucune IP réseau détectée — vérifie ta connexion WiFi)");
    }
    console.log(`  Auto-login démo : ${DEV_AUTO_LOGIN ? "ACTIVÉ" : "désactivé (connexion par compte)"}`);
    console.log("============================================================");
});