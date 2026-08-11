import test from "node:test";
import assert from "node:assert/strict";
import { pluginPresentation } from "../plugin-presentation.js";

test("adaptive presentation recognizes common plug-in families from names and parameters", () => {
  assert.equal(pluginPresentation("Valhalla VintageVerb").kind, "space");
  assert.equal(pluginPresentation("Unknown", [{ name: "Threshold" }, { name: "Ratio" }]).kind, "dynamics");
  assert.equal(pluginPresentation("SuperTap Delay").label, "DLY");
  assert.equal(pluginPresentation("F6", [{ name: "Band 1 Freq" }]).kind, "equalizer");
  assert.equal(pluginPresentation("Mystery Processor").kind, "processor");
});
