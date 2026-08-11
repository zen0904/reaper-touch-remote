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

test("live control changes use a lightweight update", () => {
  const manager = new StateManager(); let snapshots = 0; let update;
  manager.on("snapshot", () => snapshots++); manager.on("update", (value) => { update = value; });
  manager.ingest(sample()); const changed = sample(); changed.tracks[0].mute = true; manager.ingest(changed);
  assert.equal(snapshots, 1); assert.deepEqual(update.changes.tracks, [{ id: "{A}", mute: true }]);
});

test("track and plug-in topology changes still produce authoritative snapshots", () => {
  const manager = new StateManager(); let snapshots = 0;
  manager.on("snapshot", () => snapshots++);
  manager.ingest(sample()); const changed = sample(); changed.tracks[0].fx.push({ id: "fx-1", index: 0, name: "EQ", enabled: true }); manager.ingest(changed);
  assert.equal(snapshots, 2);
});

test("moving a plug-in parameter emits only the changed parameter", () => {
  const manager = new StateManager(); let update;
  manager.on("update", (value) => { update = value; });
  const first = { ...sample(), selectedFx: { trackId: "{A}", fxIndex: 0, id: "fx-1", name: "EQ", parameters: [{ index: 0, name: "Gain", value: 0.5, formatted: "0 dB", step: 0 }] } };
  manager.ingest(first);
  manager.ingest({ ...first, selectedFx: { ...first.selectedFx, parameters: [{ ...first.selectedFx.parameters[0], value: 0.51, formatted: "0.2 dB" }] } });
  assert.deepEqual(update.changes.selectedFx.parameters, [{ index: 0, value: 0.51, formatted: "0.2 dB" }]);
});

test("bridge clock changes do not rebuild the control surface", () => {
  const manager = new StateManager(); let snapshots = 0; let updates = 0;
  manager.on("snapshot", () => snapshots++); manager.on("update", () => updates++);
  manager.ingest({ ...sample(), timestamp: 1 });
  manager.ingest({ ...sample([-15, -14]), timestamp: 2 });
  assert.equal(snapshots, 1); assert.equal(updates, 1);
});

test("real-time spectrum changes stay on the lightweight update path", () => {
  const manager = new StateManager(); let snapshots = 0; let updates = 0; let latest;
  manager.on("snapshot", () => snapshots++); manager.on("update", (update) => { updates++; latest = update; });
  manager.ingest({ ...sample(), tracks: [{ ...sample().tracks[0], signal: { seq: 1, left: 0.2, right: 0.3, spectrum: [0.1, 0.2], input: { spectrum: [0.1, 0.2] }, output: { spectrum: [0.08, 0.15] } } }] });
  manager.ingest({ ...sample(), tracks: [{ ...sample().tracks[0], meter: [-12, -11], signal: { seq: 2, left: 0.6, right: 0.5, spectrum: [0.4, 0.8], input: { spectrum: [0.4, 0.8] }, output: { spectrum: [0.3, 0.65] } } }] });
  assert.equal(snapshots, 1); assert.equal(updates, 1); assert.deepEqual(latest.changes.meters[0].signal.input.spectrum, [0.4, 0.8]); assert.deepEqual(latest.changes.meters[0].signal.output.spectrum, [0.3, 0.65]);
});
