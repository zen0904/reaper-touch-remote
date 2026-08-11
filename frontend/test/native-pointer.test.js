import test from "node:test";
import assert from "node:assert/strict";
import { containedImagePoint } from "../native-pointer.js";

test("maps a point inside a fitted image", () => {
  const point = containedImagePoint(500, 250, {left:0, top:0, width:1000, height:500}, 1600, 800);
  assert.deepEqual(point, {x:0.5, y:0.5});
});

test("ignores letterbox bars instead of clicking outside the plug-in", () => {
  const rect = {left:100, top:50, width:800, height:600};
  assert.equal(containedImagePoint(500, 75, rect, 1600, 800), null);
  assert.deepEqual(containedImagePoint(100, 150, rect, 1600, 800), {x:0, y:0});
});

test("ignores invalid or unloaded images", () => {
  assert.equal(containedImagePoint(0, 0, {left:0, top:0, width:10, height:10}, 0, 10), null);
});
