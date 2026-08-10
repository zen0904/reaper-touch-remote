# REAPER bridge

`REAPER_Touch_Remote_Bridge.lua` is the authoritative, dependency-free ReaScript adapter. It reads real REAPER project, track, meter, and FX state every 40 ms and applies commands through official ReaScript APIs. The bridge uses atomic state-file replacement and an append-only command queue in REAPER's resource directory.

The script does not process audio, insert an FX, or run on REAPER's audio thread.
