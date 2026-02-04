const express = require('express');
const db = require('../database');
const { logAction } = require('../services/audit');

const router = express.Router();

// Middleware to check admin auth
const requireAdmin = (req, res, next) => {
    if (!req.session.admin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Get all settings
router.get('/', requireAdmin, (req, res) => {
    try {
        const settings = db.prepare('SELECT * FROM settings').all();
        const settingsObj = {};
        settings.forEach(s => {
            settingsObj[s.key] = s.value;
        });
        res.json(settingsObj);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Update setting
router.put('/:key', requireAdmin, async (req, res) => {
    try {
        const { value } = req.body;
        const key = req.params.key;

        db.prepare(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
        `).run(key, value, value);

        await logAction('SETTING_UPDATE', `Updated setting ${key} to ${value}`, req);

        res.json({ success: true, message: 'Setting berhasil diupdate' });
    } catch (error) {
        console.error('Update setting error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Update multiple settings
router.post('/bulk', requireAdmin, async (req, res) => {
    try {
        const settings = req.body;

        const stmt = db.prepare(`
            INSERT INTO settings (key, value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
        `);

        for (const [key, value] of Object.entries(settings)) {
            stmt.run(key, value, value);
        }

        await logAction('SETTINGS_BULK_UPDATE', `Updated settings: ${Object.keys(settings).join(', ')}`, req);

        res.json({ success: true, message: 'Settings berhasil diupdate' });
    } catch (error) {
        console.error('Bulk update settings error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

module.exports = router;
