# REAPER Touch Remote

A local-first, live-use iPad control surface for REAPER on macOS. REAPER remains the source of truth and continues processing audio if the browser, Wi-Fi, Node server, or capture helper stops.

> Status: functional integration build. Automated Node tests and the native macOS build pass. Real REAPER, real plug-in, Screen Recording/Accessibility permission, and physical iPad multi-touch tests are still required before calling it production-ready.

## What works

- Real REAPER track order, names, volume, pan, mute, solo, selection, peak meters, FX order/names/enabled state via ReaScript—no mock tracks or fake meters.
- Authoritative full snapshots and incremental meter updates over WebSocket; reconnect always requests a new snapshot.
- Commands for track mute, solo, selection/name, FX insertion/bypass, plug-in parameters, and plug-in page open/close. Other connected clients see the resulting REAPER state.
- Independent Pointer Events ownership, capture, cancel, and lost-capture handling for simultaneous plug-in controls.
- iPad landscape console UI with explicit track banks, touch-sized controls, page lock, safe areas, wake lock, manual host profiles, and installable PWA metadata/cache.
- Bonjour/mDNS advertisement (`_reaper-touch._tcp`) and automatic reconnect to the last host.
- A resolution-independent iPad FX panel generated for every AU/VST/VST3/JSFX plug-in from real REAPER parameter names, formatted values, normalized values, switch metadata, and step sizes.
- SuperRack-style vertical channel racks with compact stacked plug-in slots, thin meters, MUTE/SOLO, and no oversized mixer faders.
- Search and add any installed REAPER plug-in directly from the iPad, and rename a rack/REAPER track from the rack header.
- Automatic semantic sections (bands/channels, dynamics, filter/EQ, modulation, time, tone, and I/O), touch-sized switches, native drop-down choices, rotary controls, and filtering of REAPER's synthetic MIDI host controls.
- One compact parameter page at a time instead of a long scrolling plug-in form, with coalesced animation-frame control writes for smoother touch.
- A direct-touch six-band graph for Waves F6, a real-time input FFT for the active plug-in, and truthful input/output activity meters for every exposed plug-in.
- A hybrid fallback for vendor-drawn/special plug-ins: tap **原生介面** to show and control only that plug-in's real REAPER window. It waits until the requested window appears and never falls back to the desktop or an unrelated window.

## Architecture

```text
REAPER (audio and analysis stay here)
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

The bridge runs on REAPER's UI/deferred-script loop. When an iPad plug-in page is open it automatically installs and enables the included transparent `RTR Spectrum Probe` JSFX immediately before that plug-in. The probe passes audio through unchanged and performs the FFT inside REAPER. It is removed from the chain when the page closes, the last remote disconnects, or the Bridge stops, so stale analyzer FX are not left in the project. The browser never receives audio—only 64 normalized spectrum bins and peak values. The OUT meter is REAPER's authoritative track output meter.

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

After updating the project, stop the old Bridge action and run the updated script once. On startup it refreshes `installed-fx.json` for the iPad plug-in browser and installs `RTR_Spectrum_Probe.jsfx` into REAPER's Effects directory automatically.

The bridge directory defaults to `~/Library/Application Support/REAPER/REAPER Touch Remote`. Override the Node side with `RTR_BRIDGE_DIR` only if REAPER uses a portable resource directory.

## Run on the Mac

```sh
./scripts/start.sh
```

This starts the web/state server and, when its binary has been built, the idle native-window helper. Open `http://MAC-IP:47830` on the iPad. The health endpoint is `http://localhost:47830/health`. The helper does not ask for or capture anything until **原生介面** is tapped. Disable it explicitly with `RTR_ENABLE_NATIVE_STREAM=0 ./scripts/start.sh`.

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

1. Start `./scripts/start.sh`, open a plug-in page on the iPad, then tap **原生介面**.
2. In **System Settings → Privacy & Security → Screen & System Audio Recording**, enable the Terminal/app launching `reaper-plugin-stream`.
3. In **Privacy & Security → Accessibility**, enable the same Terminal/app so CGEvent can control the plug-in.
4. Quit and restart the launcher after permission changes.
5. The requested FX is floated automatically. If it is not open yet, the iPad remains in waiting mode and connects as soon as that exact REAPER-owned window appears.
6. You should see only that plug-in window, never the desktop. Drag a control and verify the real plug-in reacts. Tap **參數模式** to return to the multi-touch adaptive UI.

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
- **ADD PLUGIN says the inventory is unavailable:** restart the updated Bridge ReaScript once; it builds the installed plug-in index at startup.
- **No spectrum yet:** play or monitor audio, open a plug-in from its blue rack slot, and confirm the updated Bridge is running. The input analyzer is active only while a plug-in page is open.
- **iPad cannot connect:** use the numeric Mac IP, allow incoming Node connections in the macOS firewall, and disable Wi-Fi AP/client isolation.
- **No plug-in video:** leave the iPad on the waiting screen, float/open the requested FX, grant Screen Recording, then restart if macOS requests it. The page reconnects automatically when the exact window appears. Some bridged or sandboxed plug-ins may own windows under a different bundle and need matcher work.
- **Video but no touch:** grant Accessibility and restart the helper.
- **Hotspot changed IP:** tap the red connection indicator, enter the new IP, and reconnect. State is fully reloaded.
- **PWA shows stale files:** remove/re-add the Home Screen app or clear Safari website data during development.

## Known limits / needs real-hardware validation

- Browser-only iPadOS cannot perform general Bonjour service browsing; advertised discovery is useful to native clients, while the PWA uses `.local`, remembered host, manual IP, and retry.
- Native plug-in fallback is deliberately single-pointer because most macOS plug-in GUIs are mouse-based; the primary adaptive parameter UI supports independent Pointer Events.
- Native fallback requires a title-matched, visible, REAPER-owned window and refuses arbitrary fallbacks. Bridged plug-ins, vendor helper processes, docked FX, and unusual window ownership need testing and may require per-vendor matching rules.
- MJPEG prioritizes compatibility and latency over bandwidth efficiency. A future VideoToolbox/WebRTC path would reduce bandwidth.
- Vendor-authored graphics and arbitrary custom layouts cannot be reconstructed from the REAPER parameter API; every exposed parameter remains controllable through the adaptive native iPad layout, with hand-tuned graph profiles available for important plug-ins such as Waves F6.
- Real REAPER bidirectional changes, project/track/FX mutations, Wi-Fi transitions, iPad PWA relaunch, and 2/3+ finger tests remain acceptance tests.

See [docs/ACCEPTANCE_TEST.md](docs/ACCEPTANCE_TEST.md) for the exact test sheet.
