# Concordia Biometric Bridge — Setup Guide

This little program connects the **fingerprint machine at the college gate** to
the Concordia dashboard website. When a student puts their finger on the sensor,
this program sees it and sends it to the website, where it shows up as
attendance within a second or two.

It runs on **any always-on computer on the college network** — a cheap laptop
left switched on, a mini-PC, or a Raspberry Pi. It does **not** need to be a
powerful machine, and it does **not** need any special internet setup (no port
forwarding, no fixed public IP). It only needs to be:

1. On the **same network/WiFi** as the fingerprint machine, and
2. Able to open normal websites (outgoing internet).

---

## What you need before starting

- The fingerprint machine powered on and plugged into the network (LAN cable).
  Its screen shows an IP address under **Menu → Comm. → Ethernet** — ours is
  `192.168.100.201`.
- The always-on computer, on the same network.
- The `BRIDGE_API_KEY` value (ask the developer — it is the shared password
  between this bridge and the website). The same value must be set in the
  website's Vercel environment variables under `BRIDGE_API_KEY`.

---

## One-time setup

### 1. Install Python

- **Windows:** download from <https://python.org/downloads> and during install
  **tick "Add Python to PATH"**.
- **Raspberry Pi / Linux:** Python is already installed.

### 2. Copy this folder onto the computer

Copy the whole `biometric` folder somewhere simple, e.g. `C:\concordia-bridge`
(Windows) or `/opt/concordia-bridge` (Linux).

### 3. Install the three helper libraries

Open a terminal **in that folder** and run:

```bash
pip install -r requirements.txt
```

### 4. Create your settings file

Copy `.env.example` to a new file named `.env`:

```bash
cp .env.example .env          # Windows:  copy .env.example .env
```

Open `.env` in Notepad and fill in:

| Setting          | What to put                                                        |
|------------------|--------------------------------------------------------------------|
| `DEVICE_IP`      | The IP on the fingerprint machine's screen (e.g. `192.168.100.201`) |
| `DEVICE_SERIAL`  | Already set to `A8N5232460400` — leave it                          |
| `API_BASE_URL`   | `https://www.concordiacollegecanalcampus.com` — leave it          |
| `BRIDGE_API_KEY` | Paste the shared key from the developer                            |
| `BACKFILL_SINCE` | **Your go-live date**, e.g. `2026-08-12` (see the warning below)   |

> ⚠️ **Do not remove `BACKFILL_SINCE`.** The device already holds ~2059 old
> records from testing. This date tells the bridge to ignore anything older, so
> those old punches don't get imported as fake attendance for past dates. Set it
> to the first day you want real attendance to count.

### 5. Test it

```bash
python bridge.py
```

You should see:

```
connected  firmware=Ver 6.60 ...  serial=A8N5232460400
listening for live punches
```

Now put a finger on the sensor — you should see a `punch  pin=...` line, and it
should appear on the website's **Admin → Biometric Attendance → Live Feed**
within a second or two.

Press `Ctrl+C` to stop the test.

---

## Keeping it running 24/7

You don't want to leave a terminal window open forever. Set it up as a
background **service** so it starts automatically and restarts itself if the
computer reboots or the network drops.

### Windows (using NSSM — "the Non-Sucking Service Manager")

1. Download NSSM from <https://nssm.cc/download> and unzip it.
2. Open **Command Prompt as Administrator** and run:

   ```cmd
   nssm install ConcordiaBridge
   ```

3. In the window that opens:
   - **Application → Path:** the full path to `python.exe`
     (find it by running `where python` in a normal terminal).
   - **Application → Startup directory:** the bridge folder,
     e.g. `C:\concordia-bridge`.
   - **Application → Arguments:** `bridge.py`
   - **I/O tab (optional):** set Output and Error to
     `C:\concordia-bridge\service.log` if you want an extra log.
   - Click **Install service**.

4. Start it:

   ```cmd
   nssm start ConcordiaBridge
   ```

   It will now start automatically every time Windows boots.

Useful commands: `nssm restart ConcordiaBridge`, `nssm stop ConcordiaBridge`,
`nssm remove ConcordiaBridge confirm`.

### Raspberry Pi / Linux (using systemd)

A ready-made unit file is included: `concordia-bridge.service`. Edit the three
paths inside it to match your folder, then:

```bash
sudo cp concordia-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now concordia-bridge
```

Watch the live log with:

```bash
journalctl -u concordia-bridge -f
```

---

## Everyday checks

- **Is it alive?** The website's **Admin → Biometric Attendance** page has a
  device card at the top. Green = the bridge sent a heartbeat in the last 3
  minutes. Red = the bridge is down; go check the computer.
- **A student's punches aren't showing?** Their PIN probably isn't linked to
  their name yet. The Live Feed shows unmapped punches in red with an
  **"Assign to student"** button — one click fixes it, and it back-fills their
  past punches automatically.
- **Logs:** everything is written to `bridge.log` in this folder (it rotates
  automatically at 2 MB, keeping the last 5 files, so it never fills the disk).

---

## How the pieces fit together

```
Fingerprint machine  ──LAN, port 4370──▶  bridge.py (this program, on-site)
                                              │
                                              │  HTTPS (outgoing only)
                                              ▼
                          https://www.concordiacollegecanalcampus.com/api/bridge/punches
                                              │
                                              ▼
                                    Turso database  ──▶  Dashboard + mobile app
```

The fingerprint machine is **never** exposed to the internet. The bridge only
makes **outgoing** requests, so no firewall holes or port forwarding are needed.
If the internet drops, the bridge saves punches locally (`queue.db`) and sends
them once it's back — nothing is lost.
