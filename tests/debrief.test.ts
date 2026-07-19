import assert from "node:assert/strict";
import test from "node:test";
import { getRunBuild, getRunDebrief } from "../app/game/debrief.ts";
import { startRun } from "../app/game/engine.ts";

test("run build is based on installed modules and ties remain mixed", () => {
  const state = startRun(11, false);
  assert.equal(getRunBuild(state), "mixed");
  state.upgrades = ["reinforced-bit", "resonant-drill", "rail-coil"];
  assert.equal(getRunBuild(state), "extract");
  state.upgrades = ["reinforced-bit", "rail-coil"];
  assert.equal(getRunBuild(state), "mixed");
});
test("debrief reports recorded values without inventing a cause", () => {
  const state = startRun(12, false);
  state.ammo = 0;
  state.overloads = 3;
  state.circuitHeat = { extract: 22, fabricate: 91, defend: 40 };
  state.totalPulses = 20;
  state.validPulses = 11;
  state.extractCount = 10;
  state.fabricateCount = 4;
  state.defendCount = 2;
  state.lossCause = { enemyKind: "sapper", breachDamage: 2 };
  const lines = getRunDebrief(state, "en", 10);
  assert.ok(lines.some((line) => line.includes("AMMO AT END: 0")));
  assert.ok(lines.some((line) => line.includes("OVERLOADS: 3") && line.includes("FABRICATE 91")));
  assert.ok(lines.some((line) => line.includes("11/20 (55%)")));
  assert.ok(lines.some((line) => line.includes("EXTRACT 10") && line.includes("DEFEND 2")));
  assert.ok(lines.some((line) => line.includes("FINAL BREACH: SAPPER")));
  assert.equal(lines.some((line) => /because|caused|should|原因|ため/.test(line)), false);
});

test("debrief respects the requested observation limit and localization", () => {
  const state = startRun(13, false);
  state.ammo = 0;
  state.totalPulses = 10;
  state.validPulses = 4;
  assert.equal(getRunDebrief(state, "ja", 0).length, 0);
  const lines = getRunDebrief(state, "ja", 2);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /弾薬/);
  assert.match(lines[1], /有効送電/);
});
