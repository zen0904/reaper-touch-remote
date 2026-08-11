import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../REAPER_Touch_Remote_Bridge.lua", import.meta.url), "utf8");

test("bridge has one authoritative open_fx command handler", () => {
  assert.equal((source.match(/action == "open_fx"/g) || []).length, 1);
});

test("bridge installs pre/post analyzer stages and returns both spectra", () => {
  assert.match(source, /slider2:0<0,1,1>Probe stage/);
  assert.match(source, /signal_stage_json\(slot,0\)/);
  assert.match(source, /signal_stage_json\(slot,1\)/);
  assert.match(source, /"input":/);
  assert.match(source, /"output":/);
});

test("bridge exposes REAPER-hosted preset recall and factory reset", () => {
  assert.match(source, /TrackFX_GetPresetIndex/);
  assert.match(source, /TrackFX_NavigatePresets/);
  assert.match(source, /TrackFX_SetPresetByIndex\(track,fx,-2\)/);
  assert.match(source, /"preset"/);
});

test("bridge controls the whole track FX chain without changing per-plug-in bypass", () => {
  assert.match(source, /action == "set_track_fx_bypass"/);
  assert.match(source, /SetMediaTrackInfo_Value\(track,"I_FXEN"/);
  assert.match(source, /"fxEnabled"/);
});
