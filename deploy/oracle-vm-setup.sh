#!/bin/bash
# Control Point — Oracle Cloud Always-Free VM setup (nginx + systemd).
# Safe to re-run: every step is idempotent, and re-running redeploys the code.
#
# Run on a fresh Ubuntu 22.04/24.04 VM (ARM 4 OCPU / 24GB RAM, Always Free):
#   sudo bash deploy/oracle-vm-setup.sh
#
# Code source: if $APP_DIR already contains the app (e.g. copied over with
#   git archive origin/main | ssh ubuntu@VM 'sudo mkdir -p /opt/control-point && sudo tar -x -C /opt/control-point'
# it is used as-is. Otherwise the repo is cloned from $REPO_URL (private repos
# need a deploy key or token in the URL).
#
# Optional env vars:
#   DOMAIN="tryctrlpoint.org"   nginx server_name (www.$DOMAIN is added too)
#   CERTBOT_EMAIL="you@x.com"   when set, requests a Let's Encrypt cert for
#                               $DOMAIN — only do this once DNS points here
set -euo pipefail

APP_DIR="/opt/control-point"
APP_USER="controlpoint"
APP_PORT="3000"
REPO_URL="${REPO_URL:-https://github.com/sushilm20/control-point.git}"
DOMAIN="${DOMAIN:-tryctrlpoint.org}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"

echo "==> Updating system…"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

echo "==> Installing base packages (nginx, git, iptables-persistent)…"
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  ca-certificates curl gnupg git nginx iptables-persistent

echo "==> Installing Node.js 22…"
if ! command -v node >/dev/null 2>&1; then
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
    | tee /etc/apt/sources.list.d/nodesource.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq nodejs
fi
node --version

echo "==> Creating app user…"
id "$APP_USER" >/dev/null 2>&1 || useradd -r -m -s /bin/bash "$APP_USER"

echo "==> Fetching Control Point…"
if [ -d "$APP_DIR/.git" ]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" pull --ff-only
elif [ ! -f "$APP_DIR/package.json" ]; then
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
if [ ! -f "$APP_DIR/.env" ]; then
  # Minimal env so the server starts; replace with the real production values.
  echo "APP_URL=\"http://$(curl -fsS https://ifconfig.me || hostname -I | awk '{print $1}')\"" > "$APP_DIR/.env"
fi
chmod 600 "$APP_DIR/.env"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Installing dependencies + building…"
sudo -u "$APP_USER" bash -lc "cd $APP_DIR && npm ci --no-audit --no-fund && npm run build"

echo "==> Opening firewall (80/443)…"
# Oracle Ubuntu images end the INPUT chain with a catch-all REJECT, so the
# ACCEPT rules must be inserted *before* it (appending would never match).
for port in 80 443; do
  if ! iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    reject_line=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')
    iptables -I INPUT "${reject_line:-1}" -p tcp -m state --state NEW --dport "$port" -j ACCEPT
  fi
done
netfilter-persistent save
# The app port stays closed to the internet; only nginx reaches it via loopback.
# NOTE: also open 80/443 in the OCI console: Networking → VCN → Security Lists → ingress rules.

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
Environment=PORT=$APP_PORT
ExecStart=$APP_DIR/node_modules/.bin/tsx $APP_DIR/server.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable control-point
systemctl restart control-point

echo "==> Configuring nginx…"
cat >/etc/nginx/sites-available/control-point <<EOF
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $DOMAIN www.$DOMAIN _;

    # Chat attachments are capped at 10MB by multer; leave headroom.
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # WebSocket (team chat / live updates)
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF
ln -sf /etc/nginx/sites-available/control-point /etc/nginx/sites-enabled/control-point
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl reload nginx || systemctl restart nginx

if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  # The nginx site was just rewritten as HTTP-only; re-apply the existing cert.
  certbot install --nginx --non-interactive --redirect --cert-name "$DOMAIN"
elif [ -n "$CERTBOT_EMAIL" ]; then
  echo "==> Requesting TLS certificate for $DOMAIN…"
  apt-get install -y -qq certbot python3-certbot-nginx
  certbot --nginx --non-interactive --agree-tos --redirect -m "$CERTBOT_EMAIL" \
    -d "$DOMAIN" -d "www.$DOMAIN"
fi

echo ""
echo "=============================================================="
echo " Control Point is running behind nginx on port 80."
echo ""
echo " Remaining manual steps:"
echo "  1) Put the real production env vars in $APP_DIR/.env, then"
echo "       sudo systemctl restart control-point"
echo "  2) In the OCI console, allow ingress TCP 80/443 from 0.0.0.0/0"
echo "     in the subnet's security list."
echo "  3) Point $DOMAIN DNS at this VM, then re-run with"
echo "     CERTBOT_EMAIL=you@example.com to enable HTTPS."
echo "=============================================================="
