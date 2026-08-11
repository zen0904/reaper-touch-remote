import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const finalRackRule = source.slice(source.lastIndexOf("/* Eight balanced plug-in slots"));

test("eight-track rack resets legacy horizontal grid sizing", () => {
  assert.match(finalRackRule, /grid-auto-flow:row/);
  assert.match(finalRackRule, /grid-auto-columns:auto/);
  assert.match(finalRackRule, /grid-template-columns:minmax\(0,1fr\)/);
});

test("per-plug-in bypass keeps a non-shrinking touch target", () => {
  assert.match(finalRackRule, /\.fx \.bypass\{[^}]*min-width:37px/);
  assert.match(finalRackRule, /\.fx>span\{min-width:0/);
});
