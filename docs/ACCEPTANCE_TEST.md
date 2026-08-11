# Physical acceptance test

Record pass/fail, REAPER version, macOS/iPadOS versions, plug-in format/vendor, router, and observed latency.

## State and control

- Change mute, solo, selection, track name, FX bypass, knobs, switches, menus, and the F6 graph on iPad; verify REAPER and a second browser.
- Change each item in REAPER; verify both browsers without reload.
- Search for and add an installed FX from iPad; verify the exact plug-in appears at the end of the chosen REAPER track.
- Rename/add/delete/reorder tracks and add/delete/reorder FX in REAPER; verify automatic topology updates.
- Open another project; verify a full replacement snapshot.

## Multi-touch

- Finger 1/2 move two plug-in knobs, then move two F6 band nodes independently.
- Hold MUTE with one hand while toggling another track's SOLO or FX bypass.
- Confirm no page scroll, zoom, text selection, callout, bounce, stuck pointer, or cross-controlled parameter after release/cancel.

## Adaptive plug-in UI and analyzer

- At 1024×768 landscape, open F6 and several high-parameter-count plug-ins; confirm only the active semantic group is shown and the plug-in page itself does not scroll.
- Verify the active input spectrum responds to a sine sweep and silence, and the IN/OUT activity meters follow real signal rather than decorative animation.
- Move the analyzer between plug-ins on the same rack and verify the chosen plug-in remains selected despite internal FX index changes.

## Recovery/network

- Toggle iPad Wi-Fi, reload/kill/relaunch PWA, restart Node, then change LAN/IP.
- Confirm audio never glitches or stops and every recovery shows a fresh REAPER snapshot.

## Special plug-in native fallback

- Mixer → FX → **原生介面** → real floating native GUI → drag knob/fader → **參數模式** → Previous/Next rack → Bypass → Back.
- Enter native mode before opening the matching REAPER FX window; confirm the iPad keeps waiting and automatically connects immediately after the window appears.
- Test AU, VST3, resized/Retina windows, analyzer/meter legibility, portrait/landscape transition, and at least two vendor UIs.
- Confirm no desktop, Dock, Finder, or unrelated window is ever streamed.
