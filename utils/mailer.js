const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && port && user && pass) {
        transporter = nodemailer.createTransport({
            host,
            port: Number(port),
            secure: false,
            auth: { user, pass }
        });
    }

    return transporter;
}

async function sendActivationEmail(toEmail, token, prenom) {
    const baseUrl = process.env.APP_URL || "http://localhost:5000";
    const activationLink = `${baseUrl}/activate.html?token=${token}`;

    const mailOptions = {
        from: process.env.SMTP_USER || "noreply@projectflow.local",
        to: toEmail,
        subject: "ProjectFlow - Activez votre compte",
        html: `
            <h2>Bienvenue sur ProjectFlow, ${prenom} !</h2>
            <p>Votre compte a été créé par un administrateur.</p>
            <p>Cliquez sur le lien ci-dessous pour définir votre mot de passe et activer votre compte :</p>
            <p><a href="${activationLink}" style="display:inline-block;padding:12px 24px;background:#FF8904;color:#fff;text-decoration:none;border-radius:8px;">Activer mon compte</a></p>
            <p>Ce lien expire dans 48 heures.</p>
            <p><small>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.</small></p>
        `
    };

    const transport = getTransporter();

    if (transport) {
        const info = await transport.sendMail(mailOptions);
        console.log(`[MAIL] Envoyé à ${toEmail} - ID: ${info.messageId}`);
    } else {
        console.log(`[MAIL FALLBACK] Aucun SMTP configuré. Lien d'activation :`);
        console.log(`  -> ${activationLink}`);
        console.log(`  -> Destinataire : ${toEmail}`);
    }

    return activationLink;
}

async function sendResetPasswordEmail(toEmail, token, prenom) {
    const baseUrl = process.env.APP_URL || "http://localhost:5000";
    const resetLink = `${baseUrl}/reset-password.html?token=${token}`;

    const mailOptions = {
        from: process.env.SMTP_USER || "noreply@projectflow.local",
        to: toEmail,
        subject: "ProjectFlow - Réinitialisation de votre mot de passe",
        html: `
            <h2>Réinitialisation du mot de passe</h2>
            <p>Bonjour ${prenom || ""},</p>
            <p>Vous avez demandé à réinitialiser votre mot de passe ProjectFlow.</p>
            <p>Cliquez sur le lien ci-dessous pour définir un nouveau mot de passe :</p>
            <p><a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#FF8904;color:#fff;text-decoration:none;border-radius:8px;">Réinitialiser mon mot de passe</a></p>
            <p>Ce lien expire dans 1 heure.</p>
            <p><small>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe restera inchangé.</small></p>
        `
    };

    const transport = getTransporter();

    if (transport) {
        const info = await transport.sendMail(mailOptions);
        console.log(`[MAIL] Réinitialisation envoyée à ${toEmail} - ID: ${info.messageId}`);
    } else {
        console.log(`[MAIL FALLBACK] Aucun SMTP configuré. Lien de réinitialisation :`);
        console.log(`  -> ${resetLink}`);
        console.log(`  -> Destinataire : ${toEmail}`);
    }

    return resetLink;
}

module.exports = { sendActivationEmail, sendResetPasswordEmail };
