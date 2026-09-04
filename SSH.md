# Connecting to the VM over SSH

## The basics

```bash
ssh ubuntu@<VM_IP>
```

- User is always `ubuntu` (the default user on Oracle's Ubuntu images).
- Auth is key-based only — no passwords. Your Mac's key
  (`~/.ssh/id_ed25519` / `.pub`) must be on the VM's
  `/home/ubuntu/.ssh/authorized_keys` for this to work. It's added there
  automatically if you pasted that public key when creating the instance.
- If the IP changes (new instance, reserved IP swapped, etc.), update it
  here.

## How key auth actually works

The VM holds your **public** key. You connect from whichever machine holds
the matching **private** key — the private key never leaves your machine.
This means:
- SSH-ing from a *different* computer (a work laptop, Oracle Cloud Shell,
  etc.) will fail with `Permission denied (publickey)` unless that
  machine's key was also added to the VM.
- To allow another machine, add its `.pub` key content to
  `/home/ubuntu/.ssh/authorized_keys` on the VM (append, one key per line).

## Known issue: some networks block outbound port 22

We hit this directly — SSH from a Mac on a particular Wi-Fi network just
hung and timed out (`Operation timed out`), while the exact same command
worked fine over a phone hotspot. This is a network/ISP-level filter, not a
problem with the VM.

**Diagnose it:**
```bash
nc -vz -G 5 <VM_IP> 22   # times out?
nc -vz -G 5 8.8.8.8 22           # also times out?
nc -vz -G 5 8.8.8.8 443          # succeeds?
```
If the last one succeeds but the first two time out, port 22 is being
blocked outbound on that network specifically — not a VM or DNS problem.

**Fix:** switch networks (phone hotspot, different Wi-Fi) — confirms the
diagnosis and unblocks you immediately.

## Convenience alias

Add to `~/.zshrc` on your Mac:

```bash
alias worklog-ssh='ssh ubuntu@<VM_IP>'
```

Then just run `worklog-ssh` from anywhere.

## Troubleshooting reference

| Symptom | Likely cause |
|---|---|
| `Permission denied (publickey)` | Connecting from a machine whose key isn't in `authorized_keys` on the VM |
| `Operation timed out` (immediate) | Network blocking outbound port 22 — see diagnosis above |
| Hangs with no response at all | Same as above, or a Security List / VM iptables rule blocking inbound 22 |
| Works from one machine, not another | Confirms it's either the key (see above) or that machine's network filtering the port |

If none of the above and you're fully locked out (wrong key, VM
misconfigured), see the OCI **Run Command** or **Console connection**
features under the instance page — both let you run commands or get a
console session without SSH.
