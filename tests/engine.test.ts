import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceGame,
  cloneGameState,
  createGameState,
  getCircuitLoadForecast,
  getCurrentSector,
  getDefenseForecast,
  getWaveProgress,
  getWaveReadout,
  pauseGame,
  resumeGame,
  rotateRelay,
  selectUpgrade,
  startRun,
} from "../app/game/engine.ts";
import { SECTORS, type Sector } from "../app/game/model.ts";

function runFor(state: ReturnType<typeof startRun>, seconds: number, hz = 60) {
  const step = 1 / hz;
  const ticks = Math.round(seconds * hz);
  for (let index = 0; index < ticks; index += 1) advanceGame(state, step);
}

function runUntilPulseResolved(state: ReturnType<typeof startRun>, pulseCount: number) {
  for (let tick = 0; tick < 600; tick += 1) {
    advanceGame(state, 1 / 120);
    if (state.totalPulses >= pulseCount && state.transits.length === 0) return;
  }
  assert.fail(`pulse ${pulseCount} did not resolve`);
}

test("relay rotates exactly one sector per accepted input", () => {
  const state = startRun(101);
  assert.equal(getCurrentSector(state), "defend");
  rotateRelay(state);
  assert.equal(getCurrentSector(state), "extract");
  state.clock += 0.12;
  rotateRelay(state);
  assert.equal(getCurrentSector(state), "fabricate");
  state.clock += 0.12;
  rotateRelay(state);
  assert.equal(getCurrentSector(state), "defend");
});

test("later runs skip both the guided lock and its scripted forecasts", () => {
  const guided = startRun(102, true);
  const returning = startRun(102, false);
  assert.equal(guided.tutorialStep, 0);
  assert.equal(returning.tutorialStep, 3);
  assert.equal(returning.integrity, guided.integrity);
  assert.notDeepEqual(returning.pulseQueue, guided.pulseQueue);
});

test("only six opening forecasts are scripted before the seeded queue takes over", () => {
  const opening = [
    "extract",
    "fabricate",
    "defend",
    "extract",
    "fabricate",
    "defend",
  ] as const;
  const first = startRun(103);
  const second = startRun(104);
  assert.deepEqual(first.pulseQueue.slice(0, 6), opening);
  assert.deepEqual(second.pulseQueue.slice(0, 6), opening);
  assert.notDeepEqual(
    first.pulseQueue.slice(6),
    second.pulseQueue.slice(6),
    "pulse seven onward must retain the seeded forecast instead of another fixed loop",
  );
});

test("large frame gaps are clamped instead of fast-forwarding the invasion", () => {
  const state = startRun(202);
  state.tutorialStep = 3;
  const before = state.waveElapsed;
  advanceGame(state, 30);
  assert.ok(state.waveElapsed - before <= 0.051);
});

test("pause freezes every simulation clock", () => {
  const state = startRun(303);
  state.tutorialStep = 3;
  runFor(state, 1);
  const before = cloneGameState(state);
  assert.equal(pauseGame(state), true);
  advanceGame(state, 0.05);
  assert.equal(state.clock, before.clock);
  assert.equal(state.waveElapsed, before.waveElapsed);
  assert.equal(state.pulseElapsed, before.pulseElapsed);
  assert.equal(resumeGame(state), true);
});

test("simulation is refresh-rate independent for the same seed", () => {
  const at30 = startRun(404);
  const at144 = startRun(404);
  at30.tutorialStep = 3;
  at144.tutorialStep = 3;
  runFor(at30, 8, 30);
  runFor(at144, 8, 144);
  assert.equal(at30.totalPulses, at144.totalPulses);
  assert.equal(at30.enemies.length, at144.enemies.length);
  assert.ok(Math.abs(at30.waveElapsed - at144.waveElapsed) < 0.04);
  assert.ok(Math.abs((at30.enemies[0]?.progress ?? 0) - (at144.enemies[0]?.progress ?? 0)) < 0.003);
});

