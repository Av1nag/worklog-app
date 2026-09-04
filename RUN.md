# Running Worklog manually (no systemd yet)

Use this until the systemd service ([DEPLOY.md](DEPLOY.md) §4) is set up.

## Foreground (for a quick test)

```bash
cd /opt/worklog
node server.js
```

Prints `Worklog running at http://localhost:3000`. Caddy will proxy
`https://worklog.tunitive.com` to it while this is running.

Test from another terminal (or your Mac):
```bash
curl -I https://worklog.tunitive.com
```

Dies as soon as you hit Ctrl+C or close the SSH session.

## Detached (survives disconnecting your SSH session)

```bash
cd /opt/worklog
nohup node server.js > /tmp/worklog.log 2>&1 &
disown
```

Check it's up:
```bash
curl -I http://localhost:3000
tail -f /tmp/worklog.log
```

Stop it:
```bash
pkill -f "node server.js"
```

## Limitations vs. the systemd service

- Does **not** survive a VM reboot.
- Does **not** auto-restart if the process crashes.
- Logs only go to `/tmp/worklog.log` (lost on reboot), not `journalctl`.

Set up the systemd service ([DEPLOY.md](DEPLOY.md) §4) to fix all three.
