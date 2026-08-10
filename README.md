# REAPER Touch Remote

A local-first, live-use iPad control surface for REAPER on macOS. REAPER remains the source of truth and continues processing audio if the browser, Wi-Fi, Node server, or capture helper stops.

> Status: functional integration build. Automated Node tests and the native macOS build pass. Real REAPER, real plug-in, Screen Recording/Accessibility permission, and physical iPad multi-touch tests are still required before calling it production-ready.

## What works

- Real REAPER track order, names, volume, pan, mute, solo, selection, peak meters, FX order/names/enabled state via ReaScript—no mock tracks or fake meters.
- Authoritative full snapshots and incremental meter updates over WebSocket; reconnect always requests a new snapshot.
- Commands for fader, pan, mute, solo, selection, FX bypass, and FX window open/close. Other connected clients see the resulting REAPER state.
- Independent Pointer Events ownership, capture, cancel, and lost-capture handling for simultaneous faders.
- Two-finger double-tap reset: faders return to 0.0 dB and pan controls return to center.
- iPad landscape console UI with explicit track banks, touch-sized controls, page lock, safe areas, wake lock, manual host profiles, and installable PWA metadata/cache.
- Bonjour/mDNS advertisement (`_reaper-touch._tcp`) and automatic reconnect to the last host.
- A resolution-independent iPad FX panel generated from real REAPER parameter names, formatted values, and normalized values.
- An optional Swift ScreenCaptureKit helper remains available for compatibility experiments, but is no longer the primary Plugin UI.

## Architecture

```text
REAPER (audio is only here)
   ↕ official ReaScript API
REAPER_Touch_Remote_Bridge.lua
   ↕ atomic state file + append-only command queue
State Manager / WebSocket Server
   ↕ full snapshots + incremental updates
iPad PWA
```

```text
REAPER FX parameters ↔ ReaScript normalized values ↔ large iPad-native controls
```

The bridge runs on REAPER's UI/deferred-script loop and never inserts itself in the audio signal path.

## Requirements

- macOS 13 or newer (ScreenCaptureKit)
- REAPER with ReaScript enabled
- Node.js 20 or newer
- Xcode Command Line Tools / Swift 6 for native plug-in streaming
- Mac and iPad on the same trusted LAN; client isolation disabled

## Install and build

```sh
git clone REPOSITORY_URL
cd reaper-touch-remote
npm install
npm run build:native
```

### REAPER setup

1. In REAPER, open **Actions → Show action list…**.
2. Choose **New action… → Load ReaScript…** and select `reaper/REAPER_Touch_Remote_Bridge.lua`.
3. Select **REAPER Touch Remote Bridge** and press **Run**. Leave it running; stopping/closing REAPER removes its state file.
4. Optional: assign the script to a toolbar button or startup action.

The bridge directory defaults to `~/Library/Application Support/REAPER/REAPER Touch Remote`. Override the Node side with `RTR_BRIDGE_DIR` only if REAPER uses a portable resource directory.

## Run on the Mac

```sh
./scripts/start.sh
```

This starts the web/state server. Open `http://MAC-IP:47830` on the iPad. The health endpoint is `http://localhost:47830/health`. Native window streaming is optional and can be enabled with `RTR_ENABLE_NATIVE_STREAM=1 ./scripts/start.sh`.

The server advertises `_reaper-touch._tcp` with Bonjour. Safari web pages cannot enumerate arbitrary mDNS service records, so a first URL must be entered once. Prefer the Mac's stable Bonjour name (`http://your-mac-name.local:47830`) or the manual IP screen. The PWA remembers it and rediscovers connectivity by retrying; native service browsing would require a signed iPad app.

## iPad / Add to Home Screen

1. Join the same LAN as the Mac and open the URL in Safari.
2. Tap **Share → Add to Home Screen → Add**.
3. Launch **REAPER Remote** from the Home Screen in landscape.
4. Tap the connection indicator to change host/port after moving between HOME, HOTSPOT, or SHOW LAN.
5. Tap **KEEP AWAKE** once per session if desired.

The control surface disables selection, callouts, context menus, accidental zoom, pull-to-refresh, overscroll, and page movement. Settings inputs retain normal editing.

## macOS permissions for native plug-in control

The first native-stream test requires manual system authorization:

1. Open an FX floating window in REAPER once, then start `./scripts/start.sh`.
2. In **System Settings → Privacy & Security → Screen & System Audio Recording**, enable the Terminal/app launching `reaper-plugin-stream`.
3. In **Privacy & Security → Accessibility**, enable the same Terminal/app so CGEvent can control the plug-in.
4. Quit and restart the launcher after permission changes.
5. Tap an FX slot. You should see only that plug-in window, never the desktop. Drag a control and verify the real plug-in reacts.

The helper intentionally accepts connections only on loopback; the Node server proxies it to the LAN.

## Protocol and reliability

Clients receive `hello`, then a full `snapshot`. Structural/project state changes generate authoritative snapshots; 25 FPS meter-only messages use `state_update`. Commands receive a `queued` acknowledgement, but controls reconcile from the next state read from REAPER rather than treating the acknowledgement as applied state. Heartbeats provide latency and detect disconnects. Reload, reconnect, server restart, and sequence uncertainty use full resync.

## Development and tests

```sh
npm run dev
npm test
npm run build:native
npm run check
```

Automated tests cover snapshot/update classification. CI tests Node on Linux and compiles the ScreenCaptureKit helper on macOS. Physical touch behavior and proprietary plug-in compatibility cannot be emulated by CI.

## Troubleshooting

- **Waiting for REAPER:** confirm the ReaScript is running and the bridge paths printed by Node and returned by `reaper.GetResourcePath()` match.
- **iPad cannot connect:** use the numeric Mac IP, allow incoming Node connections in the macOS firewall, and disable Wi-Fi AP/client isolation.
- **No plug-in video:** float/open the requested FX, grant Screen Recording, then restart. Some bridged or sandboxed plug-ins may own windows under a different bundle and need matcher work.
- **Video but no touch:** grant Accessibility and restart the helper.
- **Hotspot changed IP:** tap the red connection indicator, enter the new IP, and reconnect. State is fully reloaded.
- **PWA shows stale files:** remove/re-add the Home Screen app or clear Safari website data during development.

## Known limits / needs real-hardware validation

- Browser-only iPadOS cannot perform general Bonjour service browsing; advertised discovery is useful to native clients, while the PWA uses `.local`, remembered host, manual IP, and retry.
- Native plug-in interaction is deliberately single-pointer because most macOS plug-in GUIs are mouse-based.
- FX window matching currently chooses the smallest visible REAPER-owned non-empty window. Bridged plug-ins, vendor helper processes, docked FX, and unusual window ownership need testing and likely per-vendor matching improvements.
- MJPEG prioritizes compatibility and latency over bandwidth efficiency. A future VideoToolbox/WebRTC path would reduce bandwidth.
- FX wet/dry, parameter metadata/values, and presets are not implemented.
- Real REAPER bidirectional changes, project/track/FX mutations, Wi-Fi transitions, iPad PWA relaunch, and 2/3+ finger tests remain acceptance tests.

See [docs/ACCEPTANCE_TEST.md](docs/ACCEPTANCE_TEST.md) for the exact test sheet.