test("the opening route completes extraction, fabrication, and a kill within four seconds", () => {
  const state = startRun(505);
  rotateRelay(state);
  while (state.totalPulses < 1) advanceGame(state, 1 / 120);
  while (state.transits.length) advanceGame(state, 1 / 120);
  assert.ok(state.ore > 0, "extraction should create ore");
  rotateRelay(state);
  while (state.totalPulses < 2) advanceGame(state, 1 / 120);
  while (state.transits.length) advanceGame(state, 1 / 120);
  assert.ok(state.ammo > 0, "fabrication should convert ore to ammo");
  rotateRelay(state);
  while (state.totalPulses < 3 || state.transits.length) advanceGame(state, 1 / 120);
  assert.equal(state.kills, 1, "the first defense pulse should destroy the opening rusher");
  assert.ok(state.clock < 4, `opening loop took ${state.clock.toFixed(2)}s`);
  assert.equal(state.tutorialStep, 3);
  assert.ok(state.ore >= 0 && state.ammo >= 0);
});

test("upgrade selection applies once and advances through intermission", () => {
  const state = createGameState(606);
  state.phase = "upgrade";
  state.upgradeChoices = ["reinforced-bit", "lean-press", "rail-coil"];
  const first = selectUpgrade(state, "rail-coil");
  const second = selectUpgrade(state, "rail-coil");
  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
  assert.deepEqual(state.upgrades, ["rail-coil"]);
  assert.equal(state.phase, "intermission");
});

test("route history alone never applies an invisible pattern penalty", () => {
  const state = startRun(650);
  state.tutorialStep = 3;
  state.routeLog = [
    "extract",
    "extract",
    "fabricate",
    "defend",
    "extract",
    "extract",
    "fabricate",
    "defend",
    "extract",
    "extract",
    "fabricate",
  ];
  state.relayIndex = 0;
  state.pulseQueue[0] = "extract";
  const forecast = getCircuitLoadForecast(state, "extract");
  assert.equal(forecast.projectedHeat, 0, "a visible frequency match cools the branch");
  state.pulseElapsed = state.pulseInterval;
  advanceGame(state, 1 / 60);
  assert.equal(state.transits[0]?.multiplier, 1.5);
});

test("frequency matching is visible and has no hidden timing window", () => {
  const state = startRun(651);
  state.clock = 1;
  state.pulseQueue[0] = "extract";
  rotateRelay(state);
  state.pulseElapsed = state.pulseInterval;
  advanceGame(state, 1 / 120);
  assert.equal(state.transits[0]?.sector, "extract");
  assert.equal(state.transits[0]?.matched, true);
  assert.ok((state.transits[0]?.multiplier ?? 0) >= 1.5);
});

test("three productive frequency matches charge, then the next valid route releases one overdrive pulse", () => {
  const state = startRun(652, false);
  state.spawnSchedule = [];
  state.spawnCursor = 0;
  for (const sector of ["extract", "fabricate", "extract"] as const) {
    state.relayIndex = sector === "extract" ? 0 : sector === "fabricate" ? 1 : 2;
    state.pulseQueue[0] = sector;
    state.pulseElapsed = state.pulseInterval;
    advanceGame(state, 1 / 120);
    while (state.transits.length) advanceGame(state, 1 / 120);
  }
  assert.equal(state.resonance, 3);
  state.relayIndex = 0;
  state.pulseQueue[0] = "fabricate";
  state.pulseElapsed = state.pulseInterval;
  advanceGame(state, 1 / 120);
  while (state.transits.length) advanceGame(state, 1 / 120);
  assert.equal(state.overdrives, 1);
  assert.equal(state.resonance, 0);
  assert.ok(state.notices.some((notice) => notice.text.includes("RESONANCE OVERDRIVE")));
});

test("an empty matched machine does not create free resonance", () => {
  const state = startRun(655, false);
  state.spawnSchedule = [];
  state.spawnCursor = 0;
  state.enemies = [];
  state.ammo = 0;
  state.relayIndex = 2;
  state.pulseQueue[0] = "defend";
  state.pulseElapsed = state.pulseInterval;
  advanceGame(state, 1 / 120);
  assert.equal(state.resonance, 0);
});

test("a visible frequency miss leaks one banked resonance charge", () => {
  const state = startRun(653, false);
  state.resonance = 2;
  state.ore = 8;
  state.pulseQueue[0] = "defend";
  state.relayIndex = 0;
  state.pulseElapsed = state.pulseInterval;
  advanceGame(state, 1 / 120);
  assert.equal(state.resonance, 1);
  assert.equal(state.overdrives, 0);
});

