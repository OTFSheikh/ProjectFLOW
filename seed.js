/* ============================================================
   Seed de démonstration — ProjectFLOW
   Remplit la base avec un jeu de données réaliste et volumineux.
   - Réinitialise toutes les données SAUF le compte admin.
   - Mot de passe commun : demo123 (stocké en clair, accepté par le login).
   Lancer :  node seed.js
============================================================ */
require("dotenv").config();
const mysql = require("mysql2/promise");

const PASSWORD = "demo123";

// ---------- Données curées ----------
const ENCADRANTS = [
    { prenom: "Awa", nom: "Diallo", matiere: "Génie logiciel" },
    { prenom: "Mamadou", nom: "Ndiaye", matiere: "Développement web" },
    { prenom: "Fatou", nom: "Sow", matiere: "Réseaux & sécurité" },
    { prenom: "Ousmane", nom: "Ba", matiere: "Data Science" },
    { prenom: "Aïssatou", nom: "Fall", matiere: "Bases de données" },
    { prenom: "Ibrahima", nom: "Gueye", matiere: "Systèmes & IoT" },
    { prenom: "Mariama", nom: "Sarr", matiere: "Intelligence artificielle" },
    { prenom: "Cheikh", nom: "Sy", matiere: "Développement mobile" },
    { prenom: "Bineta", nom: "Cissé", matiere: "Cybersécurité" },
    { prenom: "Abdoulaye", nom: "Faye", matiere: "Cloud & DevOps" }
];

const FIRST_NAMES = ["Mamadou", "Fatou", "Ousmane", "Aïssatou", "Ibrahima", "Mariama", "Cheikh", "Bineta", "Abdoulaye", "Khady",
    "Moussa", "Ndeye", "Modou", "Sokhna", "Pape", "Adama", "Rama", "Lamine", "Coumba", "Seydou",
    "Astou", "Babacar", "Dior", "Alioune", "Maïmouna", "Serigne", "Yacine", "Idrissa", "Fatoumata", "Souleymane",
    "Aminata", "Rokhaya", "Mor", "Daouda", "Sophie", "Lucas", "Emma", "Nicolas", "Léa", "Thomas",
    "Camille", "Antoine", "Inès", "Hugo", "Manon", "Yanis", "Sarah", "Adja", "Malick", "Ramatoulaye"];
const LAST_NAMES = ["Diop", "Ndiaye", "Fall", "Sow", "Ba", "Diallo", "Sy", "Gueye", "Sarr", "Cissé",
    "Faye", "Mbaye", "Niang", "Kane", "Thiam", "Sene", "Diouf", "Toure", "Camara", "Diagne",
    "Wade", "Lo", "Sagna", "Badji", "Dieng", "Sané", "Mendy", "Coly", "Tine", "Martin",
    "Bernard", "Dubois", "Petit", "Robert", "Durand", "Moreau", "Laurent", "Girard", "Gomis", "Boye"];
const CLASSES = ["ISEN 3", "ISEN 4", "ISEN 5"];

const PROJECTS = [
    { titre: "Application mobile de covoiturage étudiant", desc: "Mise en relation d'étudiants pour partager des trajets domicile-campus." },
    { titre: "Plateforme e-learning avec quiz adaptatifs", desc: "Cours en ligne et quiz qui s'adaptent au niveau de l'apprenant." },
    { titre: "Système de réservation de salles connecté (IoT)", desc: "Réservation de salles avec capteurs de présence et affichage temps réel." },
    { titre: "Détection de fraude bancaire par machine learning", desc: "Modèle de classification des transactions suspectes." },
    { titre: "Réseau social de partage de notes de cours", desc: "Partage, notation et recherche de supports de cours entre étudiants." },
    { titre: "Tableau de bord de supervision réseau (SNMP)", desc: "Monitoring des équipements réseau et alertes en temps réel." },
    { titre: "Site e-commerce de produits artisanaux locaux", desc: "Boutique en ligne pour artisans avec paiement et suivi de commandes." },
    { titre: "Application de gestion de bibliothèque universitaire", desc: "Catalogue, emprunts, retours et réservations d'ouvrages." },
    { titre: "Jeu éducatif d'initiation à la cybersécurité", desc: "Serious game pour sensibiliser aux bonnes pratiques de sécurité." },
    { titre: "Analyse de sentiments des avis clients (NLP)", desc: "Traitement automatique du langage pour classer les avis." },
    { titre: "Système de vote électronique sécurisé", desc: "Plateforme de vote en ligne avec chiffrement et anonymat." },
    { titre: "Plateforme de gestion de tournois e-sport", desc: "Inscriptions, brackets et résultats pour tournois en ligne." },
    { titre: "Assistant de révision par répétition espacée", desc: "Flashcards intelligentes basées sur la courbe d'oubli." },
    { titre: "Application de suivi nutritionnel et sportif", desc: "Journal alimentaire, objectifs et suivi des activités physiques." },
    { titre: "Marketplace de cours particuliers entre étudiants", desc: "Mise en relation tuteurs/élèves avec réservation et paiement." },
    { titre: "Chatbot d'orientation académique", desc: "Assistant conversationnel pour guider les choix de filières." },
    { titre: "Billetterie en ligne pour événements du campus", desc: "Vente de billets, QR codes et contrôle d'accès aux événements." },
    { titre: "API de cartographie collaborative du campus", desc: "Service de cartographie des bâtiments et points d'intérêt du campus." }
];

