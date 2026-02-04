const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../database');

const router = express.Router();

// Admin login
router.post('/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username dan password harus diisi' });
        }

        const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

        if (!admin) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }

        const validPassword = bcrypt.compareSync(password, admin.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }

        req.session.admin = {
            id: admin.id,
            username: admin.username,
            name: admin.name
        };

        res.json({
            success: true,
            message: 'Login berhasil',
            admin: {
                id: admin.id,
                username: admin.username,
                name: admin.name
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Admin logout
router.post('/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true, message: 'Logout berhasil' });
});

// Check auth status
router.get('/check', (req, res) => {
    if (req.session.admin) {
        res.json({
            authenticated: true,
            admin: req.session.admin
        });
    } else {
        res.json({ authenticated: false });
    }
});

// Portal login (user/tenant login)
router.post('/portal/login', (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username dan password harus diisi' });
        }

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

        if (!user) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }

        const validPassword = bcrypt.compareSync(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }

        if (!user.is_active) {
            return res.status(403).json({
                error: 'Akun tidak aktif. Silakan hubungi admin atau bayar tagihan Anda.',
                reason: 'inactive'
            });
        }

        // Check payment status
        const latestPayment = db.prepare(`
            SELECT * FROM payments 
            WHERE user_id = ? 
            ORDER BY due_date DESC 
            LIMIT 1
        `).get(user.id);

        if (latestPayment && latestPayment.status === 'overdue') {
            return res.status(403).json({
                error: 'Tagihan Anda belum dibayar. Silakan bayar terlebih dahulu.',
                reason: 'unpaid'
            });
        }

        // Update last login and IP
        const clientIP = req.ip || req.connection.remoteAddress;
        db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP, ip_address = ? WHERE id = ?')
            .run(clientIP, user.id);

        req.session.user = {
            id: user.id,
            username: user.username,
            name: user.name,
            unit_name: user.unit_name,
            bandwidth_limit: user.bandwidth_limit
        };

        res.json({
            success: true,
            message: 'Login berhasil. Anda sekarang terkoneksi ke internet.',
            user: {
                name: user.name,
                unit_name: user.unit_name,
                bandwidth_limit: user.bandwidth_limit
            }
        });
    } catch (error) {
        console.error('Portal login error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Change admin password
router.post('/change-password', (req, res) => {
    try {
        if (!req.session.admin) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { currentPassword, newPassword } = req.body;

        const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.admin.id);

        if (!bcrypt.compareSync(currentPassword, admin.password)) {
            return res.status(400).json({ error: 'Password saat ini salah' });
        }

        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(hashedPassword, admin.id);

        res.json({ success: true, message: 'Password berhasil diubah' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

module.exports = router;
