import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { summarizePlaytests } from "../app/game/playtest-summary.ts";
import {
  DEFAULT_PLAYTEST_OBSERVATION,
  PLAYTEST_TESTER_IDS,
  type PlaytestSession,
} from "../app/game/playtest-session.ts";
import { readPlaytestFiles, summarizePlaytestFiles } from "../scripts/summarize-playtests.mts";

function cohort(): PlaytestSession[] {
  return PLAYTEST_TESTER_IDS.map((testerId, index) => {
    const base = Date.parse("2026-07-19T12:00:00.000Z") + index * 600_000;
    const at = (offsetSeconds: number) => new Date(base + offsetSeconds * 1_000).toISOString();
    return {
    schemaVersion: 1,
    datasetKind: "official",
    protocolVersion: "V04.1",
    release: "0.4.1",
    sessionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    testerId,
    status: "complete",
    startedAt: at(0),
    gameReadyAt: at(1),
    completedAt: at(250),
    deploymentUrl: "https://tri-relay-immutable.vercel.app",
    deploymentEnvironment: "production",
    sourceRevision: "a".repeat(40),
    viewport: { width: 390, height: 844, dpr: 3 },
    language: "ja",
    freshStateConfirmed: true,
    currentRunStartedAt: null,
    runs: [{
      version: 1,
      recordedAt: at(112),
      startedAt: at(2),
      completedAt: at(112),
      replayStartedAt: index < 5 ? at(142) : null,
      replayDelaySeconds: index < 5 ? 30 : null,
      evidence: {
        source: "start",
        runOrdinal: 1,
        guided: true,
        activeSeconds: index < 7 ? 100 : 89.999,
        wallSeconds: 110,
        rotations: 30,
        rotationsPerSecond: 0.3,
        firstInputSeconds: 1,
        firstInputWallSeconds: 1.2,
        firstSectorSeconds: { extract: 3, fabricate: 6, defend: 9 },
        firstSectorWallSeconds: { extract: 3.2, fabricate: 6.2, defend: 9.2 },
        firstKillSeconds: index < 8 ? 25 : 25.001,
        wave2Seconds: 55,
        wave2WallSeconds: 60,
        tutorialCompleted: true,
        active90Reached: index < 7,
        productiveRate: 0.8,
        overloads: 1,
        overdrives: 1,
        build: "mixed",
        outcome: "lost",
        wave: 3,
      },
      result: {
        gameSeconds: 100,
        wave: 3,
        kills: 4,
        score: 500,
        integrity: 0,
        totalPulses: 50,
        validPulses: 40,
        routeCounts: { extract: 15, fabricate: 14, defend: 11 },
        upgrades: ["rail-coil"],
        tutorialStep: 3,
        lossCause: "rusher",
      },
    }, ...(index < 5 ? [{
      version: 1 as const,
      recordedAt: at(242),
      startedAt: at(142),
      completedAt: at(242),
      replayStartedAt: null,
      replayDelaySeconds: null,
      evidence: {
        source: "replay" as const,
        runOrdinal: 2,
        guided: false,
        activeSeconds: 100,
        wallSeconds: 100,
        rotations: 30,
        rotationsPerSecond: 0.3,
        firstInputSeconds: 1,
        firstInputWallSeconds: 1.2,
        firstSectorSeconds: { extract: 3, fabricate: 6, defend: 9 },
        firstSectorWallSeconds: { extract: 3.2, fabricate: 6.2, defend: 9.2 },
        firstKillSeconds: 25,
        wave2Seconds: 55,
        wave2WallSeconds: 60,
        tutorialCompleted: false,
        active90Reached: true,
        productiveRate: 0.8,
        overloads: 1,
        overdrives: 1,
        build: "mixed" as const,
        outcome: "lost" as const,
        wave: 3,
      },
      result: {
        gameSeconds: 100,
        wave: 3,
        kills: 4,
        score: 500,
        integrity: 0,
        totalPulses: 50,
        validPulses: 40,
        routeCounts: { extract: 15, fabricate: 14, defend: 11 },
        upgrades: ["rail-coil"],
        tutorialStep: 3,
        lossCause: "rusher",
      },
    }] : [])],
    observation: {
      ...structuredClone(DEFAULT_PLAYTEST_OBSERVATION),
      observerCode: "OBS01",
      consentConfirmed: "yes",
      firstTimeConfirmed: "yes",
      externalTesterConfirmed: "yes",
      assistanceProvided: "no",
      fiveSecondRelayFound: index < 8 ? "yes" : "no",
      readabilityChecks: Object.fromEntries(
        Object.keys(DEFAULT_PLAYTEST_OBSERVATION.readabilityChecks)
          .map((key) => [key, index < 8 ? "yes" : "no"]),
      ) as PlaytestSession["observation"]["readabilityChecks"],
      facilitySilhouettes: Object.fromEntries(
        Object.keys(DEFAULT_PLAYTEST_OBSERVATION.facilitySilhouettes)
          .map((key) => [key, index < 8 ? "yes" : "no"]),
      ) as PlaytestSession["observation"]["facilitySilhouettes"],
      enemySilhouettes: Object.fromEntries(
        Object.keys(DEFAULT_PLAYTEST_OBSERVATION.enemySilhouettes)
          .map((key) => [key, index < 8 ? "yes" : "no"]),
      ) as PlaytestSession["observation"]["enemySilhouettes"],
      chainExplained: index < 8 ? "yes" : "no",
      resonanceExplained: index < 8 ? "yes" : "no",
      replayWasPrompted: "no",
      criticalUiIssue: "no",
      crashOrProgressBlockers: 0,
      backgroundProgressIssue: "no",
      device: "iPhone test device",
      os: "iOS test",
      browser: "Safari test",
      inputMethod: "touch",
      audioMode: "on",
      similarGameExperience: "none recorded",
      firstLookedAt: "central relay",
      behaviorNotes: "none",
      wrongTarget: "none",
      wallTimings: {
        firstInput: 1.2,
        firstExtract: 3.2,
        firstFabricate: 6.2,
        firstAmmo: 6.3,
        firstDefend: 9.2,
        firstKill: index < 8 ? 25 : 25.1,
        tutorialComplete: 25,
        ninetySecondMark: 90,
      },
      answers: ["private answer", "answer 2", "answer 3", "answer 4", "answer 5", "answer 6"],
    },
    };
  });
}

