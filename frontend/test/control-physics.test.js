import test from "node:test";
import assert from "node:assert/strict";
import { dynamicBandGainDb, eqPinchQValue, eqPointerValue, rotaryDragValue, smoothSpectrumFrame, spectrumTransferDb } from "../control-physics.js";

test("rotary drag keeps small touch movements precise and accelerates long throws", () => {
  assert.ok(rotaryDragValue(0.5, 10, "touch") < 0.52);
  assert.ok(rotaryDragValue(0.5, 100, "touch") > 0.7);
  assert.equal(rotaryDragValue(0.95, 300, "touch"), 1);
  assert.equal(rotaryDragValue(0.05, -300, "touch"), 0);
});

test("EQ mapping uses the full enlarged surface and clamps outside touches", () => {
  const geometry = { width: 1000, height: 280, insetX: 28, insetY: 24 };
  const rect = { left: 10, top: 20, width: 1000, height: 280 };
  const middle = eqPointerValue(510, 160, rect, geometry);
  assert.equal(middle.frequency, 0.5);
  assert.equal(middle.gain, 0.5);
  assert.deepEqual(eqPointerValue(-100, -100, rect, geometry), { x: 28, y: 24, frequency: 0, gain: 1 });
});

test("EQ pinch widens on spread and narrows on pinch", () => {
  assert.ok(eqPinchQValue(0.5, 100, 180) < 0.5);
  assert.ok(eqPinchQValue(0.5, 100, 55) > 0.5);
  assert.equal(eqPinchQValue(0.95, 100, 5), 1);
  assert.equal(eqPinchQValue(0.05, 100, 500), 0);
});

test("spectrum smoothing attacks faster than it releases", () => {
  const [attack, release] = smoothSpectrumFrame([0.2, 0.8], [1, 0]);
  assert.ok(Math.abs(attack - 0.664) < 1e-9);
  assert.ok(Math.abs(release - 0.64) < 1e-9);
});

test("pre/post spectra expose truthful transfer and dynamic compression", () => {
  const input = [0.7, 0.8, 0.7]; const output = [0.63, 0.73, 0.63];
  assert.ok(Math.abs(spectrumTransferDb(input, output, 1) + 7) < 0.001);
  assert.ok(Math.abs(dynamicBandGainDb(input, output, 1, -2, -6) + 5) < 0.001);
});

test("dynamic activity stays idle without signal or configured range", () => {
  assert.equal(dynamicBandGainDb([0.05], [0.01], 0, 0, -12), 0);
  assert.equal(dynamicBandGainDb([0.8], [0.7], 0, 0, 0), 0);
});
