import assert from "node:assert/strict";
import test from "node:test";
import { advanceGame, startRun } from "../app/game/engine.ts";
import {
  ACTIVE_RUN_KEY,
  DEFAULT_PROFILE,
  LEGACY_ACTIVE_RUN_KEYS,
  LEGACY_PROFILE_KEY,
  PROFILE_KEY,
  isValidGameState,
  safeReadActiveRun,
  safeReadProfile,
  safeWriteActiveRun,
  safeWriteProfile,
} from "../app/game/persistence.ts";
import type { RunEvidenceSnapshot } from "../app/game/playtest-metrics.ts";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const NOW = 2_000_000_000_000;
const evidence: RunEvidenceSnapshot = {
  version: 1,
  source: "start",
  runOrdinal: 3,
  guided: true,
  activeSeconds: 42,
  wallSeconds: 55,
  rotations: 12,
  firstKillActiveSeconds: null,
  tutorialReported: true,
  active90Reported: false,
  completed: false,
};

function storedState() {
  const state = startRun(31, false);
  state.clock = 7;
  state.waveElapsed = 7;
  return state;
}

test("profile v1 migrates to v2 with tutorial completion preserved", () => {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_PROFILE_KEY, JSON.stringify({
    version: 1,
    runs: 4,
    wins: 2,
    bestWave: 5,
    bestScore: 1234,
    muted: true,
    language: "en",
  }));
  const profile = safeReadProfile(storage);
  assert.deepEqual(profile, {
    version: 2,
    runs: 4,
    wins: 2,
    bestWave: 5,
    bestScore: 1234,
    muted: true,
    language: "en",
    tutorialCompleted: true,
  });
  assert.equal(storage.getItem(LEGACY_PROFILE_KEY), null);
  assert.ok(storage.getItem(PROFILE_KEY));

  const writeBlocked = new MemoryStorage();
  writeBlocked.setItem(LEGACY_PROFILE_KEY, JSON.stringify({ version: 1, runs: 2 }));
  writeBlocked.setItem = () => { throw new Error("quota"); };
  assert.equal(safeReadProfile(writeBlocked).runs, 2);
  assert.ok(writeBlocked.getItem(LEGACY_PROFILE_KEY), "legacy data stays available when migration cannot persist");
});

test("profile writes are sanitized and blocked storage stays non-fatal", () => {
  const storage = new MemoryStorage();
  safeWriteProfile({ ...DEFAULT_PROFILE, runs: 3.8, wins: 9, bestWave: 99 }, storage);
  assert.deepEqual(safeReadProfile(storage), {
    ...DEFAULT_PROFILE,
    runs: 3,
    wins: 3,
    bestWave: 6,
  });
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem() {} };
  assert.doesNotThrow(() => safeWriteProfile(DEFAULT_PROFILE, blocked));
  assert.deepEqual(safeReadProfile(blocked), DEFAULT_PROFILE);
});

test("corrupt or wrong-version v2 data is removed before a valid v1 fallback migrates", () => {
  for (const invalidCurrent of ["{", JSON.stringify({ ...DEFAULT_PROFILE, version: 1 })]) {
    const storage = new MemoryStorage();
    storage.setItem(PROFILE_KEY, invalidCurrent);
    // Versionless legacy profiles existed before the explicit v1 field.
    storage.setItem(LEGACY_PROFILE_KEY, JSON.stringify({ runs: 2, wins: 1, language: "en" }));
    const restored = safeReadProfile(storage);
    assert.equal(restored.version, 2);
    assert.equal(restored.runs, 2);
    assert.equal(restored.tutorialCompleted, true);
    assert.equal(storage.getItem(LEGACY_PROFILE_KEY), null);
    assert.equal(JSON.parse(storage.getItem(PROFILE_KEY) ?? "{}").version, 2);
  }
});

test("wrong-version legacy profile is retired instead of being reinterpreted", () => {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_PROFILE_KEY, JSON.stringify({ version: 9, runs: 8 }));
  assert.deepEqual(safeReadProfile(storage), DEFAULT_PROFILE);
  assert.equal(storage.getItem(LEGACY_PROFILE_KEY), null);
});

test("v4 active run round-trips evidence and restores live play as paused", () => {
  const storage = new MemoryStorage();
  const state = storedState();
  safeWriteActiveRun(state, evidence, storage, NOW);
  const restored = safeReadActiveRun(storage, NOW + 1_000);
  assert.ok(restored);
  assert.equal(restored.state.phase, "paused");
  assert.equal(restored.state.phaseBeforePause, "playing");
  assert.equal(restored.state.clock, 7);
  assert.deepEqual(restored.evidence, evidence);
  assert.notEqual(restored.state, state);
});

