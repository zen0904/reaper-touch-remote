import test from "node:test";
import assert from "node:assert/strict";
import { eqPointerValue, rotaryDragValue } from "../control-physics.js";

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
