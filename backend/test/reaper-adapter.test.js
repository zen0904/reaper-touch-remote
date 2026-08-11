import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReaperAdapter } from "../src/reaper-adapter.js";

const sample = { project: { name: "Live" }, tracks: [] };

test("adapter reports live state and rejects commands after it becomes stale", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rtr-adapter-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "state.json"), JSON.stringify(sample));
  const adapter = new ReaperAdapter(directory, 10, { staleMs: 30 });
  adapter.poll();
  assert.equal(adapter.connected, true);
  await new Promise((resolve) => setTimeout(resolve, 40));
  adapter.poll();
  assert.equal(adapter.connected, false);
  assert.throws(() => adapter.command({ id: "1", action: "set_track_mute" }), /reaper_bridge_offline/);
});
