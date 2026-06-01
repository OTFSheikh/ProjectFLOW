function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId || req.session.role !== "admin") {
        return res.status(401).json({
            success: false,
            message: "Accès réservé aux administrateurs"
        });
    }
    next();
}

module.exports = { requireAdmin };
