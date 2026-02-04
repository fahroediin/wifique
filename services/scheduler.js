const cron = require('node-cron');
const db = require('../database');
const whatsapp = require('./whatsapp');
const { execSync } = require('child_process');

class SchedulerService {
    constructor() {
        this.jobs = [];
    }

    start() {
        console.log('Starting scheduler service...');

        // Check payments every day at 8:00 AM
        this.jobs.push(cron.schedule('0 8 * * *', () => {
            this.checkPaymentDueDates();
        }));

        // Check overdue payments every day at 9:00 AM
        this.jobs.push(cron.schedule('0 9 * * *', () => {
            this.processOverduePayments();
        }));

        // Update bandwidth rules every 5 minutes
        this.jobs.push(cron.schedule('*/5 * * * *', () => {
            this.updateBandwidthRules();
        }));

        console.log('Scheduler service started');

        // Run initial checks
        this.checkPaymentDueDates();
        this.updateBandwidthRules();
    }

    stop() {
        this.jobs.forEach(job => job.stop());
        this.jobs = [];
        console.log('Scheduler service stopped');
    }

    async checkPaymentDueDates() {
        console.log('Checking payment due dates...');

        try {
            // Get reminder days from settings
            const reminderSetting = db.prepare("SELECT value FROM settings WHERE key = 'reminder_days'").get();
            const reminderDays = (reminderSetting?.value || '3,1,0').split(',').map(d => parseInt(d.trim()));

            // Get pending payments with users
            const pendingPayments = db.prepare(`
                SELECT 
                    p.*,
                    u.id as user_id,
                    u.name,
                    u.unit_name,
                    u.phone_number,
                    julianday(p.due_date) - julianday('now') as days_until_due
                FROM payments p
                JOIN users u ON p.user_id = u.id
                WHERE p.status = 'pending'
            `).all();

            for (const payment of pendingPayments) {
                const daysUntilDue = Math.round(payment.days_until_due);

                // Check if we should send reminder
                if (reminderDays.includes(daysUntilDue)) {
                    // Check if we already sent reminder today
                    const todayReminder = db.prepare(`
                        SELECT id FROM notification_log 
                        WHERE user_id = ? 
                        AND type = 'payment_reminder'
                        AND DATE(sent_at) = DATE('now')
                    `).get(payment.user_id);

                    if (!todayReminder) {
                        console.log(`Sending reminder to ${payment.name} (${payment.unit_name}) - H-${daysUntilDue}`);
                        await whatsapp.sendPaymentReminder(
                            { id: payment.user_id, name: payment.name, unit_name: payment.unit_name, phone_number: payment.phone_number },
                            payment,
                            daysUntilDue
                        );
                    }
                }
            }
        } catch (error) {
            console.error('Error checking payment due dates:', error.message);
        }
    }

    async processOverduePayments() {
        console.log('Processing overdue payments...');

        try {
            // Get auto disconnect setting
            const autoDisconnect = db.prepare("SELECT value FROM settings WHERE key = 'auto_disconnect'").get();

            if (autoDisconnect?.value !== 'true') {
                console.log('Auto disconnect is disabled');
                return;
            }

            // Find overdue pending payments
            const overduePayments = db.prepare(`
                SELECT 
                    p.*,
                    u.id as user_id,
                    u.name,
                    u.unit_name,
                    u.phone_number,
                    u.is_active
                FROM payments p
                JOIN users u ON p.user_id = u.id
                WHERE p.status = 'pending'
                AND julianday('now') > julianday(p.due_date)
            `).all();

            for (const payment of overduePayments) {
                console.log(`Processing overdue: ${payment.name} (${payment.unit_name})`);

                // Update payment status
                db.prepare("UPDATE payments SET status = 'overdue' WHERE id = ?").run(payment.id);

                // Deactivate user if active
                if (payment.is_active) {
                    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(payment.user_id);

                    // Send disconnection notice
                    await whatsapp.sendDisconnectionNotice({
                        id: payment.user_id,
                        name: payment.name,
                        unit_name: payment.unit_name,
                        phone_number: payment.phone_number
                    });

                    console.log(`User ${payment.name} disconnected due to overdue payment`);
                }
            }
        } catch (error) {
            console.error('Error processing overdue payments:', error.message);
        }
    }

    updateBandwidthRules() {
        console.log('Updating bandwidth rules...');

        try {
            // Get all users with their bandwidth limits
            const users = db.prepare(`
                SELECT id, username, bandwidth_limit, is_active, ip_address
                FROM users
                WHERE ip_address IS NOT NULL
            `).all();

            // Generate bandwidth rules
            const rules = users.map(user => ({
                ip: user.ip_address,
                limit: user.is_active ? user.bandwidth_limit : 0,
                username: user.username
            }));

            // Write rules to file for the bandwidth script to read
            const rulesPath = require('path').join(__dirname, '../scripts/bandwidth-rules.json');
            require('fs').writeFileSync(rulesPath, JSON.stringify(rules, null, 2));

            // Note: Actual bandwidth enforcement happens via the bandwidth.sh script
            // which should be run as root via cron or systemd

            console.log(`Updated ${rules.length} bandwidth rules`);
        } catch (error) {
            console.error('Error updating bandwidth rules:', error.message);
        }
    }
}

module.exports = new SchedulerService();