test("old v2 and v3 active runs are retired without touching the profile", () => {
  const storage = new MemoryStorage();
  storage.setItem(PROFILE_KEY, JSON.stringify(DEFAULT_PROFILE));
  LEGACY_ACTIVE_RUN_KEYS.forEach((key) => storage.setItem(key, "legacy"));
  assert.equal(safeReadActiveRun(storage, NOW), null);
  LEGACY_ACTIVE_RUN_KEYS.forEach((key) => assert.equal(storage.getItem(key), null));
  assert.ok(storage.getItem(PROFILE_KEY));
});

test("expired and implausibly future checkpoints are removed", () => {
  for (const savedAt of [NOW - 12 * 60 * 60 * 1_000 - 1, NOW + 5 * 60 * 1_000 + 1]) {
    const storage = new MemoryStorage();
    storage.setItem(ACTIVE_RUN_KEY, JSON.stringify({ version: 4, savedAt, state: storedState(), evidence }));
    assert.equal(safeReadActiveRun(storage, NOW), null);
    assert.equal(storage.getItem(ACTIVE_RUN_KEY), null);
  }
});

test("malformed JSON and wrong checkpoint versions are removed before cloning", () => {
  for (const raw of ["{", JSON.stringify({ version: 3, savedAt: NOW, state: storedState() })]) {
    const storage = new MemoryStorage();
    storage.setItem(ACTIVE_RUN_KEY, raw);
    assert.equal(safeReadActiveRun(storage, NOW), null);
    assert.equal(storage.getItem(ACTIVE_RUN_KEY), null);
  }
});

test("state validation rejects non-positive pulse intervals and invalid nested sectors", () => {
  const invalidInterval = storedState();
  invalidInterval.pulseInterval = 0;
  assert.equal(isValidGameState(invalidInterval), false);
  const nearZeroInterval = storedState();
  nearZeroInterval.pulseInterval = Number.MIN_VALUE;
  assert.equal(isValidGameState(nearZeroInterval), false);
  const wrongWaveInterval = storedState();
  wrongWaveInterval.pulseInterval += 0.01;
  assert.equal(isValidGameState(wrongWaveInterval), false);
  const elapsedAtBoundary = storedState();
  elapsedAtBoundary.pulseElapsed = elapsedAtBoundary.pulseInterval;
  assert.equal(isValidGameState(elapsedAtBoundary), false);
  const oversizedElapsed = storedState();
  oversizedElapsed.pulseElapsed = 60;
  assert.equal(isValidGameState(oversizedElapsed), false);
  const invalidQueue = storedState();
  (invalidQueue.pulseQueue as string[])[0] = "hidden-fourth-route";
  assert.equal(isValidGameState(invalidQueue), false);
  const emptyQueue = storedState();
  emptyQueue.pulseQueue = [];
  assert.equal(isValidGameState(emptyQueue), false);
});

test("state validation rejects duplicate nested IDs and malformed enemies", () => {
  const duplicate = storedState();
  duplicate.transits = [{
    id: 10,
    sector: "extract",
    affinity: "extract",
    progress: 0.5,
    multiplier: 1,
    matched: true,
    overdrive: false,
    jammed: false,
    loadMultiplier: 1,
    heatAfter: 0,
    urgent: false,
    targetReady: true,
  }];
  duplicate.enemies = [{
    id: 10,
    kind: "rusher",
    hp: 10,
    maxHp: 10,
    progress: 0.2,
    speed: 0.1,
    breachDamage: 1,
    track: 0,
    spawnedAt: 0,
    abilityAt: 6,
    abilityUsed: false,
    nextAbilityAt: 10,
    stunnedUntil: 0,
    flashUntil: 0,
  }];
  duplicate.nextId = 11;
  assert.equal(isValidGameState(duplicate), false);

  const malformed = storedState();
  malformed.enemies = [{ ...duplicate.enemies[0], id: 9, hp: Number.NaN }];
  malformed.nextId = 10;
  assert.equal(isValidGameState(malformed), false);
});

test("state validation bounds arrays, IDs, heat, resources, and upgrade values", () => {
  const cases = [
    () => { const state = storedState(); state.routeLog = Array(13).fill("extract"); return state; },
    () => { const state = storedState(); state.circuitHeat.extract = 101; return state; },
    () => { const state = storedState(); state.ore = 25; return state; },
    () => { const state = storedState(); state.upgrades = ["not-an-upgrade"]; return state; },
    () => { const state = storedState(); state.nextId = 0; return state; },
  ];
  cases.forEach((makeState) => assert.equal(isValidGameState(makeState()), false));
});

