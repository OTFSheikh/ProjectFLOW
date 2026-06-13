require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mysql = require("mysql2");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { hashPassword, comparePassword } = require("./utils/password");
const { sendResetPasswordEmail } = require("./utils/mailer");
const adminRoutes = require("./routes/admin");
const encadrantRoutes = require("./routes/encadrant");
const etudiantRoutes = require("./routes/etudiant");

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Middleware de session partagé entre Express (HTTP) et Socket.IO (WebSocket).
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "projectflow-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true
    }
});

app.use(sessionMiddleware);

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

    // Migration légère : s'assurer que les colonnes de réinitialisation existent.
    // (ignore l'erreur "Duplicate column" si elles sont déjà présentes)
    db.query(
        "ALTER TABLE Utilisateur ADD COLUMN token_reset VARCHAR(64) NULL",
        (e) => {
            if (e && e.code !== "ER_DUP_FIELDNAME") {
                console.warn("Migration token_reset:", e.code || e.message);
            }
        }
    );
    db.query(
        "ALTER TABLE Utilisateur ADD COLUMN token_reset_expiration DATETIME NULL",
        (e) => {
            if (e && e.code !== "ER_DUP_FIELDNAME") {
                console.warn("Migration token_reset_expiration:", e.code || e.message);
            }
        }
    );

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

app.get("/", (req, res) => {
    res.redirect("/index.html");
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
    const { email, password } = req.body;

    // Le rôle n'est plus demandé au client : il est déduit de la base de données.
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email et mot de passe obligatoires"
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

            // Rôle déterminé uniquement à partir de la base
            let dbRole = "";
            if (user.est_admin === 1) {
                dbRole = "admin";
            } else if (user.est_encadrant === 1) {
                dbRole = "encadrant";
            } else {
                dbRole = "etudiant";
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
MOT DE PASSE OUBLIÉ
----------------------------------
*/

// Étape 1 : l'utilisateur demande un lien de réinitialisation
app.post("/api/auth/forgot-password", (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: "Email obligatoire" });
    }

    // Réponse générique pour ne pas révéler si l'email existe (anti-énumération)
    const genericResponse = {
        success: true,
        message: "Si un compte existe avec cet email, un lien de réinitialisation a été envoyé."
    };

    db.query(
        "SELECT id_utilisateur, prenom, est_actif FROM Utilisateur WHERE email = ?",
        [email],
        (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Erreur serveur" });
            }

            // Pas de compte (ou compte non activé) : on renvoie quand même la réponse générique
            if (results.length === 0 || !results[0].est_actif) {
                return res.json(genericResponse);
            }

            const user = results[0];
            const token = crypto.randomBytes(32).toString("hex");
            const expiration = new Date(Date.now() + 60 * 60 * 1000); // 1 heure

            db.query(
                "UPDATE Utilisateur SET token_reset = ?, token_reset_expiration = ? WHERE id_utilisateur = ?",
                [token, expiration, user.id_utilisateur],
                async (err2) => {
                    if (err2) {
                        return res.status(500).json({ success: false, message: "Erreur serveur" });
                    }
                    try {
                        await sendResetPasswordEmail(email, token, user.prenom);
                    } catch (mailErr) {
                        console.error("Erreur envoi email de réinitialisation:", mailErr);
                    }
                    return res.json(genericResponse);
                }
            );
        }
    );
});

// Étape 2 : l'utilisateur définit son nouveau mot de passe avec le token
app.post("/api/auth/reset-password", (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ success: false, message: "Token et mot de passe requis" });
    }

    if (password.length < 6) {
        return res.status(400).json({ success: false, message: "Le mot de passe doit contenir au moins 6 caractères" });
    }

    db.query(
        "SELECT id_utilisateur, token_reset_expiration FROM Utilisateur WHERE token_reset = ?",
        [token],
        async (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, message: "Erreur serveur" });
            }

            if (results.length === 0) {
                return res.status(400).json({ success: false, message: "Lien invalide ou déjà utilisé" });
            }

            const user = results[0];

            if (!user.token_reset_expiration || new Date() > new Date(user.token_reset_expiration)) {
                return res.status(400).json({ success: false, message: "Lien expiré. Refaites une demande." });
            }

            const hashedPassword = await hashPassword(password);

            db.query(
                "UPDATE Utilisateur SET mot_de_passe = ?, token_reset = NULL, token_reset_expiration = NULL WHERE id_utilisateur = ?",
                [hashedPassword, user.id_utilisateur],
                (err2) => {
                    if (err2) {
                        return res.status(500).json({ success: false, message: "Erreur serveur" });
                    }
                    res.json({ success: true, message: "Mot de passe réinitialisé avec succès" });
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
TEMPS RÉEL (Socket.IO) — chat de groupe + notifications
----------------------------------
Un seul fil de discussion par groupe. Y ont accès :
  - les étudiants membres du groupe (table Membre_de)
  - l'encadrant propriétaire du projet auquel le groupe appartient
Chaque socket rejoint :
  - "user:<id>"   pour recevoir ses notifications en direct
  - "group:<id>"  pour recevoir les messages du/des groupe(s) qu'il consulte
*/

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: true, credentials: true }
});

// On expose io aux routes via req.app.get("io")
app.set("io", io);

// Partage de la session HTTP avec les connexions Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// Vérifie qu'un utilisateur a le droit d'accéder au chat d'un groupe
function canAccessGroup(userId, groupId, cb) {
    db.query(
        `SELECT 1 FROM Groupe g
         JOIN Projet p ON p.id_projet = g.id_projet
         WHERE g.id_groupe = ?
           AND ( p.id_utilisateur = ?
                 OR EXISTS (SELECT 1 FROM Membre_de md
                            WHERE md.id_groupe = g.id_groupe AND md.id_utilisateur = ?) )
         LIMIT 1`,
        [groupId, userId, userId],
        (err, rows) => cb(err, !!(rows && rows.length))
    );
}

io.on("connection", (socket) => {
    const sess = socket.request.session;
    const userId = sess && sess.userId;

    // Connexion non authentifiée : on coupe.
    if (!userId) {
        socket.disconnect(true);
        return;
    }

    // Salon personnel pour les notifications en direct
    socket.join("user:" + userId);

    socket.on("join-group", (groupId) => {
        if (!groupId) return;
        canAccessGroup(userId, groupId, (err, ok) => {
            if (!err && ok) socket.join("group:" + groupId);
        });
    });

    socket.on("leave-group", (groupId) => {
        if (groupId) socket.leave("group:" + groupId);
    });
});

/*
----------------------------------
Lancement serveur (écoute sur tout le réseau pour l'accès WiFi local)
----------------------------------
*/

const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
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