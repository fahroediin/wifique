#!/bin/bash
# =============================================================================
# WiFique Bandwidth Control Script with QoS (Anti-Bufferbloat)
# =============================================================================
# Script ini mengatur:
# 1. Bandwidth limit per user
# 2. QoS untuk menghindari ping spike saat download
# 3. Prioritas traffic latency-sensitive (gaming, video call)
# =============================================================================

# Configuration
WAN_IF="eth0"           # Interface ke modem ISP
LAN_IF="eth1"           # Interface ke jaringan lokal (atau br0 jika bridge)
WIFI_IF="wlan0"         # Interface WiFi (USB adapter)

# Total bandwidth (sesuaikan dengan kecepatan ISP)
DOWNLOAD_SPEED="50mbit"  # 50 Mbps download
UPLOAD_SPEED="10mbit"    # 10 Mbps upload (sesuaikan)

# Reserved bandwidth for system (5%)
DOWNLOAD_RESERVED="2.5mbit"
UPLOAD_RESERVED="0.5mbit"

# Path ke rules file
RULES_FILE="/opt/wifique/scripts/bandwidth-rules.json"

# =============================================================================
# Functions
# =============================================================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Clear all existing rules
clear_rules() {
    log "Clearing existing QoS rules..."
    
    # Clear tc rules
    tc qdisc del dev $WAN_IF root 2>/dev/null
    tc qdisc del dev $LAN_IF root 2>/dev/null
    tc qdisc del dev $WIFI_IF root 2>/dev/null
    
    # Clear ingress
    tc qdisc del dev $WAN_IF ingress 2>/dev/null
}

# Setup base QoS with CAKE (modern anti-bufferbloat)
setup_qos() {
    log "Setting up QoS with CAKE..."
    
    # Egress (Upload) - CAKE for anti-bufferbloat
    # CAKE automatically handles bufferbloat and provides fair queuing
    tc qdisc add dev $WAN_IF root cake bandwidth $UPLOAD_SPEED besteffort wash nat nowash ack-filter-aggressive
    
    # Ingress (Download) - Use IFB and CAKE
    # Create IFB device for ingress shaping
    modprobe ifb
    ip link set dev ifb0 up
    
    # Redirect ingress to IFB
    tc qdisc add dev $WAN_IF handle ffff: ingress
    tc filter add dev $WAN_IF parent ffff: protocol all u32 match u32 0 0 action mirred egress redirect dev ifb0
    
    # Apply CAKE to IFB (download shaping)
    tc qdisc add dev ifb0 root cake bandwidth $DOWNLOAD_SPEED besteffort wash ingress
    
    log "QoS setup complete"
}

# Setup per-user bandwidth limits using HTB
setup_user_limits() {
    log "Setting up per-user bandwidth limits..."
    
    if [ ! -f "$RULES_FILE" ]; then
        log "Rules file not found: $RULES_FILE"
        return
    fi
    
    # Read rules from JSON file
    # Format: [{"ip": "192.168.10.xxx", "limit": 15, "username": "user1"}, ...]
    
    # Setup HTB on LAN interface
    tc qdisc add dev $LAN_IF root handle 1: htb default 999
    
    # Root class for total bandwidth
    tc class add dev $LAN_IF parent 1: classid 1:1 htb rate $DOWNLOAD_SPEED
    
    # Default class for unclassified traffic
    tc class add dev $LAN_IF parent 1:1 classid 1:999 htb rate 1mbit ceil $DOWNLOAD_SPEED prio 7
    tc qdisc add dev $LAN_IF parent 1:999 handle 999: fq_codel
    
    # Parse JSON and create classes for each user
    CLASS_ID=10
    while read -r line; do
        IP=$(echo "$line" | grep -oP '"ip"\s*:\s*"\K[^"]+')
        LIMIT=$(echo "$line" | grep -oP '"limit"\s*:\s*\K[0-9]+')
        USERNAME=$(echo "$line" | grep -oP '"username"\s*:\s*"\K[^"]+')
        
        if [ -n "$IP" ] && [ -n "$LIMIT" ]; then
            if [ "$LIMIT" -gt 0 ]; then
                log "Adding limit for $USERNAME ($IP): ${LIMIT}mbit"
                
                # Create class for this user
                tc class add dev $LAN_IF parent 1:1 classid 1:$CLASS_ID htb rate ${LIMIT}mbit ceil ${LIMIT}mbit prio 5
                # Add fq_codel for anti-bufferbloat per user
                tc qdisc add dev $LAN_IF parent 1:$CLASS_ID handle $CLASS_ID: fq_codel
                # Filter to match user's IP
                tc filter add dev $LAN_IF parent 1: protocol ip prio 1 u32 match ip dst $IP flowid 1:$CLASS_ID
            else
                log "Blocking user $USERNAME ($IP)"
                # Block by redirecting to a class with no bandwidth
                tc filter add dev $LAN_IF parent 1: protocol ip prio 1 u32 match ip dst $IP action drop
            fi
            
            CLASS_ID=$((CLASS_ID + 1))
        fi
    done < <(cat "$RULES_FILE" | grep -o '{[^}]*}')
    
    log "User limits configured"
}

# Setup WiFi interface bandwidth (for USB WiFi AP)
setup_wifi_limits() {
    log "Setting up WiFi interface limits..."
    
    # Simple HTB on WiFi interface
    tc qdisc add dev $WIFI_IF root handle 1: htb default 10
    tc class add dev $WIFI_IF parent 1: classid 1:1 htb rate $DOWNLOAD_SPEED
    tc class add dev $WIFI_IF parent 1:1 classid 1:10 htb rate $DOWNLOAD_SPEED ceil $DOWNLOAD_SPEED
    tc qdisc add dev $WIFI_IF parent 1:10 handle 10: fq_codel
    
    log "WiFi limits configured"
}

# Show current status
show_status() {
    echo "=== WAN Interface ($WAN_IF) ==="
    tc -s qdisc show dev $WAN_IF
    echo ""
    echo "=== LAN Interface ($LAN_IF) ==="
    tc -s qdisc show dev $LAN_IF
    echo ""
    echo "=== WiFi Interface ($WIFI_IF) ==="
    tc -s qdisc show dev $WIFI_IF 2>/dev/null || echo "Not configured"
}

# =============================================================================
# Main
# =============================================================================

case "$1" in
    start)
        log "Starting bandwidth control..."
        clear_rules
        setup_qos
        setup_user_limits
        setup_wifi_limits
        log "Bandwidth control started"
        ;;
    stop)
        log "Stopping bandwidth control..."
        clear_rules
        log "Bandwidth control stopped"
        ;;
    restart)
        $0 stop
        sleep 1
        $0 start
        ;;
    status)
        show_status
        ;;
    update)
        # Just update user limits without resetting QoS
        log "Updating user limits..."
        tc qdisc del dev $LAN_IF root 2>/dev/null
        setup_user_limits
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|update}"
        exit 1
        ;;
esac

exit 0