const SUJET_SUFFIXES = [
    "Conception de l'architecture et du modèle de données",
    "Développement des fonctionnalités principales et tests"
];
const CRITERES = [
    ["Fonctionnalités", 40],
    ["Qualité du code", 25],
    ["Présentation orale", 20],
    ["Documentation", 15]
];

const MSG_MEMBRE = ["Salut tout le monde, on se répartit les tâches ?", "J'ai poussé ma partie.", "On se cale une réunion demain à 14h ?",
    "La maquette est prête, vos retours ?", "Je bloque sur l'API, un coup de main ?", "Bien joué pour le dernier livrable !",
    "N'oubliez pas l'échéance de vendredi.", "J'ai terminé ma tâche, je passe à la suivante."];
const MSG_ENCADRANT = ["Pensez à documenter votre code.", "Bon avancement, continuez ainsi.", "Déposez-moi un point d'étape svp.",
    "Attention au respect des jalons.", "Très bon travail sur le dernier livrable."];
const COM_TACHE = ["Je m'en occupe cet après-midi.", "Presque fini, il me reste les tests.", "Bloqué, besoin d'aide.", "Terminé de mon côté."];
const COM_LIVRABLE_M = ["J'ai mis la dernière version.", "Relisez la section 3 svp.", "On a corrigé les retours."];
const COM_LIVRABLE_E = ["Bon travail, quelques détails à revoir.", "Il manque la bibliographie.", "Très clair, validé.", "Revoyez la partie tests."];
const LIVRABLE_NOMS = ["Rapport intermédiaire.pdf", "Cahier des charges.pdf", "Diagramme UML.pdf", "Code source.zip",
    "Présentation soutenance.pptx", "Documentation technique.pdf", "Manuel utilisateur.pdf"];

