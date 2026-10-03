#!/bin/bash
# Control Point — Oracle Cloud Always-Free VM setup (nginx + systemd).
# Safe to re-run: every step is idempotent. Re-running rebuilds and restarts
# whatever code is in $APP_DIR (git installs pull first; archive installs must
# copy the new archive over before re-running).
#
# Run on a fresh Ubuntu 22.04/24.04 VM (ARM 4 OCPU / 24GB RAM, Always Free):
#   sudo bash deploy/oracle-vm-setup.sh
#
# Code source: if $APP_DIR already contains the app (e.g. copied over with
#   git archive origin/main | ssh ubuntu@VM 'sudo mkdir -p /opt/control-point && sudo tar -x -C /opt/control-point'
# it is used as-is. Otherwise the repo is cloned from $REPO_URL (private repos
# need a deploy key or token in the URL).
#
# Optional env vars (pass them after sudo so they survive its env reset):
#   sudo DOMAIN=tryctrlpoint.org CERTBOT_EMAIL=you@example.com bash deploy/oracle-vm-setup.sh
#   DOMAIN          nginx server_name; www.$DOMAIN is included if its DNS points here
#   CERTBOT_EMAIL   when set, requests a Let's Encrypt cert for $DOMAIN (agrees to
#                   the Let's Encrypt terms) — only once DNS points at this VM
set -euo pipefail

APP_DIR="/opt/control-point"
APP_USER="controlpoint"
APP_PORT="3000"
REPO_URL="${REPO_URL:-https://github.com/Control-Point-FTC/control-point.git}"
DOMAIN="${DOMAIN:-tryctrlpoint.org}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
ACME_ROOT="/var/www/certbot"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
SITE_CONF="/etc/nginx/sites-available/control-point"

echo "==> Updating system…"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

# Earlier versions of this script used Caddy, which holds ports 80/443.
if systemctl cat caddy.service >/dev/null 2>&1; then
  echo "==> Disabling Caddy (replaced by nginx)…"
  systemctl disable --now caddy || true
fi

echo "==> Installing base packages (nginx, git, certbot, iptables-persistent)…"
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  ca-certificates curl gnupg git nginx certbot iptables-persistent

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
else
  echo "    Using existing code in $APP_DIR (archive install — copy a new archive to update)."
fi
PUBLIC_IP="$(curl -fsS --max-time 5 https://ifconfig.me || hostname -I | awk '{print $1}')"
if [ ! -f "$APP_DIR/.env" ]; then
  # Minimal env so the server starts; replace with the real production values.
  # This placeholder APP_URL is swapped for https://$DOMAIN once HTTPS is live.
  echo "APP_URL=\"http://$PUBLIC_IP\"" > "$APP_DIR/.env"
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

# Only request www.$DOMAIN when one of its A records points at this VM, so a
# missing www record doesn't fail certificate validation for the apex.
SERVER_NAMES="$DOMAIN"
CERT_DOMAINS=(-d "$DOMAIN")
if getent ahostsv4 "www.$DOMAIN" | awk '{print $1}' | grep -qxF "$PUBLIC_IP"; then
  SERVER_NAMES="$DOMAIN www.$DOMAIN"
  CERT_DOMAINS+=(-d "www.$DOMAIN")
fi

cert_covers_www() {
  openssl x509 -noout -ext subjectAltName -in "$CERT_DIR/fullchain.pem" 2>/dev/null \
    | grep -qF "DNS:www.$DOMAIN"
}

