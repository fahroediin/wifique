# WiFique - Setup Guide

## 1. Persiapan Hardware

### Yang Dibutuhkan:
- ✅ Mini PC (2 Ethernet port, 4GB RAM)
- 🛒 Switch 5 port (~Rp 80.000)
- 🛒 USB WiFi Adapter (~Rp 100.000)

### Koneksi:
```
[Modem ISP] ─── eth0 ──▶ [Mini PC] ─── eth1 ──▶ [Switch] ──▶ [Laptop Admin]
                              │
                         USB WiFi ──▶ (SSID: Wifique) ──▶ [User Kontrakan]
```

---

## 2. Install Ubuntu Server

1. Download Ubuntu Server 22.04 LTS
2. Buat bootable USB (gunakan Rufus/Etcher)
3. Install di Mini PC
4. Saat install, setup:
   - Hostname: `wifique`
   - Username: `admin`
   - Enable SSH

---

## 3. Konfigurasi Jaringan

### 3.1 Identifikasi Interface
```bash
ip link show
```
Catat nama interface (biasanya `enp1s0`, `enp2s0`, `wlan0`)

### 3.2 Setup Netplan
```bash
sudo nano /etc/netplan/01-network.yaml
```

```yaml
network:
  version: 2
  ethernets:
    # WAN - ke modem ISP (DHCP)
    eth0:  # Ganti dengan nama interface WAN Anda
      dhcp4: true
      
    # LAN - ke switch (Static)  
    eth1:  # Ganti dengan nama interface LAN Anda
      addresses:
        - 192.168.10.1/24
      dhcp4: false
```

Apply:
```bash
sudo netplan apply
```

### 3.3 Install DHCP Server
```bash
sudo apt update
sudo apt install dnsmasq -y
sudo systemctl stop systemd-resolved
sudo systemctl disable systemd-resolved
```

```bash
sudo nano /etc/dnsmasq.conf
```

```conf
interface=eth1
dhcp-range=192.168.10.100,192.168.10.200,24h
dhcp-option=option:router,192.168.10.1
dhcp-option=option:dns-server,8.8.8.8,8.8.4.4
```

```bash
sudo systemctl restart dnsmasq
sudo systemctl enable dnsmasq
```

---

## 4. Setup USB WiFi sebagai Access Point

### 4.1 Install hostapd
```bash
sudo apt install hostapd -y
```

### 4.2 Konfigurasi hostapd
```bash
sudo nano /etc/hostapd/hostapd.conf
```

```conf
interface=wlan0
driver=nl80211
ssid=Wifique
hw_mode=g
channel=7
wmm_enabled=0
macaddr_acl=0
auth_algs=1
ignore_broadcast_ssid=0
wpa=2
wpa_passphrase=WifiquePKampung2024
wpa_key_mgmt=WPA-PSK
wpa_pairwise=TKIP
rsn_pairwise=CCMP
```

### 4.3 Enable hostapd
```bash
sudo nano /etc/default/hostapd
```
Set: `DAEMON_CONF="/etc/hostapd/hostapd.conf"`

```bash
sudo systemctl unmask hostapd
sudo systemctl enable hostapd
sudo systemctl start hostapd
```

### 4.4 Bridge WiFi ke LAN
```bash
sudo nano /etc/netplan/01-network.yaml
```

Tambahkan:
```yaml
  bridges:
    br0:
      interfaces: [eth1, wlan0]
      addresses:
        - 192.168.10.1/24
```

---

## 5. Install Wifique

### 5.1 Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs -y
```

### 5.2 Clone/Copy Wifique
```bash
sudo mkdir -p /opt/wifique
sudo cp -r /path/to/wifique/* /opt/wifique/
cd /opt/wifique
```

### 5.3 Install Dependencies
```bash
sudo npm install
```

### 5.4 Setup Scripts
```bash
sudo chmod +x scripts/*.sh
```

### 5.5 Create Systemd Service
```bash
sudo nano /etc/systemd/system/wifique.service
```

```ini
[Unit]
Description=WiFique Management System
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/wifique
ExecStart=/usr/bin/node server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable wifique
sudo systemctl start wifique
```

---

## 6. Setup Firewall & Bandwidth

```bash
sudo /opt/wifique/scripts/firewall.sh start
sudo /opt/wifique/scripts/bandwidth.sh start
```

Untuk auto-start saat boot:
```bash
sudo crontab -e
```

Tambahkan:
```
@reboot /opt/wifique/scripts/firewall.sh start
@reboot /opt/wifique/scripts/bandwidth.sh start
```

---

## 7. Setup WhatsApp

Saat pertama kali menjalankan Wifique, akan muncul QR code di terminal:

```bash
sudo journalctl -u wifique -f
```

Scan QR code dengan WhatsApp Anda untuk menghubungkan.

---

## 8. Akses Dashboard

Buka browser dan akses:
- **Dashboard**: http://192.168.10.1:3000/dashboard
- **Login**: admin / admin123 (segera ganti password!)

---

## 9. Matikan WiFi Modem ISP

⚠️ **PENTING**: Login ke modem ISP dan matikan WiFi-nya agar semua traffic melalui Wifique.

---

## Troubleshooting

### WiFi tidak broadcast SSID
```bash
sudo hostapd -d /etc/hostapd/hostapd.conf
```

### Tidak bisa akses internet
```bash
# Cek NAT
sudo iptables -t nat -L -n

# Cek forwarding
cat /proc/sys/net/ipv4/ip_forward
```

### Dashboard tidak bisa diakses
```bash
sudo systemctl status wifique
sudo journalctl -u wifique -n 50
```
