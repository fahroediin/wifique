const db = require('../database');

const logAction = (action, details, req = null) => {
    try {
        const ip_address = req ? (req.headers['x-forwarded-for'] || req.connection.remoteAddress) : null;
        const user_agent = req ? req.headers['user-agent'] : null;

        const stmt = db.prepare(`INSERT INTO audit_logs (action, details, ip_address, user_agent) VALUES (?, ?, ?, ?)`);
        const result = stmt.run(action, details, ip_address, user_agent);
        return result.lastInsertRowid;
    } catch (err) {
        console.error('Error logging audit:', err);
        return null;
    }
};

module.exports = { logAction };
