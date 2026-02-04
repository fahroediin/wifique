# WiFique

Sistem manajemen WiFi untuk unit kontrakan dengan fitur:
- 🔐 User management dengan captive portal
- 📊 Bandwidth limiting per user
- 💰 Payment tracking dengan auto-disconnect
- 📱 WhatsApp reminder otomatis
- ⚡ QoS anti-bufferbloat (ping stabil saat download)

## Network Topology

```
┌──────────┐     ┌─────────────────────────────────────────────┐
│  MODEM   │     │              MINI PC / BEELINK              │
│   ISP    │────▶│  ┌─────────────┐  ┌────────────────────┐   │
│ 50 Mbps  │eth0 │  │ USB-to-ETH  │  │ USB WiFi (AP)      │   │
└──────────┘     │  │ (eth1/LAN)  │  │ MediaTek chipset   │   │
                 │  └──────┬──────┘  └─────────┬──────────┘   │
                 │         │                   │              │
                 │  ┌──────┴───────────────────┴──────┐       │
                 │  │         WIFIQUE SERVER          │       │
                 │  │  • Dashboard Admin              │       │
                 │  │  • Captive Portal               │       │
                 │  │  • Bandwidth Control (QoS)      │       │
                 │  │  • WhatsApp Notifier            │       │
                 │  └─────────────────────────────────┘       │
                 └─────────┬───────────────────┬──────────────┘
                           │                   │
                           ▼                   ▼
                    ┌──────────┐        ┌─────────────────┐
                    │  SWITCH  │        │  SSID: Wifique  │
                    │  5 Port  │        │   WiFi Users    │
                    └────┬─────┘        └────────┬────────┘
                         │                       │
                  ┌──────┴──────┐         ┌──────┴──────┐
                  ▼             ▼         ▼      ▼      ▼
             ┌────────┐   ┌─────────┐  ┌─────────────────────┐
             │ LAPTOP │   │ Other   │  │ Unit A  B  C  ...   │
             │ Admin  │   │ Wired   │  │ 15Mbps 15Mbps 20Mbps│
             └────────┘   └─────────┘  └─────────────────────┘
```

## Hardware Requirements

| Item | Estimasi Harga |
|------|----------------|
| Mini PC (Beelink/sejenisnya) | (sudah ada) |
| USB-to-Ethernet Adapter | ~Rp 80.000 |
| USB WiFi Adapter (MediaTek) | ~Rp 100.000 - 200.000 |
| Switch 5 Port | ~Rp 80.000 |
| **Total** | **~Rp 260.000 - 360.000** |

## Quick Start

### Development (Windows)
```bash
npm install
npm run dev
```

Akses: http://localhost:3000/dashboard

### Production (Debian/Ubuntu)
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