// ---------- Helpers ----------
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
const dstr = (d) => d.toISOString().slice(0, 10);
const dts = (d) => d.toISOString().slice(0, 19).replace("T", " ");
function addDays(base, n) { const d = new Date(base); d.setDate(d.getDate() + n); return d; }
function addMonths(base, n) { const d = new Date(base); d.setMonth(d.getMonth() + n); return d; }
function slug(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

const NOW = new Date();

main().catch(e => { console.error("ERREUR SEED:", e); process.exit(1); });

async function main() {
    const db = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true
    });
    console.log("Connecté à la base", process.env.DB_NAME);

    const ins = async (sql, params) => { const [r] = await db.execute(sql, params); return r.insertId; };
    const batch = async (sql, rows) => { if (!rows.length) return; await db.query(sql, [rows]); };

    // ---------- RESET (sauf admin) ----------
    const TABLES = ["Note_sur", "Evaluation", "Critere_evaluation", "Note_entrevue", "Notification", "Message",
        "Commentaire", "Livrable", "Assigne_a", "Tache", "Jalon", "Membre_de", "Groupe", "Document_sujet", "Sujet", "Projet"];
    await db.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of TABLES) await db.query(`TRUNCATE TABLE ${t}`);
    await db.query("DELETE FROM Utilisateur WHERE est_admin = 0");
    await db.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("Reset effectué (admin conservé).");

    // ---------- Encadrants ----------
    const encIds = [];
    for (const e of ENCADRANTS) {
        const email = `${slug(e.prenom)}.${slug(e.nom)}@isen.demo`;
        const id = await ins(
            `INSERT INTO Utilisateur (nom, prenom, email, mot_de_passe, est_actif, est_etudiant, est_encadrant, est_admin, matiere)
             VALUES (?,?,?,?,TRUE,FALSE,TRUE,FALSE,?)`,
            [e.nom, e.prenom, email, PASSWORD, e.matiere]
        );
        encIds.push(id);
    }
    console.log(`${encIds.length} encadrants créés.`);

    // ---------- Étudiants (~60, emails uniques) ----------
    const usedEmails = new Set();
    const students = [];
    const TARGET_STUDENTS = 60;
    let guard = 0;
    while (students.length < TARGET_STUDENTS && guard < 5000) {
        guard++;
        const prenom = pick(FIRST_NAMES);
        const nom = pick(LAST_NAMES);
        let base = `${slug(prenom)}.${slug(nom)}`;
        let email = `${base}@isen.demo`;
        let n = 1;
        while (usedEmails.has(email)) { email = `${base}${n}@isen.demo`; n++; }
        usedEmails.add(email);
        const classe = pick(CLASSES);
        const id = await ins(
            `INSERT INTO Utilisateur (nom, prenom, email, mot_de_passe, est_actif, est_etudiant, est_encadrant, est_admin, classe)
             VALUES (?,?,?,?,TRUE,TRUE,FALSE,FALSE,?)`,
            [nom, prenom, email, PASSWORD, classe]
        );
        students.push({ id, prenom, nom, classe });
    }
    console.log(`${students.length} étudiants créés.`);

    // ---------- Projets + sujets + critères ----------
    const phases = ["termine", "encours", "encours", "retard", "nouveau"];
    const projets = [];
    for (let i = 0; i < PROJECTS.length; i++) {
        const def = PROJECTS[i];
        const encId = encIds[i % encIds.length]; // round-robin -> certains encadrants ont 2 projets
        // décalage pour que les 2 projets d'un même encadrant aient des phases différentes
        const phase = phases[(i + Math.floor(i / encIds.length)) % phases.length];
        let dDeb, dFin, etat;
        if (phase === "termine") { dDeb = addMonths(NOW, -9); dFin = addMonths(NOW, -1); etat = "Cloture"; }
        else if (phase === "encours") { dDeb = addMonths(NOW, -3); dFin = addMonths(NOW, 3); etat = "En cours"; }
        else if (phase === "retard") { dDeb = addMonths(NOW, -5); dFin = addMonths(NOW, 1); etat = "En cours"; }
        else { dDeb = addDays(NOW, -7); dFin = addMonths(NOW, 5); etat = "Ouvert"; }
        const promo = pick(CLASSES);
        const pid = await ins(
            `INSERT INTO Projet (nom, description, date_debut, date_fin, etat, promo, id_utilisateur) VALUES (?,?,?,?,?,?,?)`,
            [def.titre, def.desc, dstr(dDeb), dstr(dFin), etat, promo, encId]
        );
        const sujetIds = [];
        for (const suf of SUJET_SUFFIXES) {
            const sid = await ins(`INSERT INTO Sujet (titre, description, id_projet) VALUES (?,?,?)`,
                [`${def.titre} — ${suf}`, def.desc, pid]);
            sujetIds.push(sid);
        }
        for (const [cnom, pond] of CRITERES) {
            await ins(`INSERT INTO Critere_evaluation (nom, ponderation, description, id_projet) VALUES (?,?,?,?)`,
                [cnom, pond, null, pid]);
        }
        projets.push({ id: pid, encId, phase, dDeb, dFin, sujetIds });
    }
    console.log(`${projets.length} projets créés (avec sujets + critères).`);

    await seedGroups(db, ins, batch, projets, students);

    // ---------- Récap ----------
    const [[c]] = await db.query(`SELECT
        (SELECT COUNT(*) FROM Utilisateur WHERE est_encadrant) AS encadrants,
        (SELECT COUNT(*) FROM Utilisateur WHERE est_etudiant) AS etudiants,
        (SELECT COUNT(*) FROM Projet) AS projets,
        (SELECT COUNT(*) FROM Groupe) AS groupes,
        (SELECT COUNT(*) FROM Membre_de) AS membres,
        (SELECT COUNT(*) FROM Tache) AS taches,
        (SELECT COUNT(*) FROM Livrable) AS livrables,
        (SELECT COUNT(*) FROM Message) AS messages,
        (SELECT COUNT(*) FROM Evaluation) AS evaluations,
        (SELECT COUNT(*) FROM Notification) AS notifications`);
    console.log("------------------------------------------------------------");
    console.log("Seed terminé :", c);
    console.log("Connexion : <email>  /  mot de passe : " + PASSWORD);
    console.log("Exemple encadrant : awa.diallo@isen.demo");
    console.log("------------------------------------------------------------");

    await db.end();
}

