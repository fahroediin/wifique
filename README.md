# WiFique

Sistem manajemen WiFi untuk unit kontrakan dengan fitur:
- 🔐 User management dengan captive portal
- 📊 Bandwidth limiting per user
- 💰 Payment tracking dengan auto-disconnect
- 📱 WhatsApp reminder otomatis
- ⚡ QoS anti-bufferbloat (ping stabil saat download)

## Quick Start

### Development (Windows)
```bash
npm install
npm run dev
```

Akses: http://localhost:3000/dashboard

### Production (Ubuntu Server)
Lihat [docs/SETUP.md](docs/SETUP.md) untuk panduan lengkap.

## Default Login
- **Username**: admin
- **Password**: admin123

⚠️ Segera ganti password setelah login pertama!

## Tech Stack
- Node.js + Express
- SQLite (better-sqlite3)
- whatsapp-web.js
- iptables + tc (traffic control)
- CAKE qdisc (anti-bufferbloat)

## License
MIT
# wifique
