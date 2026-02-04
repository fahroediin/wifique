const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const db = require('../database');

class WhatsAppService {
    constructor() {
        this.client = null;
        this.isReady = false;
    }

    async initialize() {
        console.log('Initializing WhatsApp client...');

        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './whatsapp-session'
            }),
            puppeteer: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            }
        });

        this.client.on('qr', (qr) => {
            console.log('\n========================================');
            console.log('SCAN QR CODE BERIKUT DENGAN WHATSAPP:');
            console.log('========================================\n');
            qrcode.generate(qr, { small: true });
            console.log('\n========================================\n');
        });

        this.client.on('ready', () => {
            console.log('WhatsApp client is ready!');
            this.isReady = true;
        });

        this.client.on('disconnected', (reason) => {
            console.log('WhatsApp disconnected:', reason);
            this.isReady = false;
        });

        this.client.on('auth_failure', () => {
            console.log('WhatsApp auth failed');
            this.isReady = false;
        });

        await this.client.initialize();
    }

    formatPhoneNumber(phone) {
        // Convert to WhatsApp format (62xxx@c.us)
        let cleaned = phone.replace(/\D/g, '');

        // Convert 08xx to 628xx
        if (cleaned.startsWith('0')) {
            cleaned = '62' + cleaned.substring(1);
        }

        // Add @c.us suffix
        if (!cleaned.endsWith('@c.us')) {
            cleaned = cleaned + '@c.us';
        }

        return cleaned;
    }

    async sendMessage(phoneNumber, message) {
        if (!this.isReady) {
            console.log('WhatsApp not ready, cannot send message');
            return false;
        }

        try {
            const formattedNumber = this.formatPhoneNumber(phoneNumber);
            await this.client.sendMessage(formattedNumber, message);
            console.log(`Message sent to ${phoneNumber}`);
            return true;
        } catch (error) {
            console.error('Failed to send WhatsApp message:', error.message);
            return false;
        }
    }

    async sendPaymentReminder(user, payment, daysUntilDue) {
        const message = `Halo ${user.name}! 👋

🔔 *PENGINGAT PEMBAYARAN WIFI*

Unit: ${user.unit_name}
Periode: ${this.getMonthName(payment.period_month)} ${payment.period_year}
Jumlah: Rp ${this.formatNumber(payment.amount)}
Jatuh Tempo: ${this.formatDate(payment.due_date)}

${daysUntilDue > 0
                ? `⏰ Tagihan akan jatuh tempo dalam *${daysUntilDue} hari*.`
                : daysUntilDue === 0
                    ? `⚠️ Tagihan jatuh tempo *HARI INI*.`
                    : `❌ Tagihan sudah *LEWAT JATUH TEMPO*.`
            }

Mohon segera lakukan pembayaran untuk menghindari pemutusan layanan internet.

Terima kasih! 🙏
_WiFique System_`;

        const success = await this.sendMessage(user.phone_number, message);

        // Log notification
        if (success) {
            db.prepare(`
                INSERT INTO notification_log (user_id, type, message, status)
                VALUES (?, 'payment_reminder', ?, 'sent')
            `).run(user.id, message);
        }

        return success;
    }

    async sendDisconnectionNotice(user) {
        const message = `Halo ${user.name},

⚠️ *PEMBERITAHUAN PEMUTUSAN INTERNET*

Unit: ${user.unit_name}

Layanan internet Anda telah *DINONAKTIFKAN* karena tagihan yang belum dibayar.

Untuk mengaktifkan kembali layanan, mohon segera lakukan pembayaran dan hubungi admin.

Terima kasih atas pengertiannya.
_WiFique System_`;

        const success = await this.sendMessage(user.phone_number, message);

        if (success) {
            db.prepare(`
                INSERT INTO notification_log (user_id, type, message, status)
                VALUES (?, 'disconnection', ?, 'sent')
            `).run(user.id, message);
        }

        return success;
    }

    async sendReconnectionNotice(user) {
        const message = `Halo ${user.name}! 🎉

✅ *LAYANAN INTERNET AKTIF*

Unit: ${user.unit_name}

Pembayaran Anda telah dikonfirmasi. Layanan internet sudah *AKTIF KEMBALI*.

Terima kasih telah melakukan pembayaran tepat waktu!

Selamat berselancar! 🌐
_WiFique System_`;

        const success = await this.sendMessage(user.phone_number, message);

        if (success) {
            db.prepare(`
                INSERT INTO notification_log (user_id, type, message, status)
                VALUES (?, 'reconnection', ?, 'sent')
            `).run(user.id, message);
        }

        return success;
    }

    // Helper functions
    formatNumber(num) {
        return new Intl.NumberFormat('id-ID').format(num);
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    getMonthName(month) {
        const months = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        return months[month];
    }
}

module.exports = new WhatsAppService();