const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// États de groupe possibles selon la phase du projet
function groupStatesForPhase(phase, nb) {
    const out = [];
    for (let i = 0; i < nb; i++) {
        if (phase === "termine") out.push(i % 2 === 0 ? "Soutenu" : "Cloture");
        else if (phase === "encours") out.push(i === 0 ? "Livre" : (i === 1 ? "En_retard" : "En_cours"));
        else if (phase === "retard") out.push(i % 3 === 0 ? "En_cours" : "En_retard");
        else out.push(i % 2 === 0 ? "Propose" : "En_cours"); // nouveau
    }
    return out;
}

async function seedGroups(db, ins, batch, projets, students) {
    for (const proj of projets) {
        const nbGroups = rint(3, 6);
        const states = groupStatesForPhase(proj.phase, nbGroups);
        const pool = shuffle(students.slice()); // réordonné par projet -> chevauchement entre projets
        let cursor = 0;

        for (let g = 0; g < nbGroups; g++) {
            const etat = states[g];
            const size = Math.min(rint(3, 5), pool.length - cursor);
            if (size < 2) break;
            const members = pool.slice(cursor, cursor + size);
            cursor += size;

            const gid = await ins(
                `INSERT INTO Groupe (nom, etat, id_projet, id_sujet) VALUES (?,?,?,?)`,
                [`Groupe ${GROUP_LETTERS[g]}`, etat, proj.id, pick(proj.sujetIds)]
            );
            // Membres (le premier = Team Leader)
            await batch(
                `INSERT INTO Membre_de (id_utilisateur, id_groupe, est_team_leader) VALUES ?`,
                members.map((m, idx) => [m.id, gid, idx === 0])
            );

            await seedTasks(db, ins, batch, proj, gid, etat, members);
            await seedLivrablesEtc(db, ins, batch, proj, gid, etat, members);
        }
    }
}

async function seedTasks(db, ins, batch, proj, gid, etat, members) {
    if (etat === "Propose") return; // pas encore démarré
    const finished = ["Livre", "Soutenu", "Cloture"].includes(etat);
    const nbJalons = rint(2, 3);

    for (let j = 0; j < nbJalons; j++) {
        let jalonDate;
        if (finished) jalonDate = addDays(NOW, -rint(20, 90));
        else if (etat === "En_retard" && j === 0) jalonDate = addDays(NOW, -rint(5, 25));
        else jalonDate = addDays(NOW, rint(10, 70));

        const jid = await ins(
            `INSERT INTO Jalon (titre, description, date_limite, id_groupe) VALUES (?,?,?,?)`,
            [`Jalon ${j + 1}`, null, dts(jalonDate), gid]
        );

        const nbTaches = rint(2, 4);
        for (let t = 0; t < nbTaches; t++) {
            let statut, dlimite;
            if (finished) {
                statut = "Terminee";
                dlimite = addDays(jalonDate, -rint(0, 10));
            } else if (etat === "En_retard" && j === 0 && t === 0) {
                statut = pick(["A_faire", "En_cours"]); // tâche en retard non terminée -> garde l'état En_retard
                dlimite = addDays(NOW, -rint(3, 15));
            } else if (etat === "En_retard") {
                statut = pick(["A_faire", "En_cours", "Terminee"]);
                dlimite = statut === "Terminee" ? addDays(NOW, -rint(1, 20)) : addDays(NOW, rint(5, 40));
            } else {
                // En_cours : que des échéances futures (pas de bascule auto en retard)
                statut = pick(["A_faire", "En_cours", "Terminee"]);
                dlimite = addDays(NOW, rint(5, 55));
            }
            const tid = await ins(
                `INSERT INTO Tache (titre, description, date_limite, priorite, statut, id_jalon) VALUES (?,?,?,?,?,?)`,
                [pickTaskTitle(), null, dts(dlimite), pick(["Haute", "Moyenne", "Basse"]), statut, jid]
            );
            // Assignation à 1-2 membres
            const assignes = shuffle(members.slice()).slice(0, rint(1, 2));
            await batch(`INSERT INTO Assigne_a (id_utilisateur, id_tache) VALUES ?`,
                assignes.map(m => [m.id, tid]));
            // Quelques commentaires de tâche (entre étudiants)
            if (Math.random() < 0.4) {
                const auteur = pick(members);
                await ins(`INSERT INTO Commentaire (contenu, id_utilisateur, id_tache) VALUES (?,?,?)`,
                    [pick(COM_TACHE), auteur.id, tid]);
            }
        }
    }
}

