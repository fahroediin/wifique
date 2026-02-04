const express = require('express');
const router = express.Router();
const db = require('../database');

const PAKASIR_API_BASE = 'https://app.pakasir.com/api';

// Helper to get Pakasir settings
function getPakasirConfig() {
    const project = db.prepare("SELECT value FROM settings WHERE key = 'pakasir_project'").get();
    const apiKey = db.prepare("SELECT value FROM settings WHERE key = 'pakasir_api_key'").get();

    return {
        project: project?.value || '',
        api_key: apiKey?.value || ''
    };
}

// Create payment transaction via Pakasir
router.post('/create/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { method = 'qris' } = req.body; // default to QRIS

        // Get payment details
        const payment = db.prepare(`
            SELECT p.*, u.name as user_name, u.unit_name, u.phone_number
            FROM payments p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = ?
        `).get(paymentId);

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        if (payment.status === 'paid') {
            return res.status(400).json({ error: 'Payment already paid' });
        }

        const config = getPakasirConfig();
        if (!config.project || !config.api_key) {
            return res.status(400).json({ error: 'Pakasir not configured. Please set project and API key in settings.' });
        }

        // Generate unique order ID
        const orderId = `WFQ-${payment.id}-${Date.now()}`;

        // Create transaction via Pakasir API
        const response = await fetch(`${PAKASIR_API_BASE}/transactioncreate/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: config.project,
                order_id: orderId,
                amount: payment.amount,
                api_key: config.api_key
            })
        });

        const result = await response.json();

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        // Store transaction reference
        db.prepare(`
            UPDATE payments 
            SET pakasir_order_id = ?, 
                pakasir_payment_number = ?,
                pakasir_expired_at = ?,
                pakasir_method = ?
            WHERE id = ?
        `).run(
            orderId,
            result.payment?.payment_number || null,
            result.payment?.expired_at || null,
            method,
            paymentId
        );

        res.json({
            success: true,
            payment: {
                id: payment.id,
                user_name: payment.user_name,
                unit_name: payment.unit_name,
                amount: payment.amount,
                order_id: orderId,
                method: method,
                payment_number: result.payment?.payment_number,
                total_payment: result.payment?.total_payment,
                expired_at: result.payment?.expired_at,
                // For QRIS, payment_number is the QR string
                qr_string: method === 'qris' ? result.payment?.payment_number : null
            }
        });

    } catch (error) {
        console.error('Pakasir create error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook endpoint - Pakasir will call this when payment is completed
router.post('/webhook', async (req, res) => {
    try {
        console.log('Pakasir webhook received:', req.body);

        const { order_id, amount, status, project, payment_method, completed_at } = req.body;

        if (status !== 'completed') {
            return res.json({ received: true, processed: false, reason: 'Status not completed' });
        }

        // Verify project matches
        const config = getPakasirConfig();
        if (project !== config.project) {
            console.log('Project mismatch:', project, '!=', config.project);
            return res.status(400).json({ error: 'Project mismatch' });
        }

        // Find payment by order_id
        const payment = db.prepare(`
            SELECT p.*, u.id as user_id, u.name as user_name, u.phone_number
            FROM payments p
            JOIN users u ON p.user_id = u.id
            WHERE p.pakasir_order_id = ?
        `).get(order_id);

        if (!payment) {
            console.log('Payment not found for order_id:', order_id);
            return res.status(404).json({ error: 'Payment not found' });
        }

        // Verify amount
        if (payment.amount !== amount) {
            console.log('Amount mismatch:', payment.amount, '!=', amount);
            return res.status(400).json({ error: 'Amount mismatch' });
        }

        // Mark payment as paid
        const now = new Date().toISOString();
        db.prepare(`
            UPDATE payments 
            SET status = 'paid', 
                paid_at = ?,
                notes = ?
            WHERE id = ?
        `).run(now, `Paid via Pakasir (${payment_method}) at ${completed_at}`, payment.id);

        // Activate user
        db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(payment.user_id);

        // Create next month's payment
        let nextMonth = payment.period_month + 1;
        let nextYear = payment.period_year;
        if (nextMonth > 12) {
            nextMonth = 1;
            nextYear++;
        }

        const monthlyFee = db.prepare("SELECT value FROM settings WHERE key = 'monthly_fee'").get();
        const fee = parseInt(monthlyFee?.value || 100000);

        const dueDate = new Date(nextYear, nextMonth - 1, 5).toISOString().split('T')[0];

        db.prepare(`
            INSERT OR IGNORE INTO payments (user_id, amount, period_month, period_year, due_date, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
        `).run(payment.user_id, fee, nextMonth, nextYear, dueDate);

        // Log notification
        db.prepare(`
            INSERT INTO notification_log (user_id, type, message, status)
            VALUES (?, 'payment_received', ?, 'sent')
        `).run(payment.user_id, `Payment received via ${payment_method}: Rp ${amount}`);

        // Try to send WhatsApp notification (if available)
        try {
            const whatsapp = require('../services/whatsapp');
            if (whatsapp.isReady) {
                await whatsapp.sendReconnectionNotice({
                    id: payment.user_id,
                    name: payment.user_name,
                    unit_name: payment.unit_name,
                    phone_number: payment.phone_number
                });
            }
        } catch (e) {
            console.log('WhatsApp notification failed:', e.message);
        }

        console.log(`Payment ${payment.id} marked as paid via Pakasir webhook`);

        res.json({
            received: true,
            processed: true,
            payment_id: payment.id,
            user_activated: true
        });

    } catch (error) {
        console.error('Pakasir webhook error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Check payment status
router.get('/status/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;

        const payment = db.prepare(`
            SELECT id, status, pakasir_order_id, pakasir_method, pakasir_expired_at, paid_at
            FROM payments WHERE id = ?
        `).get(paymentId);

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        if (!payment.pakasir_order_id) {
            return res.json({
                payment_id: payment.id,
                status: payment.status,
                pakasir_status: 'not_created'
            });
        }

        // Check status via Pakasir API
        const config = getPakasirConfig();
        const url = new URL(`${PAKASIR_API_BASE}/transactiondetail`);
        url.searchParams.set('project', config.project);
        url.searchParams.set('order_id', payment.pakasir_order_id);
        url.searchParams.set('amount', payment.amount);
        url.searchParams.set('api_key', config.api_key);

        const response = await fetch(url.toString());
        const result = await response.json();

        res.json({
            payment_id: payment.id,
            local_status: payment.status,
            pakasir_status: result.transaction?.status || 'unknown',
            order_id: payment.pakasir_order_id,
            method: payment.pakasir_method,
            expired_at: payment.pakasir_expired_at,
            paid_at: payment.paid_at
        });

    } catch (error) {
        console.error('Pakasir status error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get available payment methods
router.get('/methods', (req, res) => {
    res.json({
        methods: [
            { id: 'qris', name: 'QRIS', description: 'Gopay, OVO, Dana, ShopeePay, dll' },
            { id: 'bri_va', name: 'BRI Virtual Account', description: 'Transfer via BRI' },
            { id: 'bni_va', name: 'BNI Virtual Account', description: 'Transfer via BNI' },
            { id: 'cimb_niaga_va', name: 'CIMB Niaga VA', description: 'Transfer via CIMB' },
            { id: 'permata_va', name: 'Permata VA', description: 'Transfer via Permata' },
            { id: 'maybank_va', name: 'Maybank VA', description: 'Transfer via Maybank' }
        ]
    });
});

module.exports = router;
