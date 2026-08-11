import test from "node:test";
import assert from "node:assert/strict";
import { pluginProfile, profileParameter } from "../plugin-profiles.js";

test("known Waves processors select distinct dedicated renderers", () => {
  assert.equal(pluginProfile("VST3: F6-RTA Stereo (Waves)").renderer, "direct-eq");
  assert.equal(pluginProfile("VST3: CLA-2A Stereo (Waves)").renderer, "optical-compressor");
});

test("unknown plug-ins adapt from their exposed parameter vocabulary", () => {
  assert.equal(pluginProfile("Mystery", [{ name: "Decay" }, { name: "Diffusion" }]).family, "space");
  assert.equal(pluginProfile("Mystery", [{ name: "Feedback" }, { name: "Delay Time" }]).family, "delay");
  assert.equal(pluginProfile("Mystery", [{ name: "Stereo Width" }, { name: "Balance" }]).family, "imaging");
});

test("mixed EQ and dynamics processors become channel strips", () => {
  const parameters = [
    { name: "Low Frequency" }, { name: "High Shelf" },
    { name: "Threshold" }, { name: "Ratio" }, { name: "Drive" }
  ];
  assert.equal(pluginProfile("Console Processor", parameters).family, "channel-strip");
});

test("banded equalizers get direct manipulation even without a known model", () => {
  const profile = pluginProfile("Custom EQ", [{ name: "Band 1 Frequency" }, { name: "Band 1 Gain" }]);
  assert.equal(profile.renderer, "direct-eq");
});

test("profile parameter lookup tolerates vendor separators", () => {
  const params = [{ name: "Hi Freq", index: 4 }, { name: "Peak-Reduction", index: 2 }];
  assert.equal(profileParameter(params, "HiFreq")?.index, 4);
  assert.equal(profileParameter(params, "Peak Reduction")?.index, 2);
});
