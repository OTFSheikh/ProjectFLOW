const bcrypt = require("bcryptjs");

async function hashPassword(plainText) {
    return bcrypt.hash(plainText, 10);
}

async function comparePassword(plainText, stored) {
    if (!stored) return false;
    if (stored.startsWith("$2")) {
        return bcrypt.compare(plainText, stored);
    }
    // Fallback pour les mots de passe encore en clair (migration progressive)
    return plainText === stored;
}

module.exports = { hashPassword, comparePassword };
