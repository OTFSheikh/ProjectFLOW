function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId || req.session.role !== "admin") {
        return res.status(401).json({
            success: false,
            message: "Accès réservé aux administrateurs"
        });
    }
    next();
}

function requireEncadrant(req, res, next) {
    if (!req.session || !req.session.userId || req.session.role !== "encadrant") {
        return res.status(401).json({
            success: false,
            message: "Accès réservé aux encadrants"
        });
    }
    next();
}

module.exports = { requireAdmin, requireEncadrant };
