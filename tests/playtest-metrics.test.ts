import assert from "node:assert/strict";
import test from "node:test";
import { RunEvidenceTracker } from "../app/game/playtest-metrics.ts";
import { startRun } from "../app/game/engine.ts";

function trackerHarness(options: Partial<ConstructorParameters<typeof RunEvidenceTracker>[0]> = {}) {
  let now = 1_000;
  const events: Array<{ name: string; properties: Record<string, string | number | boolean> }> = [];
  const tracker = new RunEvidenceTracker({
    source: "start",
    runOrdinal: 1,
    guided: true,
    now: () => now,
    emit: (name, properties) => events.push({ name, properties }),
    ...options,
  });
  return { tracker, events, pass: (milliseconds: number) => { now += milliseconds; } };
}

test("active time includes tutorial waiting but excludes caller-marked hidden or paused time", () => {
  const state = startRun(21, true);
  const { tracker, pass } = trackerHarness();
  pass(20_000);
  tracker.advance(20, state, [], true);
  pass(50_000);
  tracker.advance(50, state, [], false);
  const result = tracker.getResult(state);
  assert.equal(result.activeSeconds, 20);
  assert.equal(result.wallSeconds, 70);
});
test("only accepted rotations are counted by the explicit rotation hook", () => {
  const state = startRun(22, false);
  const { tracker } = trackerHarness({ guided: false });
  tracker.recordRotation();
  tracker.recordRotation();
  tracker.advance(4, state);
  assert.equal(tracker.getResult(state).rotations, 2);
  assert.equal(tracker.getResult(state).rotationsPerSecond, 0.5);
});

test("tutorial, first kill, and active-90 events are emitted once", () => {
  const state = startRun(23, true);
  const { tracker, events } = trackerHarness();
  state.tutorialStep = 3;
  state.kills = 1;
  tracker.advance(90, state, [{ kind: "kill" }]);
  tracker.advance(1, state, [{ kind: "kill" }]);
  assert.deepEqual(events.map((event) => event.name), [
    "first_kill",
    "tutorial_completed",
    "active_90s_reached",
  ]);
});

test("unguided runs never manufacture a tutorial completion event", () => {
  const state = startRun(24, false);
  const { tracker, events } = trackerHarness({ source: "replay", runOrdinal: 4, guided: false });
  tracker.advance(2, state);
  tracker.recordTutorialCompleted(state);
  assert.equal(events.some((event) => event.name === "tutorial_completed"), false);
});

test("completion emits evidence fields but no seed, account, free text, or device identifier", () => {
  const state = startRun(25, false);
  state.phase = "lost";
  state.validPulses = 3;
  state.totalPulses = 5;
  state.overloads = 2;
  state.overdrives = 1;
  state.upgrades = ["rail-coil"];
  const { tracker, events } = trackerHarness({ guided: false });
  tracker.recordRotation();
  tracker.advance(10, state);
  const result = tracker.complete(state);
  tracker.complete(state);
  assert.equal(result.outcome, "lost");
  assert.equal(result.productiveRate, 0.6);
  assert.equal(result.build, "defend");
  const completion = events.filter((event) => event.name === "run_completed");
  assert.equal(completion.length, 1);
  const serialized = JSON.stringify(completion[0].properties).toLowerCase();
  for (const forbidden of ["seed", "account", "free_text", "device", "email", "name"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("checkpoint snapshots preserve timings, rotation count, and first-kill evidence", () => {
  const state = startRun(26, false);
  const first = trackerHarness({ source: "replay", runOrdinal: 8, guided: false });
  first.tracker.recordRotation();
  first.tracker.advance(12, state, [{ kind: "kill" }]);
  first.pass(12_000);
  const snapshot = first.tracker.snapshot();
  const second = trackerHarness({
    source: "checkpoint",
    runOrdinal: 8,
    guided: false,
    snapshot,
  });
  second.tracker.advance(3, state);
  const result = second.tracker.getResult(state);
  assert.equal(result.source, "replay");
  assert.equal(result.activeSeconds, 15);
  assert.equal(result.rotations, 1);
  assert.equal(result.firstKillSeconds, 12);
});
