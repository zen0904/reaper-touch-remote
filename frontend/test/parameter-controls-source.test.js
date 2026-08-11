import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("rotaries capture touch from the whole parameter card", () => {
  assert.match(source, /control\.onpointerdown=event=>/);
  assert.match(source, /control\.setPointerCapture\(event\.pointerId\)/);
  assert.doesNotMatch(source, /knob\.onpointerdown=event=>/);
});

test("Threshold tells the user when zero Range prevents dynamics", () => {
  assert.match(source, /THRESHOLD 可調 · RANGE 0 dB，DYN 尚未作動/);
  assert.match(source, /THRESHOLD · 向下拉降低，向上拉提高/);
});
