# Crab Host

Host Minecraft servers from your own PC. Crab Host is a desktop app (Windows `.exe`, also macOS and Linux) that downloads everything a server needs — the server software, the right Java, and a tunnel so friends can join — and gives you a clean dashboard to run it, in dark or light mode.

## Features

- **Six server types:** Paper, Purpur, Vanilla, Fabric, Forge and NeoForge, with a version picker that always lists what's currently available.
- **Automatic Java:** detects the Java versions on your PC and, when a server needs one you don't have, offers a one-click install of Eclipse Temurin into Crab Host's own folder (no admin rights, no changes to other apps).
- **Dashboard:** start/stop/restart, uptime, live RAM and CPU graphs, TPS, and who's online (with Op/Kick).
- **Console:** colour-coded log with filters and search, command box with suggestions (Tab) and history (↑/↓).
- **Files:** browse, upload, rename, zip/unzip and edit server files in a code editor (Monaco) that checks YAML and JSON as you type and refuses to save broken files.
- **Plugins & mods:** search and install from Modrinth, Hangar and SpigotMC with dependencies, toggle on/off, check for updates.
- **Server settings:** a friendly `server.properties` form with a live MOTD preview, memory slider, Java choice, optimized JVM flags, crash auto-restart and a daily restart time.
- **How friends join:** shows your LAN address, opens your router's port with UPnP and tests that it's reachable, adds a Windows Firewall rule, and runs a [playit.gg](https://playit.gg) tunnel for an address that works without router setup.
- **Backups:** on demand or on a schedule (the world is flushed to disk first), with one-click restore.
- **Downloads & Java:** one place to see and manage Java runtimes, the playit agent and the download cache. Every file with a published checksum is verified.

## Getting the app

Each push builds a Windows installer (`CrabHost-Setup-x.y.z.exe`) and a portable `.exe` in GitHub Actions — open the latest **Build** run and download the **CrabHost-Windows** artifact. Pushing a tag like `v0.1.0` publishes them to a GitHub Release, which the app's auto-updater uses.

The builds are not code-signed, so Windows SmartScreen will warn on first launch (More info → Run anyway).

## Development

Requires Node.js 22+. A JDK (21+) is only needed for the end-to-end test.

```bash
npm install
npm run dev          # run the app with hot reload
npm run web          # run just the UI in a browser with a mock backend (http://localhost:5199)
npm test             # unit + server-lifecycle tests (Vitest)
npm run typecheck
npm run e2e          # build, then drive the real Electron app against a fake Java server
npm run build:win    # build the Windows installer (best run on Windows)
```

On Linux without a display, run the e2e test as `xvfb-run -a node e2e/app.e2e.mjs`.

Set `CRABHOST_DATA_DIR` to keep all app data (settings, Java runtimes, tools, cache) in a specific folder.

## How it's built

| Part | Where |
| --- | --- |
| Electron main process (all real work) | `src/main` |
| Server install/start/stop, console, RCON stats, crash restarts | `src/main/core/servers` |
| Server software downloads (PaperMC Fill API, Purpur, Mojang, Fabric meta, Forge/NeoForge Maven + headless installer) | `src/main/core/servers/providers` |
| Java detection and Temurin install (Adoptium API) | `src/main/core/java` |
| Plugin/mod metadata, Modrinth/Hangar/Spiget | `src/main/core/plugins` |
| UPnP (SSDP + IGD SOAP), public IP, reachability, firewall | `src/main/core/network` |
| playit.gg agent | `src/main/core/tunnels` |
| Typed IPC contract shared by both sides | `src/shared/api.ts` |
| React UI (Tailwind, Zustand, Monaco) | `src/renderer` |

The renderer is sandboxed with context isolation and talks to the main process only through the typed bridge in `src/preload`. File operations are confined to each server's folder.

Servers live in `Documents/Crab Host Servers/<name>` by default; each folder holds a `crabhost.json` with its settings, so it can be moved or re-imported.

## Known limitations

- **playit.gg:** linking an account and creating the tunnel happen on playit.gg's website; Crab Host runs the agent and picks up the address from its output. If the address isn't detected, paste it into the Network screen.
- **UPnP** only works when the router has it enabled, and can't help if your internet provider uses CGNAT — the playit tunnel covers that case.
- **Cloudflare Tunnel** isn't offered: Minecraft Java uses raw TCP, so every player would need to run `cloudflared` themselves.
