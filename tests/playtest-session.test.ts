import assert from "node:assert/strict";
import test from "node:test";
import { startRun } from "../app/game/engine.ts";
import { RunEvidenceTracker } from "../app/game/playtest-metrics.ts";
import { summarizePlaytests } from "../app/game/playtest-summary.ts";
import {
  DEFAULT_PLAYTEST_OBSERVATION,
  beginPlaytestRun,
  completePlaytestSession,
  createPlaytestSession,
  getPlaytestCompletionIssues,
  getPlaytestSessionToken,
  markPlaytestGameReady,
  parsePlaytestSession,
  recordPlaytestRun,
  recordPlaytestProtocolDeviation,
  safeReadPlaytestSession,
  savePlaytestObservation,
  serializePlaytestSession,
} from "../app/game/playtest-session.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function completedObservation() {
  return {
    ...structuredClone(DEFAULT_PLAYTEST_OBSERVATION),
    observerCode: "OBS01",
    consentConfirmed: "yes" as const,
    firstTimeConfirmed: "yes" as const,
    externalTesterConfirmed: "yes" as const,
    assistanceProvided: "no" as const,
    device: "test phone",
    os: "test OS",
    browser: "test browser",
    inputMethod: "touch",
    audioMode: "on",
    similarGameExperience: "none",
    firstLookedAt: "screen did not render",
    behaviorNotes: "none",
    fiveSecondRelayFound: "no" as const,
    readabilityChecks: {
      threat: "no" as const, city: "no" as const, currentRoute: "no" as const,
      nextRoute: "no" as const, ore: "no" as const, ammo: "no" as const,
    },
    facilitySilhouettes: { extract: "no" as const, fabricate: "no" as const, defend: "no" as const },
    enemySilhouettes: { rusher: "no" as const, sapper: "no" as const, jammer: "no" as const, warden: "no" as const },
    wrongTarget: "none",
    chainExplained: "no" as const,
    resonanceExplained: "no" as const,
    replayWasPrompted: "no" as const,
    criticalUiIssue: "yes" as const,
    crashOrProgressBlockers: 1,
    backgroundProgressIssue: "no" as const,
    wallTimings: {
      firstInput: "not-reached" as const,
      firstExtract: "not-reached" as const,
      firstFabricate: "not-reached" as const,
      firstAmmo: "not-reached" as const,
      firstDefend: "not-reached" as const,
      firstKill: "not-reached" as const,
      tutorialComplete: "not-reached" as const,
      ninetySecondMark: "not-reached" as const,
    },
    answers: ["not conducted", "not conducted", "not conducted", "not conducted", "not conducted", "not conducted"] as [string, string, string, string, string, string],
  };
}

