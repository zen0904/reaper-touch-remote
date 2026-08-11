import test from "node:test";
import assert from "node:assert/strict";
import { adjacentRackTarget } from "../rack-navigation.js";

const tracks = [
  { id: "a", fx: [{ id: "a1" }, { id: "a2" }] },
  { id: "b", fx: [] },
  { id: "c", fx: [{ id: "c1" }, { id: "c2" }, { id: "c3" }] }
];

test("rack paging skips empty racks, wraps, and keeps the preferred FX slot", () => {
  assert.equal(adjacentRackTarget(tracks, "a", 1, 1).fx.id, "c2");
  assert.equal(adjacentRackTarget(tracks, "c", 1, 2).fx.id, "a2");
  assert.equal(adjacentRackTarget(tracks, "a", -1, 0).track.id, "c");
});

test("rack paging is unavailable without another populated rack", () => {
  assert.equal(adjacentRackTarget([{ id: "a", fx: [{ id: "a1" }] }], "a", 1), null);
});