test("notice upgrade references must name a production upgrade", () => {
  const state = storedState();
  state.notices = [{
    id: state.nextId,
    text: "UNKNOWN MODULE",
    tone: "info",
    expiresAt: state.clock + 1,
    upgradeId: "invented-module",
  }];
  state.nextId += 1;
  assert.equal(isValidGameState(state), false);
});

test("invalid evidence rejects the whole checkpoint instead of partially trusting it", () => {
  for (const invalidEvidence of [
    { ...evidence, activeSeconds: -1 },
    { ...evidence, activeSeconds: 56, wallSeconds: 55 },
    { ...evidence, firstKillActiveSeconds: 43 },
    { ...evidence, active90Reported: true },
    { ...evidence, completed: true },
  ]) {
    const storage = new MemoryStorage();
    storage.setItem(ACTIVE_RUN_KEY, JSON.stringify({
      version: 4,
      savedAt: NOW,
      state: storedState(),
      evidence: invalidEvidence,
    }));
    assert.equal(safeReadActiveRun(storage, NOW), null);
    assert.equal(storage.getItem(ACTIVE_RUN_KEY), null);
  }

  const missingFirstKill = new MemoryStorage();
  const killedState = storedState();
  killedState.kills = 1;
  missingFirstKill.setItem(ACTIVE_RUN_KEY, JSON.stringify({
    version: 4,
    savedAt: NOW,
    state: killedState,
    evidence: null,
  }));
  assert.equal(safeReadActiveRun(missingFirstKill, NOW), null);
});

test("impossible final-wave transitions are rejected before resume can advance past WAVES", () => {
  for (const phaseCase of [
    { phase: "intermission", phaseBeforePause: "playing" },
    { phase: "paused", phaseBeforePause: "intermission" },
    { phase: "upgrade", phaseBeforePause: "playing" },
  ] as const) {
    const storage = new MemoryStorage();
    const state = storedState();
    state.waveIndex = 5;
    state.pulseInterval = 1.45;
    state.pulseElapsed = 0;
    state.phase = phaseCase.phase;
    state.phaseBeforePause = phaseCase.phaseBeforePause;
    state.upgradeChoices = phaseCase.phase === "upgrade"
      ? ["reinforced-bit", "lean-press", "rail-coil"]
      : [];
    storage.setItem(ACTIVE_RUN_KEY, JSON.stringify({ version: 4, savedAt: NOW, state, evidence }));
    const restored = safeReadActiveRun(storage, NOW);
    assert.equal(restored, null);
    assert.equal(storage.getItem(ACTIVE_RUN_KEY), null);
    assert.doesNotThrow(() => {
      if (restored) advanceGame(restored.state, 1 / 60);
    });
  }
});

test("phase and upgrade-choice invariants reject locked or stale modal states", () => {
  const emptyUpgrade = storedState();
  emptyUpgrade.phase = "upgrade";
  emptyUpgrade.upgradeChoices = [];
  assert.equal(isValidGameState(emptyUpgrade), false);

  const stalePlaying = storedState();
  stalePlaying.upgradeChoices = ["rail-coil"];
  assert.equal(isValidGameState(stalePlaying), false);

  const tooFewChoices = storedState();
  tooFewChoices.phase = "upgrade";
  tooFewChoices.upgradeChoices = ["rail-coil", "lean-press"];
  assert.equal(isValidGameState(tooFewChoices), false);

  const installedChoice = storedState();
  installedChoice.phase = "upgrade";
  installedChoice.upgrades = ["rail-coil"];
  installedChoice.upgradeChoices = ["rail-coil", "lean-press", "reinforced-bit"];
  assert.equal(isValidGameState(installedChoice), false);

  const missingWaveSchedule = storedState();
  missingWaveSchedule.spawnSchedule = [];
  missingWaveSchedule.spawnCursor = 0;
  assert.equal(isValidGameState(missingWaveSchedule), false);
});

test("terminal breach fields can never be restored as a resumable run", () => {
  const zeroIntegrity = storedState();
  zeroIntegrity.integrity = 0;
  assert.equal(isValidGameState(zeroIntegrity), false);

  const terminalCause = storedState();
  terminalCause.lossCause = { enemyKind: "rusher", breachDamage: 1 };
  assert.equal(isValidGameState(terminalCause), false);
});

test("null or ended states clear the active checkpoint", () => {
  const storage = new MemoryStorage();
  storage.setItem(ACTIVE_RUN_KEY, "old");
  safeWriteActiveRun(null, null, storage, NOW);
  assert.equal(storage.getItem(ACTIVE_RUN_KEY), null);
  const won = storedState();
  won.phase = "won";
  safeWriteActiveRun(won, null, storage, NOW);
  assert.equal(storage.getItem(ACTIVE_RUN_KEY), null);
});