# Writes the nginx site. With a certificate present the HTTPS config is written
# directly (port 80 only serves ACME challenges + redirects), so a re-run never
# drops back to HTTP-only, even briefly.
write_nginx_site() {
  local proxy
  proxy=$(cat <<EOF
    # Largest legit request: CAD snapshot (25MiB model + 25MiB screenshot) plus multipart framing.
    client_max_body_size 64m;

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
EOF
)
  {
    cat <<EOF
map \$http_upgrade \$connection_upgrade {
    default upgrade;
    ''      close;
}

EOF
    if [ -f "$CERT_DIR/fullchain.pem" ]; then
      # Serve www over HTTPS only if the certificate actually covers it.
      local tls_names="$DOMAIN"
      cert_covers_www && tls_names="$DOMAIN www.$DOMAIN"
      cat <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $SERVER_NAMES _;

    location /.well-known/acme-challenge/ { root $ACME_ROOT; }
    location / { return 301 https://$DOMAIN\$request_uri; }
}

server {
    # "listen ... http2" (not "http2 on;") so this works on nginx < 1.25 (Ubuntu 22.04/24.04).
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name $tls_names;

    ssl_certificate     $CERT_DIR/fullchain.pem;
    ssl_certificate_key $CERT_DIR/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    add_header Strict-Transport-Security "max-age=31536000" always;

$proxy
}
EOF
    else
      cat <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name $SERVER_NAMES _;

    location /.well-known/acme-challenge/ { root $ACME_ROOT; }

$proxy
}
EOF
    fi
  } > "$SITE_CONF.new"
  # Validate before swapping so a bad config never replaces a working one.
  cp -f "$SITE_CONF" "$SITE_CONF.bak" 2>/dev/null || true
  mv -f "$SITE_CONF.new" "$SITE_CONF"
  if ! nginx -t; then
    [ -f "$SITE_CONF.bak" ] && mv -f "$SITE_CONF.bak" "$SITE_CONF"
    echo "nginx config test failed; previous config restored." >&2
    exit 1
  fi
  systemctl reload nginx || systemctl restart nginx
}

echo "==> Configuring nginx…"
mkdir -p "$ACME_ROOT"
ln -sf "$SITE_CONF" /etc/nginx/sites-enabled/control-point
rm -f /etc/nginx/sites-enabled/default
systemctl enable nginx
write_nginx_site

if [ ! -f "$CERT_DIR/fullchain.pem" ] && [ -n "$CERTBOT_EMAIL" ]; then
  # Issue the apex alone first so a www validation failure (e.g. a www record
  # with other addresses that don't serve this VM's challenge) can't block it.
  echo "==> Requesting TLS certificate for $DOMAIN…"
  certbot certonly --webroot -w "$ACME_ROOT" --non-interactive --agree-tos \
    -m "$CERTBOT_EMAIL" --cert-name "$DOMAIN" -d "$DOMAIN" \
    --deploy-hook "systemctl reload nginx"
  write_nginx_site
fi

if [ -f "$CERT_DIR/fullchain.pem" ] && [ ${#CERT_DOMAINS[@]} -gt 2 ] && ! cert_covers_www; then
  # Best-effort: add www to the existing certificate. Failure keeps the
  # apex-only cert and nginx serves only the apex over HTTPS.
  echo "==> Expanding TLS certificate to include www.$DOMAIN…"
  if certbot certonly --webroot -w "$ACME_ROOT" --non-interactive --expand \
      --cert-name "$DOMAIN" "${CERT_DOMAINS[@]}" --deploy-hook "systemctl reload nginx"; then
    write_nginx_site
  else
    echo "WARNING: could not add www.$DOMAIN to the certificate; serving the apex only over HTTPS." >&2
  fi
fi

if [ -f "$CERT_DIR/fullchain.pem" ]; then
  # Swap the bootstrap http://<ip> placeholder for the real HTTPS origin so
  # OAuth callbacks use the domain. A hand-set APP_URL is left alone.
  sed -i -E "s#^APP_URL=\"?http://[0-9.]+\"?\$#APP_URL=\"https://$DOMAIN\"#" "$APP_DIR/.env"
fi

systemctl restart control-point

echo ""
echo "=============================================================="
if [ -f "$CERT_DIR/fullchain.pem" ]; then
  echo " Control Point is live at https://$DOMAIN (nginx, HTTP → HTTPS)."
else
  echo " Control Point is running behind nginx on http://$PUBLIC_IP"
  echo ""
  echo " WARNING: HTTPS is NOT enabled — logins and messages travel in"
  echo " plaintext. Use this for testing only until step 3 is done."
fi
echo ""
echo " Remaining manual steps:"
echo "  1) Put the real production env vars in $APP_DIR/.env, then"
echo "       sudo systemctl restart control-point"
echo "  2) In the OCI console, allow ingress TCP 80/443 from 0.0.0.0/0"
echo "     in the subnet's security list."
if [ ! -f "$CERT_DIR/fullchain.pem" ]; then
  echo "  3) Point $DOMAIN (and optionally www.$DOMAIN) DNS at $PUBLIC_IP, then:"
  echo "       sudo DOMAIN=$DOMAIN CERTBOT_EMAIL=you@example.com bash $APP_DIR/deploy/oracle-vm-setup.sh"
fi
echo "=============================================================="
