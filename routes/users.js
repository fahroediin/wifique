const express = require('express');
const bcrypt = require('bcryptjs');
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

// Get all users
router.get('/', requireAdmin, (req, res) => {
    try {
        const users = db.prepare(`
            SELECT 
                u.*,
                (SELECT status FROM payments WHERE user_id = u.id ORDER BY due_date DESC LIMIT 1) as payment_status,
                (SELECT due_date FROM payments WHERE user_id = u.id ORDER BY due_date DESC LIMIT 1) as next_due_date
            FROM users u
            ORDER BY u.unit_name
        `).all();

        // Remove password from response
        const safeUsers = users.map(u => {
            const { password, ...user } = u;
            return user;
        });

        res.json(safeUsers);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Get single user
router.get('/:id', requireAdmin, (req, res) => {
    try {
        const user = db.prepare(`
            SELECT 
                u.*,
                (SELECT status FROM payments WHERE user_id = u.id ORDER BY due_date DESC LIMIT 1) as payment_status
            FROM users u
            WHERE u.id = ?
        `).get(req.params.id);

        if (!user) {
            return res.status(404).json({ error: 'User tidak ditemukan' });
        }

        const { password, ...safeUser } = user;
        res.json(safeUser);
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Create new user
router.post('/', requireAdmin, async (req, res) => {
    try {
        const { username, password, name, unit_name, phone_number, bandwidth_limit } = req.body;

        if (!username || !password || !name || !unit_name || !phone_number) {
            return res.status(400).json({ error: 'Semua field wajib diisi' });
        }

        // Check if username exists
        const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existing) {
            return res.status(400).json({ error: 'Username sudah digunakan' });
        }

        const hashedPassword = bcrypt.hashSync(password, 10);

        const result = db.prepare(`
            INSERT INTO users (username, password, name, unit_name, phone_number, bandwidth_limit)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(username, hashedPassword, name, unit_name, phone_number, bandwidth_limit || 10);

        // Create initial payment record for current month
        const now = new Date();
        const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, 5); // 5th of next month
        const monthlyFee = db.prepare("SELECT value FROM settings WHERE key = 'monthly_fee'").get();

        db.prepare(`
            INSERT INTO payments (user_id, amount, period_month, period_year, due_date, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
        `).run(result.lastInsertRowid, monthlyFee?.value || 100000, now.getMonth() + 1, now.getFullYear(), dueDate.toISOString().split('T')[0]);

        await logAction('USER_CREATE', `Created user ${username} (${name})`, req);

        res.json({
            success: true,
            message: 'User berhasil ditambahkan',
            userId: result.lastInsertRowid
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Update user
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        const { name, unit_name, phone_number, bandwidth_limit, is_active } = req.body;
        const userId = req.params.id;

        const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User tidak ditemukan' });
        }

        db.prepare(`
            UPDATE users 
            SET name = ?, unit_name = ?, phone_number = ?, bandwidth_limit = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(name, unit_name, phone_number, bandwidth_limit, is_active ? 1 : 0, userId);

        await logAction('USER_UPDATE', `Updated user ${user.username} details`, req);

        res.json({ success: true, message: 'User berhasil diupdate' });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Update user password
router.put('/:id/password', requireAdmin, async (req, res) => {
    try {
        const { password } = req.body;
        const userId = req.params.id;

        if (!password || password.length < 4) {
            return res.status(400).json({ error: 'Password minimal 4 karakter' });
        }

        const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);

        const hashedPassword = bcrypt.hashSync(password, 10);
        db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(hashedPassword, userId);

        await logAction('USER_PASSWORD_RESET', `Reset password for user ${user ? user.username : userId}`, req);

        res.json({ success: true, message: 'Password berhasil diubah' });
    } catch (error) {
        console.error('Update password error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Toggle user active status
router.post('/:id/toggle', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const user = db.prepare('SELECT username, is_active FROM users WHERE id = ?').get(userId);

        if (!user) {
            return res.status(404).json({ error: 'User tidak ditemukan' });
        }

        const newStatus = user.is_active ? 0 : 1;
        db.prepare('UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newStatus, userId);

        await logAction('USER_TOGGLE', `Toggled user ${user.username} status to ${newStatus ? 'active' : 'inactive'}`, req);

        res.json({
            success: true,
            message: newStatus ? 'User diaktifkan' : 'User dinonaktifkan',
            is_active: !!newStatus
        });
    } catch (error) {
        console.error('Toggle user error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Delete user
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;

        const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ error: 'User tidak ditemukan' });
        }

        db.prepare('DELETE FROM users WHERE id = ?').run(userId);

        await logAction('USER_DELETE', `Deleted user ${user.username}`, req);

        res.json({ success: true, message: 'User berhasil dihapus' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

module.exports = router;
