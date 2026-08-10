# REAPER bridge

`REAPER_Touch_Remote_Bridge.lua` is the authoritative, dependency-free ReaScript adapter. It reads real REAPER project, track, meter, FX, parameter, and analyzer state every 40 ms and applies commands through official ReaScript APIs. The bridge uses atomic state-file replacement and an append-only command queue in REAPER's resource directory.

At startup the script inventories installed effects for the iPad ADD PLUGIN browser and installs the included `RTR_Spectrum_Probe.jsfx` in REAPER's Effects directory. While a remote plug-in page is open, that transparent pass-through JSFX is positioned immediately before the selected effect to calculate its real input FFT and peaks. It is removed when the page closes or the Bridge stops; no audio leaves REAPER.
