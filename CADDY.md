# Caddy

## What it is

Caddy is a web server that sits in front of the Node app (a **reverse proxy**).
Browsers talk to Caddy on ports 80/443; Caddy forwards those requests to
Node, which only listens on `localhost:3000`.

## Why we use it here

1. **HTTPS, automatically.** Caddy requests, installs, and renews a free
   Let's Encrypt certificate for the domain on its own — no manual cert
   files, no renewal cron job. This is the main reason it's here:
   [server.js](server.js) sets the session cookie to `Secure` in production
   ([server.js:31](server.js#L31)), which means login silently breaks
   without valid HTTPS in front of it.
2. **Port 3000 stays private.** Node never has to bind to 80/443 (which
   would require running it as root). Caddy owns those ports and proxies
   internally.
3. **One config file.** Compare to nginx + certbot, which is two tools and
   more config to get the same result.

## Our config

`/etc/caddy/Caddyfile` on the server:

```
worklog.tunitive.com {
    encode gzip
    reverse_proxy localhost:3000
}
```

- `worklog.tunitive.com` — the domain Caddy listens for and gets a
  certificate for. Must match the DNS A record pointed at the VM's public IP.
- `encode gzip` — compresses responses.
- `reverse_proxy localhost:3000` — forwards everything to the Node app.

Requests to plain `http://` are auto-redirected to `https://` by default.

## Common commands

```bash
# check it's running
sudo systemctl status caddy --no-pager

# apply a Caddyfile change
sudo systemctl restart caddy

# reload without dropping connections (preferred over restart when possible)
sudo systemctl reload caddy

# tail logs live
sudo journalctl -u caddy -f

# validate the Caddyfile before restarting
sudo caddy validate --config /etc/caddy/Caddyfile
```

## Troubleshooting

- **`curl` from outside times out** → check the VM's `iptables` and the OCI
  Security List both allow inbound TCP 80 and 443. Order matters in
  `iptables`: an ACCEPT rule after a REJECT rule never gets reached
  (`sudo iptables -L INPUT -n --line-numbers` to check order).
- **TLS handshake fails / no valid cert** → check
  `sudo journalctl -u caddy -n 100 --no-pager` for ACME `challenge failed`
  errors. Usually means port 80/443 wasn't reachable from the internet yet
  when Caddy tried to get the certificate — fix reachability, then
  `sudo systemctl restart caddy` to retry.
- **502 Bad Gateway** → Caddy is fine, but nothing is listening on
  `localhost:3000`. Means the Node app isn't running — see
  [RUN.md](RUN.md) or start the systemd service ([DEPLOY.md](DEPLOY.md) §4).
