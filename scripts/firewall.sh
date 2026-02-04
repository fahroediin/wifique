#!/bin/bash
# =============================================================================
# WiFique Firewall & NAT Setup Script
# =============================================================================
# Script ini mengatur:
# 1. NAT/Masquerading untuk internet sharing
# 2. Firewall rules
# 3. Captive portal redirect untuk user yang belum login
# =============================================================================

# Configuration
WAN_IF="eth0"           # Interface ke modem ISP
LAN_IF="eth1"           # Interface ke switch
WIFI_IF="wlan0"         # Interface WiFi (USB adapter)
BRIDGE_IF="br0"         # Bridge interface (LAN + WiFi)

LAN_NETWORK="192.168.10.0/24"
PORTAL_IP="192.168.10.1"
PORTAL_PORT="3000"

# Whitelist IPs (admin devices that bypass captive portal)
ADMIN_IPS="192.168.10.2"

# =============================================================================
# Functions
# =============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Enable IP forwarding
enable_forwarding() {
    log "Enabling IP forwarding..."
    echo 1 > /proc/sys/net/ipv4/ip_forward
    
    # Make it permanent
    if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
        echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
    fi
}

# Clear all rules
clear_rules() {
    log "Clearing firewall rules..."
    
    iptables -F
    iptables -X
    iptables -t nat -F
    iptables -t nat -X
    iptables -t mangle -F
    iptables -t mangle -X
    
    # Reset policies
    iptables -P INPUT ACCEPT
    iptables -P FORWARD ACCEPT
    iptables -P OUTPUT ACCEPT
}

# Setup NAT
setup_nat() {
    log "Setting up NAT..."
    
    # Enable masquerading for internet access
    iptables -t nat -A POSTROUTING -o $WAN_IF -j MASQUERADE
    
    # Allow forwarding from LAN to WAN
    iptables -A FORWARD -i $LAN_IF -o $WAN_IF -j ACCEPT
    iptables -A FORWARD -i $WIFI_IF -o $WAN_IF -j ACCEPT
    
    # Allow established connections back
    iptables -A FORWARD -i $WAN_IF -o $LAN_IF -m state --state RELATED,ESTABLISHED -j ACCEPT
    iptables -A FORWARD -i $WAN_IF -o $WIFI_IF -m state --state RELATED,ESTABLISHED -j ACCEPT
    
    log "NAT configured"
}

# Setup basic firewall
setup_firewall() {
    log "Setting up firewall..."
    
    # Allow loopback
    iptables -A INPUT -i lo -j ACCEPT
    
    # Allow established connections
    iptables -A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT
    
    # Allow SSH (for admin)
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT
    
    # Allow HTTP/HTTPS for dashboard and portal
    iptables -A INPUT -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -p tcp --dport 443 -j ACCEPT
    iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
    
    # Allow DNS and DHCP
    iptables -A INPUT -p udp --dport 53 -j ACCEPT
    iptables -A INPUT -p udp --dport 67:68 -j ACCEPT
    
    # Allow ping
    iptables -A INPUT -p icmp -j ACCEPT
    
    log "Firewall configured"
}

# Setup captive portal redirect
setup_captive_portal() {
    log "Setting up captive portal redirect..."
    
    # Create ipset for authenticated users
    ipset create wifique_auth hash:ip 2>/dev/null || ipset flush wifique_auth
    
    # Add admin IPs to authenticated set
    for IP in $ADMIN_IPS; do
        ipset add wifique_auth $IP 2>/dev/null
    done
    
    # Mark unauthenticated traffic
    iptables -t mangle -N WIFIQUE_CHECK 2>/dev/null || iptables -t mangle -F WIFIQUE_CHECK
    iptables -t mangle -A WIFIQUE_CHECK -m set --match-set wifique_auth src -j RETURN
    iptables -t mangle -A WIFIQUE_CHECK -j MARK --set-mark 99
    
    # Apply to traffic from LAN/WiFi
    iptables -t mangle -A PREROUTING -i $LAN_IF -j WIFIQUE_CHECK
    iptables -t mangle -A PREROUTING -i $WIFI_IF -j WIFIQUE_CHECK
    
    # Redirect marked HTTP traffic to captive portal
    iptables -t nat -A PREROUTING -m mark --mark 99 -p tcp --dport 80 -j DNAT --to-destination $PORTAL_IP:$PORTAL_PORT
    
    # Redirect HTTPS to portal (for captive portal detection)
    iptables -t nat -A PREROUTING -m mark --mark 99 -p tcp --dport 443 -j DNAT --to-destination $PORTAL_IP:$PORTAL_PORT
    
    # Block non-HTTP/HTTPS for unauthenticated users
    iptables -A FORWARD -m mark --mark 99 -p tcp --dport 80 -j ACCEPT
    iptables -A FORWARD -m mark --mark 99 -p tcp --dport 443 -j ACCEPT
    iptables -A FORWARD -m mark --mark 99 -p udp --dport 53 -j ACCEPT
    iptables -A FORWARD -m mark --mark 99 -j DROP
    
    log "Captive portal configured"
}

# Add authenticated user
add_user() {
    local IP=$1
    if [ -n "$IP" ]; then
        ipset add wifique_auth $IP 2>/dev/null
        log "Added authenticated user: $IP"
    fi
}

# Remove authenticated user
remove_user() {
    local IP=$1
    if [ -n "$IP" ]; then
        ipset del wifique_auth $IP 2>/dev/null
        log "Removed authenticated user: $IP"
    fi
}

# Show status
show_status() {
    echo "=== Authenticated Users ==="
    ipset list wifique_auth
    echo ""
    echo "=== NAT Rules ==="
    iptables -t nat -L -v -n
    echo ""
    echo "=== Forward Rules ==="
    iptables -L FORWARD -v -n
}

# =============================================================================
# Main
# =============================================================================

case "$1" in
    start)
        log "Starting firewall..."
        enable_forwarding
        clear_rules
        setup_nat
        setup_firewall
        setup_captive_portal
        log "Firewall started"
        ;;
    stop)
        log "Stopping firewall..."
        clear_rules
        log "Firewall stopped"
        ;;
    restart)
        $0 stop
        sleep 1
        $0 start
        ;;
    status)
        show_status
        ;;
    add-user)
        add_user $2
        ;;
    remove-user)
        remove_user $2
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|add-user IP|remove-user IP}"
        exit 1
        ;;
esac

exit 0
