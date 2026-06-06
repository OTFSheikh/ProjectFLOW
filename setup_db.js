/*
 * setup_db.js — Crée la base et charge le schéma en réutilisant EXACTEMENT
 * la configuration de ton .env (même hôte, même port, mêmes identifiants).
 *
 *   node setup_db.js           -> crée la base + charge plateforme_projets.sql
 *   node setup_db.js --seed    -> en plus, charge seed_etudiant.sql (comptes de test)
 *   node setup_db.js --reset   -> SUPPRIME puis recrée la base (repart de zéro)
 */
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");

// --- Lecture simple du .env (sans dépendance) ---
function loadEnv() {
    const env = {};
    try {
        const txt = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
        txt.split(/\r?\n/).forEach((line) => {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
            if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        });
    } catch (e) {
        console.error("Impossible de lire le fichier .env :", e.message);
        process.exit(1);
    }
    return env;
}

const env = loadEnv();
const HOST = env.DB_HOST || "localhost";
const PORT = Number(env.DB_PORT || 3306);
const USER = env.DB_USER || "root";
const PASSWORD = env.DB_PASSWORD || "";
const DB = env.DB_NAME || "plateforme_projets";

const wantSeed = process.argv.includes("--seed");
const wantReset = process.argv.includes("--reset");

console.log(`Connexion MySQL : ${USER}@${HOST}:${PORT} (base cible : ${DB})`);

const conn = mysql.createConnection({
    host: HOST, port: PORT, user: USER, password: PASSWORD,
    multipleStatements: true
});

function run(sql, cb) {
    conn.query(sql, (err) => cb(err));
}

function loadFile(file, next) {
    const p = path.join(__dirname, file);
    if (!fs.existsSync(p)) {
        console.log(`(ignoré) ${file} introuvable`);
        return next();
    }
    const sql = fs.readFileSync(p, "utf8");
    conn.query(`USE \`${DB}\`; ${sql}`, (err) => {
        if (err) {
            console.error(`Erreur en chargeant ${file} :`, err.sqlMessage || err.message);
            conn.end();
            process.exit(1);
        }
        console.log(`OK  -> ${file} chargé`);
        next();
    });
}

conn.connect((err) => {
    if (err) {
        console.error("Connexion échouée :", err.sqlMessage || err.message);
        process.exit(1);
    }

    const steps = [];
    if (wantReset) steps.push((n) => run(`DROP DATABASE IF EXISTS \`${DB}\``, (e) => { if (e) { console.error(e.message); process.exit(1);} console.log("Base supprimée (reset)"); n(); }));
    steps.push((n) => run(`CREATE DATABASE IF NOT EXISTS \`${DB}\` CHARACTER SET utf8mb4`, (e) => { if (e) { console.error(e.message); process.exit(1);} console.log(`OK  -> base \`${DB}\` prête`); n(); }));
    steps.push((n) => loadFile("plateforme_projets.sql", n));
    if (wantSeed) steps.push((n) => loadFile("seed_etudiant.sql", n));

    // exécution séquentielle
    (function nextStep(i) {
        if (i >= steps.length) {
            console.log("\nTerminé. Tu peux lancer : npm run dev");
            conn.end();
            return;
        }
        steps[i](() => nextStep(i + 1));
    })(0);
});