const TASK_TITLES = ["Maquettes UI", "Modèle de base de données", "Authentification", "Page d'accueil", "API REST",
    "Tests unitaires", "Intégration front", "Déploiement", "Documentation", "Gestion des rôles",
    "Module de recherche", "Notifications", "Tableau de bord", "Optimisation des requêtes", "Rédaction du rapport"];
function pickTaskTitle() { return pick(TASK_TITLES); }

async function seedLivrablesEtc(db, ins, batch, proj, gid, etat, members) {
    const finished = ["Soutenu", "Cloture"].includes(etat);
    const encId = proj.encId;

    // Livrables
    let nbLiv = 0;
    if (finished || etat === "Livre") nbLiv = rint(2, 3);
    else if (etat === "En_cours" || etat === "En_retard") nbLiv = rint(0, 2);

    for (let i = 0; i < nbLiv; i++) {
        const deposant = pick(members);
        let statut, comment = null, dateVal = null, validant = null;
        if (finished) { statut = "Valide"; }
        else { statut = pick(["En_attente", "En_attente", "Valide", "Refuse"]); }
        if (statut === "Valide" || statut === "Refuse") {
            comment = pick(COM_LIVRABLE_E);
            dateVal = dts(addDays(NOW, -rint(1, 20)));
            validant = encId;
        }
        const nom = pick(LIVRABLE_NOMS);
        const lid = await ins(
            `INSERT INTO Livrable (nom, chemin_fichier, statut_validation, commentaire_validation, date_validation, id_groupe, id_etudiant_deposant, id_encadrant_validant)
             VALUES (?,?,?,?,?,?,?,?)`,
            [nom, "demo-" + gid + "-" + i + ".pdf", statut, comment, dateVal, gid, deposant.id, validant]
        );
        // Commentaires sur le livrable (membres + encadrant)
        if (Math.random() < 0.5) {
            await ins(`INSERT INTO Commentaire (contenu, id_utilisateur, id_livrable) VALUES (?,?,?)`,
                [pick(COM_LIVRABLE_M), pick(members).id, lid]);
        }
        if (statut !== "En_attente") {
            await ins(`INSERT INTO Commentaire (contenu, id_utilisateur, id_livrable) VALUES (?,?,?)`,
                [comment, encId, lid]);
        }
        // Notifications : dépôt -> autres membres + encadrant ; validation/refus -> déposant
        const notifs = [];
        members.filter(m => m.id !== deposant.id).forEach(m =>
            notifs.push([`Nouveau livrable déposé : ${nom}`, "livrable", proj.id, m.id]));
        notifs.push([`Nouveau livrable déposé : ${nom}`, "livrable", proj.id, encId]);
        if (statut === "Valide") notifs.push([`Votre livrable « ${nom} » a été validé`, "validation", proj.id, deposant.id]);
        if (statut === "Refuse") notifs.push([`Votre livrable « ${nom} » a été refusé — à corriger`, "refus", proj.id, deposant.id]);
        await batch(`INSERT INTO Notification (contenu, type, id_projet, id_utilisateur) VALUES ?`, notifs);
    }

    // Messages de chat (sauf groupes "Proposé")
    if (etat !== "Propose") {
        const nbMsg = rint(3, 6);
        const msgs = [];
        for (let i = 0; i < nbMsg; i++) {
            const fromEnc = Math.random() < 0.25;
            const auteur = fromEnc ? encId : pick(members).id;
            const contenu = fromEnc ? pick(MSG_ENCADRANT) : pick(MSG_MEMBRE);
            msgs.push([contenu, auteur, gid]);
        }
        await batch(`INSERT INTO Message (contenu, id_utilisateur, id_groupe) VALUES ?`, msgs);
        // une notif "message encadrant" pour les membres (sur un message)
        if (Math.random() < 0.5) {
            await batch(`INSERT INTO Notification (contenu, type, id_projet, id_utilisateur) VALUES ?`,
                members.map(m => [`Nouveau message de l'encadrant`, "message", proj.id, m.id]));
        }
    }

    // Évaluation pour les groupes soutenus / clôturés
    if (etat === "Soutenu" || etat === "Cloture") {
        const evalId = await ins(
            `INSERT INTO Evaluation (commentaire_global, note_finale, id_groupe) VALUES (?,?,?)`,
            ["Bon travail d'ensemble, projet abouti.", rint(12, 18) + 0.5, gid]
        );
        const [crits] = await db.query("SELECT id_critere FROM Critere_evaluation WHERE id_projet = ?", [proj.id]);
        await batch(`INSERT INTO Note_sur (id_evaluation, id_critere, note) VALUES ?`,
            crits.map(c => [evalId, c.id_critere, rint(11, 19)]));
    }
}
