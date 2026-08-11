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

test("a second touch cancels rotary control and scrolls the parameter page", () => {
  assert.match(source, /addEventListener\("touchstart"/);
  assert.match(source, /addEventListener\("touchmove"/);
  assert.match(source, /event\.touches\.length<2/);
  assert.match(source, /for\(const rotary of activeParameterRotaries\.values\(\)\)rotary\.cancel\(\)/);
  assert.match(source, /els\.panel\.scrollTop=parameterTouchScroll\.originScrollTop/);
  assert.match(source, /兩指捲動參數頁 · 單指調整旋鈕/);
  assert.match(source, /parameterTouchScrollBlocked/);
});
