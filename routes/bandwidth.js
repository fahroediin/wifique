const express = require('express');
const db = require('../database');

const router = express.Router();

// Middleware to check admin auth
const requireAdmin = (req, res, next) => {
    if (!req.session.admin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Get bandwidth usage for all users
router.get('/usage', requireAdmin, (req, res) => {
    try {
        const usage = db.prepare(`
            SELECT 
                u.id,
                u.name,
                u.unit_name,
                u.bandwidth_limit,
                u.is_active,
                COALESCE(SUM(b.bytes_in), 0) as total_bytes_in,
                COALESCE(SUM(b.bytes_out), 0) as total_bytes_out
            FROM users u
            LEFT JOIN bandwidth_usage b ON u.id = b.user_id
            GROUP BY u.id
            ORDER BY u.unit_name
        `).all();

        // Convert to human readable
        const formattedUsage = usage.map(u => ({
            ...u,
            total_download: formatBytes(u.total_bytes_in),
            total_upload: formatBytes(u.total_bytes_out),
            total_usage: formatBytes(u.total_bytes_in + u.total_bytes_out)
        }));

        res.json(formattedUsage);
    } catch (error) {
        console.error('Get bandwidth usage error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Get bandwidth usage for specific user
router.get('/usage/:userId', requireAdmin, (req, res) => {
    try {
        const userId = req.params.userId;

        // Get daily usage for last 30 days
        const dailyUsage = db.prepare(`
            SELECT 
                DATE(recorded_at) as date,
                SUM(bytes_in) as bytes_in,
                SUM(bytes_out) as bytes_out
            FROM bandwidth_usage
            WHERE user_id = ? AND recorded_at >= DATE('now', '-30 days')
            GROUP BY DATE(recorded_at)
            ORDER BY date DESC
        `).all(userId);

        res.json(dailyUsage);
    } catch (error) {
        console.error('Get user bandwidth error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Update user bandwidth limit
router.put('/limit/:userId', requireAdmin, (req, res) => {
    try {
        const { bandwidth_limit } = req.body;
        const userId = req.params.userId;

        if (bandwidth_limit < 1 || bandwidth_limit > 100) {
            return res.status(400).json({ error: 'Bandwidth limit harus antara 1-100 Mbps' });
        }

        db.prepare('UPDATE users SET bandwidth_limit = ? WHERE id = ?')
            .run(bandwidth_limit, userId);

        res.json({ success: true, message: 'Bandwidth limit berhasil diupdate' });
    } catch (error) {
        console.error('Update bandwidth limit error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Log bandwidth usage (called by monitoring script)
router.post('/log', (req, res) => {
    try {
        const { user_id, bytes_in, bytes_out, api_key } = req.body;

        // Simple API key check for internal use
        if (api_key !== 'wifique-internal-key') {
            return res.status(401).json({ error: 'Invalid API key' });
        }

        db.prepare(`
            INSERT INTO bandwidth_usage (user_id, bytes_in, bytes_out)
            VALUES (?, ?, ?)
        `).run(user_id, bytes_in, bytes_out);

        res.json({ success: true });
    } catch (error) {
        console.error('Log bandwidth error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Helper function to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = router;