test("official sessions require an exact source revision and strict T01-T10 identity", () => {
  const storage = memoryStorage();
  const invalid = createPlaytestSession({
    datasetKind: "official",
    testerId: "T01",
    deploymentUrl: "https://tri-relay-test.vercel.app",
    deploymentEnvironment: "production",
    sourceRevision: "unknown",
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
    storage,
    now: () => new Date("2026-07-19T12:00:00.000Z"),
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(invalid, null);
  const wrongEnvironment = createPlaytestSession({
    datasetKind: "official",
    testerId: "T01",
    deploymentUrl: "https://tri-relay-test.vercel.app",
    deploymentEnvironment: "preview",
    sourceRevision: "a".repeat(40),
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
    storage,
  });
  assert.equal(wrongEnvironment, null);
  const wrongHost = createPlaytestSession({
    datasetKind: "official",
    testerId: "T01",
    deploymentUrl: "https://example.test",
    deploymentEnvironment: "production",
    sourceRevision: "a".repeat(40),
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
    storage,
  });
  assert.equal(wrongHost, null);
  assert.equal(parsePlaytestSession({ testerId: "T11" }), null);
});

test("completed run evidence is stored locally and replay intent updates the last run", () => {
  const storage = memoryStorage();
  const session = createPlaytestSession({
    datasetKind: "official",
    testerId: "T01",
    deploymentUrl: "https://tri-relay-test.vercel.app",
    deploymentEnvironment: "production",
    sourceRevision: "a".repeat(40),
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
    storage,
    now: () => new Date("2026-07-19T12:00:00.000Z"),
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });
  assert.ok(session);
  markPlaytestGameReady(session.sessionId, storage, new Date("2026-07-19T12:00:01.000Z"));
  assert.ok(beginPlaytestRun(session.sessionId, storage, {
    source: "opening",
    at: new Date("2026-07-19T12:00:05.000Z"),
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
  }));
  const state = startRun(99, true);
  let clock = 0;
  const tracker = new RunEvidenceTracker({
    source: "start",
    runOrdinal: 1,
    guided: true,
    now: () => clock,
    emit: () => {},
  });
  tracker.recordRotation();
  clock = 15_000;
  tracker.advance(15, state, [{ kind: "extract", sector: "extract" }]);
  state.phase = "lost";
  const stored = recordPlaytestRun(
    session.sessionId,
    tracker.complete(state),
    state,
    storage,
    new Date("2026-07-19T12:00:20.000Z"),
  );
  assert.equal(stored?.runs.length, 1);
  assert.equal(stored?.runs[0].startedAt, "2026-07-19T12:00:05.000Z");
  const replayed = beginPlaytestRun(session.sessionId, storage, {
    source: "replay",
    at: new Date("2026-07-19T12:00:45.000Z"),
    replayDelaySeconds: 25,
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
  });
  assert.equal(replayed?.runs[0].replayDelaySeconds, 25);
  const replayState = startRun(100, false);
  replayState.phase = "lost";
  const replayTracker = new RunEvidenceTracker({
    source: "replay", runOrdinal: 2, guided: false, now: () => 0, emit: () => {},
  });
  assert.ok(recordPlaytestRun(
    session.sessionId,
    replayTracker.complete(replayState),
    replayState,
    storage,
    new Date("2026-07-19T12:00:50.000Z"),
  ));
  const completed = completePlaytestSession(session.sessionId, storage, new Date("2026-07-19T12:01:00.000Z"));
  assert.equal(completed?.status, "complete");
  assert.ok(serializePlaytestSession(completed!).includes('"testerId": "T01"'));
  assert.deepEqual(safeReadPlaytestSession(storage), completed);
});

test("replay delay rounds conservatively at the 30-second boundary", () => {
  const storage = memoryStorage();
  const session = createPlaytestSession({
    datasetKind: "pilot",
    testerId: "T01",
    deploymentUrl: "http://localhost:3000/",
    deploymentEnvironment: "local",
    sourceRevision: "unknown",
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
    storage,
    now: () => new Date("2026-07-19T12:00:00.000Z"),
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });
  assert.ok(session);
  markPlaytestGameReady(session.sessionId, storage, new Date("2026-07-19T12:00:01.000Z"));
  assert.ok(beginPlaytestRun(session.sessionId, storage, {
    source: "opening",
    at: new Date("2026-07-19T12:00:02.000Z"),
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
  }));
  const state = startRun(1, true);
  state.phase = "lost";
  const tracker = new RunEvidenceTracker({ source: "start", runOrdinal: 1, guided: true, now: () => 0, emit: () => {} });
  recordPlaytestRun(session.sessionId, tracker.complete(state), state, storage, new Date("2026-07-19T12:00:10.000Z"));
  const replayed = beginPlaytestRun(session.sessionId, storage, {
    source: "replay",
    at: new Date("2026-07-19T12:00:40.001Z"),
    replayDelaySeconds: 30.0001,
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
  });
  assert.equal(replayed?.runs[0].replayDelaySeconds, 30.001);
});

test("strict parser rejects extra fields and impossible completion state", () => {
  const storage = memoryStorage();
  const session = createPlaytestSession({
    datasetKind: "pilot",
    testerId: "T01",
    deploymentUrl: "http://localhost:3000/",
    deploymentEnvironment: "local",
    sourceRevision: "unknown",
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
    storage,
    now: () => new Date("2026-07-19T12:00:00.000Z"),
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });
  assert.ok(session);
  assert.equal(parsePlaytestSession({ ...session, extra: true }), null);
  assert.equal(parsePlaytestSession({ ...session, status: "complete" }), null);
  assert.equal(parsePlaytestSession({ ...session, startedAt: "July 19 2026 12:00 UTC" }), null);
});

test("atomic playtest start rejects a second current run and records protocol deviation", () => {
  const storage = memoryStorage();
  const session = createPlaytestSession({
    datasetKind: "official",
    testerId: "T01",
    deploymentUrl: "https://tri-relay-test.vercel.app",
    deploymentEnvironment: "production",
    sourceRevision: "a".repeat(40),
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
    storage,
    now: () => new Date("2026-07-19T12:00:00.000Z"),
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });
  assert.ok(session);
  markPlaytestGameReady(session.sessionId, storage, new Date("2026-07-19T12:00:01.000Z"));
  const started = beginPlaytestRun(session.sessionId, storage, {
    source: "opening",
    at: new Date("2026-07-19T12:00:02.000Z"),
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
  });
  assert.equal(started?.currentRunStartedAt, "2026-07-19T12:00:02.000Z");
  assert.equal(beginPlaytestRun(session.sessionId, storage, {
    source: "opening",
    at: new Date("2026-07-19T12:00:03.000Z"),
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
  }), null);
  const deviated = recordPlaytestProtocolDeviation(session.sessionId, "viewport changed", storage);
  assert.equal(deviated?.observation.protocolDeviation, "viewport changed");
  const eraseAttempt = savePlaytestObservation(session.sessionId, {
    ...deviated!.observation,
    protocolDeviation: "",
  }, storage);
  assert.equal(eraseAttempt?.observation.protocolDeviation, "viewport changed");
  const summary = summarizePlaytests([eraseAttempt]);
  assert.equal(summary.status, "INCOMPLETE");
  assert.ok(summary.errors.includes("T01: protocol deviation recorded"));
});

test("startup technical incident can close as complete NO-GO evidence with explicit not-reached timings", () => {
  const storage = memoryStorage();
  const session = createPlaytestSession({
    datasetKind: "pilot",
    testerId: "T01",
    deploymentUrl: "http://localhost:3000/",
    deploymentEnvironment: "local",
    sourceRevision: "unknown",
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
    storage,
    now: () => new Date("2026-07-19T12:00:00.000Z"),
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });
  assert.ok(session);
  const observed = savePlaytestObservation(session.sessionId, completedObservation(), storage);
  assert.ok(observed);
  assert.deepEqual(getPlaytestCompletionIssues(observed!), []);
  const completed = completePlaytestSession(session.sessionId, storage, new Date("2026-07-19T12:00:10.000Z"));
  assert.equal(completed?.status, "complete");
  assert.equal(completed?.gameReadyAt, null);
  assert.ok(serializePlaytestSession(completed!).includes('"not-reached"'));
});

test("the six-run evidence chain is retained and a seventh replay is rejected", () => {
  const storage = memoryStorage();
  const session = createPlaytestSession({
    datasetKind: "pilot",
    testerId: "T01",
    deploymentUrl: "http://localhost:3000/",
    deploymentEnvironment: "local",
    sourceRevision: "unknown",
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
    storage,
    now: () => new Date("2026-07-19T12:00:00.000Z"),
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });
  assert.ok(session);
  markPlaytestGameReady(session.sessionId, storage, new Date("2026-07-19T12:00:00.500Z"));
  for (let ordinal = 1; ordinal <= 6; ordinal += 1) {
    const startedAt = new Date(`2026-07-19T12:00:${String(ordinal * 2 - 1).padStart(2, "0")}.000Z`);
    const recordedAt = new Date(`2026-07-19T12:00:${String(ordinal * 2).padStart(2, "0")}.000Z`);
    assert.ok(beginPlaytestRun(session.sessionId, storage, {
      source: ordinal === 1 ? "opening" : "replay",
      at: startedAt,
      replayDelaySeconds: ordinal === 1 ? undefined : 1,
      viewport: { width: 390, height: 844, dpr: 3 },
      language: "ja",
    }));
    const state = startRun(ordinal, ordinal === 1);
    state.phase = "lost";
    const tracker = new RunEvidenceTracker({
      source: ordinal === 1 ? "start" : "replay",
      runOrdinal: ordinal,
      guided: ordinal === 1,
      now: () => 0,
      emit: () => {},
    });
    assert.ok(recordPlaytestRun(session.sessionId, tracker.complete(state), state, storage, recordedAt));
  }
  assert.equal(beginPlaytestRun(session.sessionId, storage, {
    source: "replay",
    at: new Date("2026-07-19T12:00:13.000Z"),
    replayDelaySeconds: 1,
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
  }), null);
  assert.deepEqual(safeReadPlaytestSession(storage)?.runs.map((run) => run.evidence.runOrdinal), [1, 2, 3, 4, 5, 6]);
});

test("a non-replay session cannot finalize before the silent 30-second window", () => {
  const storage = memoryStorage();
  const session = createPlaytestSession({
    datasetKind: "pilot",
    testerId: "T01",
    deploymentUrl: "http://localhost:3000/",
    deploymentEnvironment: "local",
    sourceRevision: "unknown",
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
    storage,
    now: () => new Date("2026-07-19T12:00:00.000Z"),
    randomUUID: () => "00000000-0000-4000-8000-000000000001",
  });
  assert.ok(session);
  markPlaytestGameReady(session.sessionId, storage, new Date("2026-07-19T12:00:01.000Z"));
  assert.ok(beginPlaytestRun(session.sessionId, storage, {
    source: "opening",
    at: new Date("2026-07-19T12:00:02.000Z"),
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
  }));
  const state = startRun(1, true);
  state.phase = "lost";
  const tracker = new RunEvidenceTracker({ source: "start", runOrdinal: 1, guided: true, now: () => 0, emit: () => {} });
  assert.ok(recordPlaytestRun(session.sessionId, tracker.complete(state), state, storage, new Date("2026-07-19T12:00:10.000Z")));
  assert.ok(getPlaytestCompletionIssues(
    safeReadPlaytestSession(storage)!,
    new Date("2026-07-19T12:00:39.999Z"),
  ).includes("結果画面30秒観察"));
  assert.equal(completePlaytestSession(session.sessionId, storage, new Date("2026-07-19T12:00:39.999Z")), null);
  assert.equal(completePlaytestSession(
    session.sessionId,
    storage,
    new Date("2026-07-19T12:00:40.000Z"),
  )?.status, "complete");
});

test("playtest token accepts only the isolated session fragment", () => {
  assert.equal(getPlaytestSessionToken("#playtest=00000000-0000-4000-8000-000000000001"), "00000000-0000-4000-8000-000000000001");
  assert.equal(getPlaytestSessionToken("#playtest=T01"), null);
  assert.equal(getPlaytestSessionToken("#playtest=00000000-0000-4000-8000-000000000001&extra=1"), null);
});