test("an invalid route resets a ready overdrive instead of banking forever", () => {
  const state = startRun(654, false);
  state.resonance = 3;
  state.spawnSchedule = [];
  state.spawnCursor = 0;
  state.enemies = [];
  state.ammo = 0;
  state.relayIndex = 2;
  state.pulseQueue[0] = "defend";
  state.pulseElapsed = state.pulseInterval;
  advanceGame(state, 1 / 120);
  assert.equal(state.resonance, 0);
  assert.equal(state.overdrives, 0);
  assert.equal(state.transits[0]?.overdrive, false);
});

test("a forecast resource emergency can rationally override affinity without leaking resonance", () => {
  const state = startRun(6541, false);
  state.spawnSchedule = [{ at: 999, kind: "rusher" }];
  state.spawnCursor = 0;
  state.resonance = 2;
  state.ore = 3;
  state.relayIndex = 0;
  state.pulseQueue[0] = "fabricate";

  const forecast = getCircuitLoadForecast(state, "extract");
  assert.equal(forecast.matched, false);
  assert.equal(forecast.urgent, true);
  assert.equal(forecast.projectedHeat, 20);
  assert.equal(forecast.outputMultiplier, 1.25);

  state.pulseElapsed = state.pulseInterval;
  advanceGame(state, 1 / 120);
  assert.equal(state.resonance, 2, "a visible emergency preserves earned charge");
  assert.equal(state.transits[0]?.urgent, true);
  assert.equal(state.transits[0]?.targetReady, true);
  assert.ok(state.notices.some((notice) => notice.text === "EXTRACT PRIORITY RELIEF"));
});

test("a matched dry route is not safe autopilot: it heats the branch and resets resonance", () => {
  const state = startRun(6542, false);
  state.resonance = 2;
  state.ore = 24;
  state.relayIndex = 0;
  state.pulseQueue[0] = "extract";

  const forecast = getCircuitLoadForecast(state, "extract");
  assert.equal(forecast.matched, true);
  assert.equal(forecast.canReceive, false);
  assert.equal(forecast.projectedHeat, 60);

  state.pulseElapsed = state.pulseInterval;
  advanceGame(state, 1 / 120);
  assert.equal(state.resonance, 0);
  assert.equal(state.transits[0]?.targetReady, false);
  assert.equal(state.transits[0]?.heatAfter, 60);
});

test("circuit load forecasts a mismatch before it strains and overloads a branch", () => {
  const state = startRun(656, false);
  state.spawnSchedule = [{ at: 999, kind: "rusher" }];
  state.spawnCursor = 0;
  state.enemies = [{
    id: 8001,
    kind: "rusher",
    hp: 1000,
    maxHp: 1000,
    progress: 0.1,
    speed: 0,
    breachDamage: 1,
    track: 0,
    spawnedAt: 0,
    abilityAt: 999,
    abilityUsed: false,
    nextAbilityAt: 999,
    stunnedUntil: 0,
    flashUntil: 0,
  }];
  state.ore = 8;
  state.ammo = 8;
  state.relayIndex = 0;
  state.pulseQueue[0] = "fabricate";

  const first = getCircuitLoadForecast(state, "extract");
  assert.deepEqual(
    {
      heat: first.heat,
      projectedHeat: first.projectedHeat,
      status: first.projectedStatus,
      multiplier: first.outputMultiplier,
      overload: first.willOverload,
    },
    { heat: 0, projectedHeat: 60, status: "strained", multiplier: 0.85, overload: false },
  );
  state.pulseElapsed = state.pulseInterval;
  advanceGame(state, 1 / 120);
  state.transits = [];

  state.pulseQueue[0] = "defend";
  const second = getCircuitLoadForecast(state, "extract");
  assert.equal(second.projectedHeat, 100);
  assert.equal(second.projectedStatus, "overloaded");
  assert.equal(second.outputMultiplier, 0.15);
  assert.equal(second.willOverload, true);
  state.pulseElapsed = state.pulseInterval;
  const events = advanceGame(state, 1 / 120);
  assert.equal(state.circuitHeat.extract, 100);
  assert.equal(state.overloads, 1);
  assert.ok(events.some((event) => event.kind === "overload" && event.sector === "extract"));
});