test("exact threshold cohort returns GO without leaking answer text", () => {
  const summary = summarizePlaytests(cohort());
  assert.equal(summary.status, "GO");
  assert.equal(summary.counts.firstKillWithin25, 8);
  assert.equal(summary.counts.active90Reached, 7);
  assert.equal(summary.counts.voluntaryReplay, 5);
  assert.equal(JSON.stringify(summary).includes("private answer"), false);
});

test("one result below a threshold returns NO-GO and 25.001 never rounds into a pass", () => {
  const sessions = cohort();
  sessions[7].observation.chainExplained = "no";
  const summary = summarizePlaytests(sessions);
  assert.equal(summary.counts.chainExplained, 7);
  assert.equal(summary.counts.firstKillWithin25, 8);
  assert.equal(summary.status, "NO-GO");
});

test("prompted replay, mixed SHA, pilot data, and missing testers cannot produce GO", () => {
  const prompted = cohort();
  prompted[9].observation.replayWasPrompted = "yes";
  assert.equal(summarizePlaytests(prompted).counts.voluntaryReplay, 5);
  assert.equal(summarizePlaytests(prompted).status, "INCOMPLETE");

  const mixed = cohort();
  mixed[9].sourceRevision = "b".repeat(40);
  assert.equal(summarizePlaytests(mixed).status, "INCOMPLETE");
  assert.ok(summarizePlaytests(mixed).errors.includes("mixed source revisions"));

  const pilot = cohort();
  pilot[0].datasetKind = "pilot";
  assert.equal(summarizePlaytests(pilot).status, "INCOMPLETE");
  assert.equal(summarizePlaytests(cohort().slice(0, 9)).status, "INCOMPLETE");
});

