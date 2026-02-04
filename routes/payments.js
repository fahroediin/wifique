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

// Get all payments
router.get('/', requireAdmin, (req, res) => {
    try {
        const { status, month, year } = req.query;

        let query = `
            SELECT 
                p.*,
                u.name as user_name,
                u.unit_name,
                u.phone_number
            FROM payments p
            JOIN users u ON p.user_id = u.id
            WHERE 1=1
        `;

        const params = [];

        if (status) {
            query += ' AND p.status = ?';
            params.push(status);
        }

        if (month && year) {
            query += ' AND p.period_month = ? AND p.period_year = ?';
            params.push(parseInt(month), parseInt(year));
        }

        query += ' ORDER BY p.due_date DESC';

        const payments = db.prepare(query).all(...params);
        res.json(payments);
    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Get user's payments
router.get('/user/:userId', requireAdmin, (req, res) => {
    try {
        const payments = db.prepare(`
            SELECT * FROM payments 
            WHERE user_id = ? 
            ORDER BY due_date DESC
        `).all(req.params.userId);

        res.json(payments);
    } catch (error) {
        console.error('Get user payments error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Create payment record
router.post('/', requireAdmin, (req, res) => {
    try {
        const { user_id, amount, period_month, period_year, due_date } = req.body;

        if (!user_id || !amount || !period_month || !period_year || !due_date) {
            return res.status(400).json({ error: 'Semua field wajib diisi' });
        }

        // Check if payment for this period already exists
        const existing = db.prepare(`
            SELECT id FROM payments 
            WHERE user_id = ? AND period_month = ? AND period_year = ?
        `).get(user_id, period_month, period_year);

        if (existing) {
            return res.status(400).json({ error: 'Pembayaran untuk periode ini sudah ada' });
        }

        const result = db.prepare(`
            INSERT INTO payments (user_id, amount, period_month, period_year, due_date, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
        `).run(user_id, amount, period_month, period_year, due_date);

        res.json({
            success: true,
            message: 'Tagihan berhasil dibuat',
            paymentId: result.lastInsertRowid
        });
    } catch (error) {
        console.error('Create payment error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Mark payment as paid
router.post('/:id/pay', requireAdmin, (req, res) => {
    try {
        const paymentId = req.params.id;
        const { notes } = req.body;

        const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(paymentId);

        if (!payment) {
            return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
        }

        if (payment.status === 'paid') {
            return res.status(400).json({ error: 'Pembayaran sudah lunas' });
        }

        db.prepare(`
            UPDATE payments 
            SET status = 'paid', paid_date = DATE('now'), notes = ?
            WHERE id = ?
        `).run(notes || null, paymentId);

        // Activate user if was deactivated due to non-payment
        db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(payment.user_id);

        // Create next month's payment
        const nextMonth = payment.period_month === 12 ? 1 : payment.period_month + 1;
        const nextYear = payment.period_month === 12 ? payment.period_year + 1 : payment.period_year;
        const nextDueDate = new Date(nextYear, nextMonth - 1, 5);

        const existingNext = db.prepare(`
            SELECT id FROM payments WHERE user_id = ? AND period_month = ? AND period_year = ?
        `).get(payment.user_id, nextMonth, nextYear);

        if (!existingNext) {
            db.prepare(`
                INSERT INTO payments (user_id, amount, period_month, period_year, due_date, status)
                VALUES (?, ?, ?, ?, ?, 'pending')
            `).run(payment.user_id, payment.amount, nextMonth, nextYear, nextDueDate.toISOString().split('T')[0]);
        }

        res.json({ success: true, message: 'Pembayaran berhasil dikonfirmasi' });
    } catch (error) {
        console.error('Pay payment error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Mark payment as overdue
router.post('/:id/overdue', requireAdmin, (req, res) => {
    try {
        const paymentId = req.params.id;

        db.prepare("UPDATE payments SET status = 'overdue' WHERE id = ?").run(paymentId);

        // Get payment to find user
        const payment = db.prepare('SELECT user_id FROM payments WHERE id = ?').get(paymentId);

        // Deactivate user
        if (payment) {
            db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(payment.user_id);
        }

        res.json({ success: true, message: 'Status diubah ke overdue dan user dinonaktifkan' });
    } catch (error) {
        console.error('Overdue payment error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Delete payment
router.delete('/:id', requireAdmin, (req, res) => {
    try {
        const paymentId = req.params.id;

        db.prepare('DELETE FROM payments WHERE id = ?').run(paymentId);

        res.json({ success: true, message: 'Pembayaran berhasil dihapus' });
    } catch (error) {
        console.error('Delete payment error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Generate monthly payments for all users
router.post('/generate', requireAdmin, (req, res) => {
    try {
        const { month, year } = req.body;

        if (!month || !year) {
            return res.status(400).json({ error: 'Bulan dan tahun wajib diisi' });
        }

        const users = db.prepare('SELECT id FROM users').all();
        const monthlyFee = db.prepare("SELECT value FROM settings WHERE key = 'monthly_fee'").get();
        const amount = monthlyFee?.value || 100000;
        const dueDate = new Date(year, month - 1, 5);

        let created = 0;
        let skipped = 0;

        for (const user of users) {
            const existing = db.prepare(`
                SELECT id FROM payments WHERE user_id = ? AND period_month = ? AND period_year = ?
            `).get(user.id, month, year);

            if (!existing) {
                db.prepare(`
                    INSERT INTO payments (user_id, amount, period_month, period_year, due_date, status)
                    VALUES (?, ?, ?, ?, ?, 'pending')
                `).run(user.id, amount, month, year, dueDate.toISOString().split('T')[0]);
                created++;
            } else {
                skipped++;
            }
        }

        res.json({
            success: true,
            message: `${created} tagihan dibuat, ${skipped} sudah ada`
        });
    } catch (error) {
        console.error('Generate payments error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

module.exports = router;
