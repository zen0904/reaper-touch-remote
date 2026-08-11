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