test("30.001-second replay, invalid first run, and missing human evidence cannot produce GO", () => {
  const lateReplay = cohort();
  lateReplay[0].runs[0].replayDelaySeconds = 30.001;
  lateReplay[0].runs[0].replayStartedAt = new Date(
    Date.parse(lateReplay[0].runs[0].completedAt) + 30_001,
  ).toISOString();
  lateReplay[0].runs[1].startedAt = lateReplay[0].runs[0].replayStartedAt;
  assert.equal(summarizePlaytests(lateReplay).counts.voluntaryReplay, 4);
  assert.equal(summarizePlaytests(lateReplay).status, "NO-GO");

  const learned = cohort();
  learned[0].runs[0].evidence.source = "replay";
  learned[0].runs[0].evidence.guided = false;
  learned[0].runs[0].evidence.runOrdinal = 2;
  assert.equal(summarizePlaytests(learned).status, "INCOMPLETE");

  const emptyEvidence = cohort();
  emptyEvidence[0].observation.device = "";
  emptyEvidence[0].observation.answers[5] = "";
  assert.equal(summarizePlaytests(emptyEvidence).status, "INCOMPLETE");
});

test("impossible replay chains and an unobserved non-replay window are incomplete", () => {
  const missingReplayRun = cohort();
  missingReplayRun[0].runs.pop();
  assert.equal(summarizePlaytests(missingReplayRun).status, "INCOMPLETE");

  const learnedRestart = cohort();
  learnedRestart[0].runs[1].evidence.source = "start";
  assert.equal(summarizePlaytests(learnedRestart).status, "INCOMPLETE");

  const impossibleTutorial = cohort();
  impossibleTutorial[0].runs[1].evidence.tutorialCompleted = true;
  assert.equal(summarizePlaytests(impossibleTutorial).status, "INCOMPLETE");

  const tooEarly = cohort();
  tooEarly[5].completedAt = new Date(
    Date.parse(tooEarly[5].runs[0].completedAt) + 29_999,
  ).toISOString();
  assert.equal(summarizePlaytests(tooEarly).status, "INCOMPLETE");
});

test("an unrecoverable first-run technical incident remains a complete NO-GO record", () => {
  const sessions = cohort();
  sessions[0].runs = [];
  sessions[0].gameReadyAt = null;
  sessions[0].observation.crashOrProgressBlockers = 1;
  sessions[0].observation.wallTimings = {
    firstInput: "not-reached",
    firstExtract: "not-reached",
    firstFabricate: "not-reached",
    firstAmmo: "not-reached",
    firstDefend: "not-reached",
    firstKill: "not-reached",
    tutorialComplete: "not-reached",
    ninetySecondMark: "not-reached",
  };
  const summary = summarizePlaytests(sessions);
  assert.equal(summary.status, "NO-GO");
  assert.equal(summary.counts.technicalIncidents, 1);
  assert.equal(summary.missing.some((entry) => entry.startsWith("T01: no recorded run")), false);
});

test("duplicate session IDs and contradictory or missing wall observations are incomplete", () => {
  const duplicate = cohort();
  duplicate[1].sessionId = duplicate[0].sessionId;
  assert.ok(summarizePlaytests(duplicate).errors.includes("duplicate session ID"));
  assert.equal(summarizePlaytests(duplicate).status, "INCOMPLETE");

  const missing = cohort();
  missing[0].observation.wallTimings.firstKill = null;
  assert.equal(summarizePlaytests(missing).status, "INCOMPLETE");

  const contradictory = cohort();
  contradictory[0].observation.wallTimings.firstKill = "not-reached";
  assert.equal(summarizePlaytests(contradictory).status, "INCOMPLETE");
});

test("canonical cohort hash is independent of file order", () => {
  const sessions = cohort();
  const forward = summarizePlaytestFiles(sessions);
  const reverse = summarizePlaytestFiles([...sessions].reverse());
  assert.equal(forward.inputSha256, reverse.inputSha256);
  assert.equal(forward.status, "GO");
});

test("invalid JSON is replaced with a private null sentinel without echoing source text", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tri-relay-private-json-"));
  const path = join(directory, "T01.json");
  try {
    writeFileSync(path, '{"answers":["PRIVATE INTERVIEW WORDS"], broken}');
    const values = await readPlaytestFiles([path]);
    assert.deepEqual(values, [null]);
    assert.equal(JSON.stringify(summarizePlaytestFiles(values)).includes("PRIVATE INTERVIEW WORDS"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