test("avoiding a loaded branch cools it and an earned overdrive vents it", () => {
  const state = startRun(657, false);
  state.spawnSchedule = [{ at: 999, kind: "rusher" }];
  state.spawnCursor = 0;
  state.enemies = [{
    id: 8002,
    kind: "rusher",
    hp: 1000,
    maxHp: 1000,
    progress: 0.1,
    speed: 0,
    breachDamage: 1,
    track: 0,
    spawnedAt: 0,
    abilityAt: 999,
    abilityUsed: false,
    nextAbilityAt: 999,
    stunnedUntil: 0,
    flashUntil: 0,
  }];
  state.ore = 8;
  state.ammo = 8;
  state.circuitHeat.extract = 100;

  for (const sector of ["fabricate", "defend", "fabricate"] as const) {
    state.transits = [];
    state.relayIndex = SECTORS.indexOf(sector);
    state.pulseQueue[0] = sector;
    state.pulseElapsed = state.pulseInterval;
    advanceGame(state, 1 / 120);
  }
  assert.equal(state.circuitHeat.extract, 58, "three routed pulses cool an unused circuit below strain");

  state.transits = [];
  state.resonance = 3;
  state.ore = 0;
  state.relayIndex = 0;
  state.pulseQueue[0] = "fabricate";
  const forecast = getCircuitLoadForecast(state, "extract");
  assert.equal(forecast.overdrive, true);
  assert.equal(forecast.projectedHeat, 38);
  assert.equal(forecast.outputMultiplier, 1);
  state.pulseElapsed = state.pulseInterval;
  advanceGame(state, 1 / 120);
  assert.equal(state.circuitHeat.extract, 38);
  assert.equal(state.overdrives, 1);
});

function measureLoadEfficiency(seed: number, cycle: readonly Sector[] | null, pulses: number) {
  const state = createGameState(seed);
  state.phase = "playing";
  state.tutorialStep = 3;
  state.spawnSchedule = [{ at: 999, kind: "rusher" }];
  state.spawnCursor = 0;
  state.enemies = [{
    id: 9000,
    kind: "rusher",
    hp: 1_000_000,
    maxHp: 1_000_000,
    progress: 0,
    speed: 0,
    breachDamage: 1,
    track: 0,
    spawnedAt: 0,
    abilityAt: 999,
    abilityUsed: false,
    nextAbilityAt: 999,
    stunnedUntil: 0,
    flashUntil: 0,
  }];
  let retainedOutput = 0;
  for (let pulse = 0; pulse < pulses; pulse += 1) {
    state.ore = 8;
    state.ammo = 8;
    state.transits = [];
    const affinity = state.pulseQueue[0] ?? "extract";
    const sector = cycle ? cycle[pulse % cycle.length] : affinity;
    state.relayIndex = SECTORS.indexOf(sector);
    state.pulseElapsed = state.pulseInterval;
    advanceGame(state, 1 / 120);
    const transit = state.transits.at(-1);
    assert.ok(transit, `seed ${seed}, pulse ${pulse}`);
    retainedOutput += transit.loadMultiplier;
  }
  return retainedOutput / pulses;
}

function forEachFixedCycle(length: number, visit: (cycle: readonly Sector[]) => void) {
  const cycle = Array<Sector>(length);
  const walk = (index: number) => {
    if (index === length) {
      visit(cycle);
      return;
    }
    for (const sector of SECTORS) {
      cycle[index] = sector;
      walk(index + 1);
    }
  };
  walk(0);
}

