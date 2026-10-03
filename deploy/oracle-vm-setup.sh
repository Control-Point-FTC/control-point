#!/bin/bash
# Control Point — Oracle Cloud Always-Free VM setup.
# Run ONCE on a fresh Ubuntu 22.04/24.04 ARM VM (4 OCPU / 24GB RAM, Always Free).
#   curl -fsSL https://raw.githubusercontent.com/sushilm20/control-point/main/deploy/oracle-vm-setup.sh | sudo bash
# After this finishes, copy your .env into /opt/control-point/.env, then:
#   sudo systemctl enable --now control-point
set -euo pipefail

APP_DIR="/opt/control-point"
APP_USER="controlpoint"

echo "==> Updating system…"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

echo "==> Installing Node.js 22…"
if ! command -v node >/dev/null 2>&1; then
  apt-get install -y -qq ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    | tee /etc/apt/sources.list.d/nodesource.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq nodejs
fi
node --version

echo "==> Installing Caddy (reverse proxy + automatic HTTPS)…"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

echo "==> Creating app user…"
id "$APP_USER" >/dev/null 2>&1 || useradd -r -m -s /bin/bash "$APP_USER"

echo "==> Cloning Control Point…"
if [ ! -d "$APP_DIR/.git" ]; then
  rm -rf "$APP_DIR"
  git clone https://github.com/sushilm20/control-point.git "$APP_DIR" || {
    apt-get install -y -qq git
    git clone https://github.com/sushilm20/control-point.git "$APP_DIR"
  }
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Installing dependencies + building…"
sudo -u "$APP_USER" bash -lc "cd $APP_DIR && npm install --no-audit --no-fund -q"
sudo -u "$APP_USER" bash -lc "cd $APP_DIR && npm run build"

echo "==> Opening firewall (80/443)…"
# Oracle Ubuntu images ship with iptables DROP on INPUT; punch holes for web.
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
netfilter-persistent save 2>/dev/null || (apt-get install -y -qq iptables-persistent && netfilter-persistent save) || true
# NOTE: also open 80/443 in the OCI console: Networking → Security Lists → ingress rules.

echo "==> Writing systemd service…"
cat >/etc/systemd/system/control-point.service <<EOF
[Unit]
Description=Control Point app server
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node $APP_DIR/bin/cli.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload

echo "==> Configuring Caddy for tryctrlpoint.org…"
cat >/etc/caddy/Caddyfile <<'EOF'
tryctrlpoint.org, www.tryctrlpoint.org {
	reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy || systemctl restart caddy

echo ""
echo "=============================================================="
echo " Base install done. Two manual steps remain:"
echo ""
echo " 1) Copy your env file (all the Render env vars) to:"
echo "      $APP_DIR/.env"
echo "    Then:  sudo chown $APP_USER:$APP_USER $APP_DIR/.env"
echo "           sudo chmod 600 $APP_DIR/.env"
echo ""
echo " 2) In the OCI console, open ports 80/443 in the subnet's"
echo "    security list (ingress: 0.0.0.0/0 → TCP 80, 443)."
echo ""
echo " Then start the app:"
echo "    sudo systemctl enable --now control-point"
echo " Point tryctrlpoint.org DNS at this VM's public IP, and Caddy"
echo " will fetch the TLS certificate automatically."
echo "=============================================================="
