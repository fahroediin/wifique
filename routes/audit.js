const express = require('express');
const router = express.Router();
const db = require('../database');

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.admin) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Get all audit logs
router.get('/', isAuthenticated, (req, res) => {
    const query = `
        SELECT * FROM audit_logs 
        ORDER BY created_at DESC 
        LIMIT 100
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

module.exports = router;
