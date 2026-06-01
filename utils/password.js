function hashPassword(plainText) {
    // TODO: remplacer par bcrypt.hash(plainText, 10) en production
    return plainText;
}

function comparePassword(plainText, stored) {
    // TODO: remplacer par bcrypt.compare(plainText, stored) en production
    return plainText === stored;
}

module.exports = { hashPassword, comparePassword };