function collectAffinities(seed: number, pulses: number) {
  const state = createGameState(seed);
  state.phase = "playing";
  state.tutorialStep = 3;
  state.spawnSchedule = [{ at: 999, kind: "rusher" }];
  state.spawnCursor = 0;
  state.enemies = [{
    id: 9100,
    kind: "rusher",
    hp: 1_000_000,
    maxHp: 1_000_000,
    progress: 0,
    speed: 0,
    breachDamage: 1,
    track: 0,
    spawnedAt: 0,
    abilityAt: 999,
    abilityUsed: false,
    nextAbilityAt: 999,
    stunnedUntil: 0,
    flashUntil: 0,
  }];
  const affinities: Sector[] = [];
  for (let pulse = 0; pulse < pulses; pulse += 1) {
    state.ore = 8;
    state.ammo = 8;
    state.transits = [];
    state.relayIndex = SECTORS.indexOf(state.pulseQueue[0] ?? "extract");
    state.pulseElapsed = state.pulseInterval;
    advanceGame(state, 1 / 120);
    affinities.push(state.transits.at(-1)!.affinity);
  }
  return affinities;
}

test("affinity forecast is seeded and varied without an untelegraphed four-pulse streak", () => {
  const first = collectAffinities(8001, 90);
  const repeat = collectAffinities(8001, 90);
  assert.deepEqual(first, repeat, "the same seed must generate the same forecast");

  let longestStreak = 1;
  let streak = 1;
  for (let index = 1; index < first.length; index += 1) {
    streak = first[index] === first[index - 1] ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
  }
  assert.ok(longestStreak <= 3, `forecast repeated ${longestStreak} times`);

  const hasLocallySkewedWindow = first.some((_, index) => {
    const window = first.slice(index, index + 6);
    if (window.length < 6) return false;
    return SECTORS.some(
      (sector) => window.filter((affinity) => affinity === sector).length !== 2,
    );
  });
  assert.equal(
    hasLocallySkewedWindow,
    true,
    "every six pulses must not silently prescribe the complete resource loop",
  );
});

test("every fixed cycle of length 2 through 8 retains materially less output than affinity-adaptive routing", { timeout: 30_000 }, () => {
  const seeds = Array.from({ length: 12 }, (_, index) => 8100 + index * 97);
  const pulses = 24;
  const adaptiveEfficiency =
    seeds.reduce((sum, seed) => sum + measureLoadEfficiency(seed, null, pulses), 0) / seeds.length;
  assert.equal(adaptiveEfficiency, 1);

  for (let length = 2; length <= 8; length += 1) {
    let bestFixedEfficiency = 0;
    forEachFixedCycle(length, (cycle) => {
      const efficiency =
        seeds.reduce(
          (sum, seed) => sum + measureLoadEfficiency(seed, cycle, pulses),
          0,
        ) / seeds.length;
      bestFixedEfficiency = Math.max(bestFixedEfficiency, efficiency);
    });
    assert.ok(
      bestFixedEfficiency <= adaptiveEfficiency - 0.08,
      `length ${length}: best fixed ${bestFixedEfficiency.toFixed(3)} vs adaptive ${adaptiveEfficiency.toFixed(3)}`,
    );
  }
});

test("the guided first wave reaches its first upgrade in 20 to 25 seconds across seeds", () => {
  for (let seed = 650; seed < 750; seed += 1) {
    const state = startRun(seed);
    const route = ["extract", "fabricate", "defend"] as const;
    let selectedForPulse = -1;
    let desired: Sector = "extract";
    for (let tick = 0; tick < 30 * 120 && state.phase === "playing"; tick += 1) {
      if (state.tutorialStep < 3) {
        desired = route[state.tutorialStep as 0 | 1 | 2];
        if (!state.transits.length && getCurrentSector(state) !== desired) rotateRelay(state);
      } else if (selectedForPulse !== state.totalPulses) {
        const affinity = state.pulseQueue[0] ?? "extract";
        const nearest = state.enemies.reduce(
          (progress, enemy) => Math.max(progress, enemy.progress),
          0,
        );
        if (state.enemies.length && state.ammo >= 0.5 && nearest > 0.4) {
          desired = "defend";
        } else if (getCircuitLoadForecast(state, affinity).canReceive) {
          desired = affinity;
        } else if (state.enemies.length && state.ammo >= 0.5) {
          desired = "defend";
        } else if (state.ore >= 0.5 && state.ammo < 12) {
          desired = "fabricate";
        } else {
          desired = "extract";
        }
        selectedForPulse = state.totalPulses;
      }
      if (
        state.tutorialStep >= 3 &&
        getCurrentSector(state) !== desired &&
        state.clock - state.lastInputAt >= 0.08
      ) {
        rotateRelay(state);
      }
      advanceGame(state, 1 / 120);
    }
    assert.equal(state.phase, "upgrade", `seed ${seed}`);
    assert.ok(state.clock >= 20 && state.clock <= 25, `seed ${seed}: ${state.clock.toFixed(2)}s`);
    assert.deepEqual(state.upgradeChoices, ["lean-press", "rail-coil", "arc-fork"]);
  }
});

