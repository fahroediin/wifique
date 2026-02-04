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

// Get dashboard stats
router.get('/stats', requireAdmin, (req, res) => {
    try {
        const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get();
        const activeUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get();
        const inactiveUsers = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 0').get();

        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        const paidThisMonth = db.prepare(`
            SELECT COUNT(*) as count FROM payments 
            WHERE period_month = ? AND period_year = ? AND status = 'paid'
        `).get(currentMonth, currentYear);

        const pendingThisMonth = db.prepare(`
            SELECT COUNT(*) as count FROM payments 
            WHERE period_month = ? AND period_year = ? AND status = 'pending'
        `).get(currentMonth, currentYear);

        const overduePayments = db.prepare(`
            SELECT COUNT(*) as count FROM payments WHERE status = 'overdue'
        `).get();

        const totalRevenue = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid'
        `).get();

        const revenueThisMonth = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total FROM payments 
            WHERE status = 'paid' AND period_month = ? AND period_year = ?
        `).get(currentMonth, currentYear);

        res.json({
            users: {
                total: totalUsers.count,
                active: activeUsers.count,
                inactive: inactiveUsers.count
            },
            payments: {
                paid: paidThisMonth.count,
                pending: pendingThisMonth.count,
                overdue: overduePayments.count
            },
            revenue: {
                total: totalRevenue.total,
                thisMonth: revenueThisMonth.total
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Get recent activities
router.get('/activities', requireAdmin, (req, res) => {
    try {
        const recentPayments = db.prepare(`
            SELECT 
                p.id,
                'payment' as type,
                u.name as user_name,
                u.unit_name,
                p.amount,
                p.status,
                p.paid_date as date
            FROM payments p
            JOIN users u ON p.user_id = u.id
            WHERE p.status = 'paid'
            ORDER BY p.paid_date DESC
            LIMIT 10
        `).all();

        const recentNotifications = db.prepare(`
            SELECT 
                n.id,
                'notification' as type,
                u.name as user_name,
                u.unit_name,
                n.type as notification_type,
                n.sent_at as date
            FROM notification_log n
            JOIN users u ON n.user_id = u.id
            ORDER BY n.sent_at DESC
            LIMIT 10
        `).all();

        res.json({
            payments: recentPayments,
            notifications: recentNotifications
        });
    } catch (error) {
        console.error('Get activities error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

// Get upcoming due dates
router.get('/upcoming', requireAdmin, (req, res) => {
    try {
        const upcoming = db.prepare(`
            SELECT 
                p.*,
                u.name as user_name,
                u.unit_name,
                u.phone_number,
                julianday(p.due_date) - julianday('now') as days_until_due
            FROM payments p
            JOIN users u ON p.user_id = u.id
            WHERE p.status = 'pending'
            ORDER BY p.due_date ASC
            LIMIT 20
        `).all();

        res.json(upcoming);
    } catch (error) {
        console.error('Get upcoming error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan server' });
    }
});

module.exports = router;
