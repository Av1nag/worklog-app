# Deploying Worklog on a home server

The app is a stateless Node process + Postgres. Nothing here is host-specific
beyond `DATABASE_URL` and `SESSION_SECRET`.

## 0. Local development (macOS, already set up)

```bash
brew services start postgresql@17
createdb worklog                     # once
cp .env.example .env                 # already done; edit if needed
npm install
npm run dev                          # http://localhost:3000
```

`psql` lives at `/opt/homebrew/opt/postgresql@17/bin` — add it to PATH if `psql`
isn't found:

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
```

---

## 1. The home server box

Assume Ubuntu/Debian. SSH in and:

```bash
sudo apt update && sudo apt install -y postgresql nginx-light curl git
# Node 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Postgres

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE worklog LOGIN PASSWORD 'pick-a-strong-password';
CREATE DATABASE worklog OWNER worklog;
SQL
```

Connection string for `.env`:

```
DATABASE_URL=postgres://worklog:pick-a-strong-password@localhost:5432/worklog
```

The app creates its own tables (`users`, `entries`, `session`) on first boot via
`initSchema()` — no migration tool needed yet.

## 3. Deploy the app

```bash
sudo mkdir -p /opt/worklog && sudo chown "$USER" /opt/worklog
git clone <your-repo> /opt/worklog     # or rsync the folder
cd /opt/worklog
npm ci --omit=dev
```

Create `/opt/worklog/.env`:

```
DATABASE_URL=postgres://worklog:...@localhost:5432/worklog
SESSION_SECRET=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
NODE_ENV=production
PORT=3000
```

## 4. Run it as a service

`/etc/systemd/system/worklog.service`:

```ini
[Unit]
Description=Worklog
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=worklog-svc
WorkingDirectory=/opt/worklog
EnvironmentFile=/opt/worklog/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /usr/sbin/nologin worklog-svc
sudo chown -R worklog-svc /opt/worklog
sudo systemctl enable --now worklog
sudo systemctl status worklog
```

## 5. HTTPS + reverse proxy (Caddy — easiest)

`NODE_ENV=production` sets the `Secure` cookie flag, so the app **must** be
served over HTTPS or logins will silently fail.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
worklog.example.com {
    encode gzip
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl restart caddy
```

Caddy fetches and renews a Let's Encrypt cert automatically once the domain
points at your IP and ports 80/443 are reachable.

## 6. Exposing the box to the internet

1. **Domain**: buy one, or use a free dynamic-DNS hostname (DuckDNS, Cloudflare).
2. **Dynamic IP**: home IPs change. Run a DDNS updater (ddclient, or the
   provider's script) so the hostname tracks your IP.
3. **Router**: port-forward external `80` and `443` to the server's LAN IP.
   Give the server a static DHCP lease.
4. **Firewall** on the box:
   ```bash
   sudo ufw allow OpenSSH
   sudo ufw allow 80,443/tcp
   sudo ufw enable
   ```
5. If your ISP uses CGNAT (no real public IP), port-forwarding won't work —
   use a Cloudflare Tunnel or Tailscale Funnel instead of steps 3–4.

## 7. Backups

```bash
# /etc/cron.daily/worklog-backup
sudo -u postgres pg_dump worklog | gzip > /var/backups/worklog-$(date +\%F).sql.gz
find /var/backups -name 'worklog-*.sql.gz' -mtime +14 -delete
```

## 8. Updates

```bash
cd /opt/worklog && git pull && npm ci --omit=dev && sudo systemctl restart worklog
```

## Hardening checklist

- [ ] Postgres only listens on `localhost` (default; check `listen_addresses`).
- [ ] `.env` is `chmod 600` and owned by the service user.
- [ ] SSH: key-only auth, no root login.
- [ ] Unattended security upgrades (`sudo apt install unattended-upgrades`).
- [ ] Consider rate-limiting `/api/auth/*` (Caddy `rate_limit`, or add
      `express-rate-limit`) before sharing the URL widely.