test("tutorial freezes the simulation until each ordered route is selected", () => {
  const state = startRun(755);
  runFor(state, 2);
  assert.equal(state.clock, 0, "the opening threat must wait for the first correct input");
  assert.equal(state.totalPulses, 0);

  state.relayIndex = 1;
  runFor(state, 1);
  assert.equal(state.totalPulses, 0, "the wrong route must not dispatch a pulse");
  state.relayIndex = 0;
  runUntilPulseResolved(state, 1);
  assert.equal(state.tutorialStep, 1);

  state.relayIndex = 2;
  runFor(state, 1);
  assert.equal(state.totalPulses, 1, "defense cannot skip fabrication");
  state.relayIndex = 1;
  runUntilPulseResolved(state, 2);
  assert.equal(state.tutorialStep, 2);

  state.relayIndex = 0;
  runFor(state, 1);
  assert.equal(state.totalPulses, 2, "extraction cannot skip the first defense action");
  state.relayIndex = 2;
  runUntilPulseResolved(state, 3);
  assert.equal(state.tutorialStep, 3);
  assert.equal(state.tutorialStep, 3, "tutorial completion never regresses");
});

test("defense with no target arms standby without failing or spending ammo", () => {
  const state = startRun(761);
  state.tutorialStep = 3;
  state.spawnSchedule = [];
  state.spawnCursor = 0;
  state.enemies = [];
  state.relayIndex = 2;
  state.ammo = 9;
  state.pulseQueue[0] = "defend";
  state.pulseElapsed = state.pulseInterval;

  const events = [...advanceGame(state, 1 / 120)];
  while (state.transits.length) events.push(...advanceGame(state, 1 / 120));

  assert.equal(state.ammo, 9, "standby must not consume ammunition");
  assert.equal(state.validPulses, 0, "standby is neutral rather than productive");
  assert.equal(state.score, 25, "only the visible frequency-match bonus is retained");
  assert.equal(state.sectorEffect?.sector, "defend");
  assert.equal(state.sectorEffect?.amount, 0);
  assert.equal(state.sectorEffect?.cause, undefined, "standby has no failure cause");
  assert.equal(events.some((event) => event.kind === "fail"), false);
  assert.equal(events.some((event) => event.kind === "defend" || event.kind === "hit"), false);
  assert.equal(state.shotEffect, null, "standby must not play a phantom shot");
  assert.ok(state.notices.some((notice) => notice.text === "DEFENSE ARMED // STANDBY"));
});

test("targetless tutorial defense remains on the defense lesson", () => {
  const state = startRun(762);
  state.tutorialStep = 2;
  state.spawnSchedule = [];
  state.spawnCursor = 0;
  state.enemies = [];
  state.relayIndex = 2;
  state.ammo = 9;
  state.pulseElapsed = state.pulseInterval;

  const events = [...advanceGame(state, 1 / 120)];
  while (state.transits.length) events.push(...advanceGame(state, 1 / 120));

  assert.equal(state.tutorialStep, 2, "only an actual kill completes the tutorial");
  assert.equal(state.kills, 0);
  assert.equal(events.some((event) => event.kind === "fail"), false);
});

