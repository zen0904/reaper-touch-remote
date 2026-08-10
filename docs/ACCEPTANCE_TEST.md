# Physical acceptance test

Record pass/fail, REAPER version, macOS/iPadOS versions, plug-in format/vendor, router, and observed latency.

## State and control

- Change volume, pan, mute, solo, selection, and FX bypass on iPad; verify REAPER and a second browser.
- Change each item in REAPER; verify both browsers without reload.
- Rename/add/delete/reorder tracks and add/delete/reorder FX; verify automatic topology updates.
- Open another project; verify a full replacement snapshot.

## Multi-touch

- Finger 1/2 move two faders, then fingers 1/2/3 move three faders.
- Hold Mute with one hand while moving a different fader.
- Confirm no scroll, zoom, text selection, callout, bounce, stuck pointer, or cross-controlled fader after release/cancel.

## Recovery/network

- Toggle iPad Wi-Fi, reload/kill/relaunch PWA, restart Node, then change LAN/IP.
- Confirm audio never glitches or stops and every recovery shows a fresh REAPER snapshot.

## Native plug-in

- Mixer → FX → real floating native GUI → drag knob/fader → Previous/Next FX → Bypass → Back.
- Test AU, VST3, resized/Retina windows, analyzer/meter legibility, portrait/landscape transition, and at least two vendor UIs.
- Confirm no desktop, Dock, Finder, or unrelated window is ever streamed.
