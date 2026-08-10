import test from "node:test";
import assert from "node:assert/strict";
import { StateManager } from "../src/state-manager.js";

const sample = (meter = [-20, -18]) => ({ project: { name: "Live" }, tracks: [{ id: "{A}", name: "Vocal", volume: 1, pan: 0, mute: false, solo: false, selected: true, meter, fx: [] }] });

test("first state is a snapshot and meter-only changes are incremental", () => {
  const manager = new StateManager();
  let snapshots = 0; let updates = 0;
  manager.on("snapshot", () => snapshots++); manager.on("update", () => updates++);
  assert.equal(manager.ingest(sample()), true);
  assert.equal(manager.ingest(sample([-10, -9])), true);
  assert.equal(snapshots, 1); assert.equal(updates, 1); assert.equal(manager.snapshot.seq, 2);
});

test("structural changes produce authoritative snapshot", () => {
  const manager = new StateManager(); let snapshots = 0;
  manager.on("snapshot", () => snapshots++);
  manager.ingest(sample()); const changed = sample(); changed.tracks[0].mute = true; manager.ingest(changed);
  assert.equal(snapshots, 2);
});

test("bridge clock changes do not rebuild the control surface", () => {
  const manager = new StateManager(); let snapshots = 0; let updates = 0;
  manager.on("snapshot", () => snapshots++); manager.on("update", () => updates++);
  manager.ingest({ ...sample(), timestamp: 1 });
  manager.ingest({ ...sample([-15, -14]), timestamp: 2 });
  assert.equal(snapshots, 1); assert.equal(updates, 1);
});