test("the tutorial kill resets the next pulse to a full decision interval", () => {
  const state = startRun(763);
  state.tutorialStep = 2;
  state.spawnSchedule = [];
  state.spawnCursor = 0;
  state.relayIndex = 2;
  state.ammo = 4;
  state.pulseQueue[0] = "defend";
  state.enemies = [{
    id: 9001,
    kind: "rusher",
    hp: 10,
    maxHp: 10,
    progress: 0.4,
    speed: 1 / 11,
    breachDamage: 1,
    track: 0,
    spawnedAt: state.clock,
    abilityAt: state.clock + 10,
    abilityUsed: false,
    nextAbilityAt: state.clock + 10,
    stunnedUntil: 0,
    flashUntil: 0,
  }];
  state.pulseElapsed = state.pulseInterval;

  while (state.tutorialStep < 3) advanceGame(state, 1 / 120);

  assert.equal(state.kills, 1);
  assert.equal(state.shotEffect?.targetTrack, 0, "shot feedback retains the target lane");
  assert.ok(state.pulseElapsed < 0.02, `next pulse retained ${state.pulseElapsed.toFixed(3)}s`);
  const pulsesAtCompletion = state.totalPulses;
  runFor(state, state.pulseInterval * 0.8, 120);
  assert.equal(
    state.totalPulses,
    pulsesAtCompletion,
    "no accidental follow-up pulse may fire during the post-tutorial decision window",
  );
});

test("wave progress and readout follow spawned and resolved threats", () => {
  const state = startRun(756);
  state.spawnSchedule = [0, 1, 2, 3].map((at) => ({ at, kind: "rusher" as const }));
  state.spawnCursor = 1;
  state.waveResolved = 0;
  assert.equal(getWaveProgress(state), 0.125);
  state.waveResolved = 1;
  assert.equal(getWaveProgress(state), 0.25);
  state.spawnCursor = 4;
  state.waveResolved = 4;
  assert.equal(getWaveProgress(state), 1);

  state.enemies = [];
  state.transits = [{
    id: 901,
    sector: "extract",
    affinity: "extract",
    progress: 0.5,
    multiplier: 1.5,
    matched: true,
    overdrive: false,
    jammed: false,
    loadMultiplier: 1,
    heatAfter: 0,
    urgent: false,
    targetReady: true,
  }];
  assert.equal(getWaveReadout(state).kind, "resolving");
  state.transits = [];
  assert.equal(getWaveReadout(state).kind, "clear");
});

test("scrap recovery exposes its conditional activation", () => {
  const state = startRun(757);
  state.tutorialStep = 3;
  state.upgrades = ["scrap-recovery"];
  state.ore = 6;
  state.relayIndex = 1;
  state.pulseQueue[0] = "fabricate";
  state.pulseElapsed = state.pulseInterval;
  advanceGame(state, 1 / 120);
  while (state.transits.length) advanceGame(state, 1 / 120);
  assert.equal(state.ore, 2);
  assert.ok(state.notices.some((notice) => notice.upgradeId === "scrap-recovery"));
});

test("defense forecast aggregates a visible arriving pack", () => {
  const state = startRun(760);
  state.enemies = Array.from({ length: 4 }, (_, index) => ({
    id: 100 + index,
    kind: "rusher" as const,
    hp: 10,
    maxHp: 10,
    progress: 0.5 - index * 0.005,
    speed: 1 / 11,
    breachDamage: 1,
    track: index % 3,
    spawnedAt: 0,
    abilityAt: 10,
    abilityUsed: false,
    nextAbilityAt: 10,
    stunnedUntil: 0,
    flashUntil: 0,
  }));
  const forecast = getDefenseForecast(state);
  assert.equal(forecast?.threatCount, 4);
  assert.equal(forecast?.totalHp, 40);
  assert.equal(forecast?.breachDamage, 4);
  assert.equal(forecast?.defensePulsesRequired, 4);
});

test("a breach at zero integrity ends the run exactly once", () => {
  const state = startRun(707);
  state.tutorialStep = 3;
  state.integrity = 1;
  state.enemies = [
    {
      id: 999,
      kind: "rusher",
      hp: 8,
      maxHp: 8,
      progress: 0.999,
      speed: 1,
      breachDamage: 1,
      track: 0,
      spawnedAt: state.clock,
      abilityAt: state.clock + 10,
      abilityUsed: false,
      nextAbilityAt: state.clock + 12,
      stunnedUntil: 0,
      flashUntil: 0,
    },
  ];
  const events = advanceGame(state, 0.05);
  assert.equal(state.phase, "lost");
  assert.equal(state.integrity, 0);
  assert.equal(events.filter((event) => event.kind === "lose").length, 1);
  assert.equal(advanceGame(state, 0.05).length, 0);
});
