import {
  PLAYTEST_TESTER_IDS,
  isPlaytestReplayWithinWindow,
  parsePlaytestSession,
  type PlaytestSession,
} from "./playtest-session.ts";

export type PlaytestGateStatus = "INCOMPLETE" | "NO-GO" | "GO";

export interface PlaytestGateSummary {
  status: PlaytestGateStatus;
  cohortSize: number;
  sourceRevision: string | null;
  deploymentUrl: string | null;
  errors: string[];
  missing: string[];
  counts: {
    fiveSecondRelay: number;
    fiveSecondInformation: number;
    silhouettes: number;
    chainExplained: number;
    firstKillWithin25: number;
    active90Reached: number;
    voluntaryReplay: number;
    resonanceExplained: number;
    criticalUiIssues: number;
    technicalIncidents: number;
  };
  thresholds: {
    fiveSecondRelay: 8;
    fiveSecondInformation: 8;
    silhouettes: 8;
    chainExplained: 8;
    firstKillWithin25: 8;
    active90Reached: 7;
    voluntaryReplay: 5;
    resonanceExplained: 8;
    criticalUiIssues: 0;
    technicalIncidents: 0;
  };
}

const THRESHOLDS = {
  fiveSecondRelay: 8,
  fiveSecondInformation: 8,
  silhouettes: 8,
  chainExplained: 8,
  firstKillWithin25: 8,
  active90Reached: 7,
  voluntaryReplay: 5,
  resonanceExplained: 8,
  criticalUiIssues: 0,
  technicalIncidents: 0,
} as const;

function unique(values: string[]) {
  return [...new Set(values)];
}

export function summarizePlaytests(input: unknown[]): PlaytestGateSummary {
  const errors: string[] = [];
  const sessions: PlaytestSession[] = [];
  input.forEach((candidate, index) => {
    const parsed = parsePlaytestSession(candidate);
    if (parsed) sessions.push(parsed);
    else errors.push(`input ${index + 1}: invalid v0.4.1 playtest session`);
  });

  const ids = sessions.map((session) => session.testerId);
  if (new Set(ids).size !== ids.length) errors.push("duplicate tester ID");
  const sessionIds = sessions.map((session) => session.sessionId);
  if (new Set(sessionIds).size !== sessionIds.length) errors.push("duplicate session ID");
  if (sessions.length > 10) errors.push("more than the planned first ten sessions supplied");
  const revisions = unique(sessions.map((session) => session.sourceRevision));
  const deployments = unique(sessions.map((session) => session.deploymentUrl));
  const languages = unique(sessions.map((session) => session.language));
  if (revisions.length > 1) errors.push("mixed source revisions");
  if (deployments.length > 1) errors.push("mixed immutable deployments");
  if (languages.length > 1) errors.push("mixed play languages");
  if (sessions.some((session) => session.datasetKind !== "official")) {
    errors.push("pilot data cannot produce an official GO");
  }

  const missing: string[] = [];
  for (const testerId of PLAYTEST_TESTER_IDS) {
    if (!ids.includes(testerId)) missing.push(`${testerId}: missing session`);
  }

  const counts = {
    fiveSecondRelay: 0,
    fiveSecondInformation: 0,
    silhouettes: 0,
    chainExplained: 0,
    firstKillWithin25: 0,
    active90Reached: 0,
    voluntaryReplay: 0,
    resonanceExplained: 0,
    criticalUiIssues: 0,
    technicalIncidents: 0,
  };

  for (const session of sessions) {
    const prefix = session.testerId;
    const observation = session.observation;
    const technicalOnly = !session.runs.length
      && !session.currentRunStartedAt
      && (observation.crashOrProgressBlockers ?? 0) > 0;
    if (session.status !== "complete") missing.push(`${prefix}: session not finalized`);
    if (!session.gameReadyAt && !technicalOnly) missing.push(`${prefix}: game-ready time missing`);
    if (session.currentRunStartedAt) missing.push(`${prefix}: active run not captured`);
    if (!session.runs.length && !(observation.crashOrProgressBlockers && observation.crashOrProgressBlockers > 0)) {
      missing.push(`${prefix}: no recorded run`);
    }
    if (session.viewport.width < 320 || session.viewport.width > 430
      || session.viewport.height < 568 || session.viewport.height > 932
      || session.viewport.width >= session.viewport.height) {
      errors.push(`${prefix}: first-run viewport outside portrait mobile cohort`);
    }
    for (const [field, label] of [
      ["observerCode", "observer code"], ["device", "device"], ["os", "OS"],
      ["browser", "browser"], ["inputMethod", "input method"], ["audioMode", "audio mode"],
      ["similarGameExperience", "similar-game experience"], ["firstLookedAt", "first-look location"],
      ["behaviorNotes", "hesitation/repeated-input record"],
      ["wrongTarget", "wrong-target record"],
    ] as const) {
      if (!observation[field].trim()) missing.push(`${prefix}: ${label} missing`);
    }
    observation.answers.forEach((answer, index) => {
      if (!answer.trim()) missing.push(`${prefix}: interview answer ${index + 1} missing`);
    });
    if (observation.consentConfirmed === "not-recorded") missing.push(`${prefix}: consent not recorded`);
    if (observation.firstTimeConfirmed === "not-recorded") missing.push(`${prefix}: first-time status not recorded`);
    if (observation.externalTesterConfirmed === "not-recorded") missing.push(`${prefix}: external-tester status not recorded`);
    if (observation.assistanceProvided === "not-recorded") missing.push(`${prefix}: assistance status not recorded`);
    if (observation.replayWasPrompted === "not-recorded") missing.push(`${prefix}: replay prompting not recorded`);
    if (observation.criticalUiIssue === "not-recorded") missing.push(`${prefix}: UI incident status not recorded`);
    if (observation.backgroundProgressIssue === "not-recorded") missing.push(`${prefix}: background progress status not recorded`);
    if (observation.chainExplained === "not-recorded") missing.push(`${prefix}: chain assessment not recorded`);
    if (observation.resonanceExplained === "not-recorded") missing.push(`${prefix}: resonance assessment not recorded`);
    if (observation.fiveSecondRelayFound === "not-recorded") missing.push(`${prefix}: five-second relay assessment not recorded`);
    for (const [field, value] of Object.entries(observation.readabilityChecks)) {
      if (value === "not-recorded") missing.push(`${prefix}: readability ${field} not recorded`);
    }
    for (const [field, value] of Object.entries(observation.facilitySilhouettes)) {
      if (value === "not-recorded") missing.push(`${prefix}: facility silhouette ${field} not recorded`);
    }
    for (const [field, value] of Object.entries(observation.enemySilhouettes)) {
      if (value === "not-recorded") missing.push(`${prefix}: enemy silhouette ${field} not recorded`);
    }
    if (observation.crashOrProgressBlockers === null) missing.push(`${prefix}: crash/progress-blocker count not recorded`);
    for (const [field, value] of Object.entries(observation.wallTimings)) {
      if (value === null) missing.push(`${prefix}: observer wall timing ${field} not recorded`);
    }

    if (observation.consentConfirmed === "no") errors.push(`${prefix}: consent not confirmed`);
    if (observation.firstTimeConfirmed === "no") errors.push(`${prefix}: not a first-time tester`);
    if (observation.externalTesterConfirmed === "no") errors.push(`${prefix}: tester is part of development`);
    if (observation.assistanceProvided === "yes") errors.push(`${prefix}: assisted session is outside the standard cohort`);
    if (observation.replayWasPrompted === "yes") errors.push(`${prefix}: replay was prompted`);
    if (observation.protocolDeviation.trim()) errors.push(`${prefix}: protocol deviation recorded`);

    if (observation.fiveSecondRelayFound === "yes") counts.fiveSecondRelay += 1;
    if (Object.values(observation.readabilityChecks).every((value) => value === "yes")) counts.fiveSecondInformation += 1;
    if ([
      ...Object.values(observation.facilitySilhouettes),
      ...Object.values(observation.enemySilhouettes),
    ].every((value) => value === "yes")) counts.silhouettes += 1;
    if (observation.chainExplained === "yes") counts.chainExplained += 1;
    if (observation.criticalUiIssue === "yes") counts.criticalUiIssues += 1;
    counts.technicalIncidents += observation.crashOrProgressBlockers ?? 0;
    if (observation.backgroundProgressIssue === "yes") counts.technicalIncidents += 1;

    const firstRun = session.runs[0];
    if (!firstRun) {
      if (technicalOnly && Object.values(observation.wallTimings).some((value) => typeof value === "number")) {
        errors.push(`${prefix}: technical-only session contains reached observer timings`);
      }
      continue;
    }
    const eligibleFirstRun = firstRun.evidence.source === "start"
      && firstRun.evidence.runOrdinal === 1
      && firstRun.evidence.guided;
    if (!eligibleFirstRun) {
      errors.push(`${prefix}: first recorded run is not guided ordinal-1 start evidence`);
      continue;
    }
    const timingExpectations: Array<[keyof typeof observation.wallTimings, boolean]> = [
      ["firstInput", firstRun.evidence.firstInputWallSeconds !== null],
      ["firstExtract", firstRun.evidence.firstSectorWallSeconds.extract !== null],
      ["firstFabricate", firstRun.evidence.firstSectorWallSeconds.fabricate !== null],
      ["firstAmmo", firstRun.evidence.firstSectorWallSeconds.fabricate !== null],
      ["firstDefend", firstRun.evidence.firstSectorWallSeconds.defend !== null],
      ["firstKill", firstRun.evidence.firstKillSeconds !== null],
      ["tutorialComplete", firstRun.evidence.tutorialCompleted],
    ];
    for (const [field, occurred] of timingExpectations) {
      const timing = observation.wallTimings[field];
      if (timing === null) continue;
      if (occurred !== (typeof timing === "number")) {
        errors.push(`${prefix}: observer wall timing ${field} contradicts automatic evidence`);
      }
    }
    if ((firstRun.evidence.active90Reached || firstRun.evidence.wallSeconds >= 90)
      && typeof observation.wallTimings.ninetySecondMark !== "number") {
      errors.push(`${prefix}: observer 90-second wall mark contradicts automatic evidence`);
    }
    if (firstRun.evidence.firstKillSeconds !== null && firstRun.evidence.firstKillSeconds <= 25) {
      counts.firstKillWithin25 += 1;
    }
    if (firstRun.evidence.active90Reached) counts.active90Reached += 1;
    if (isPlaytestReplayWithinWindow(firstRun) && observation.replayWasPrompted === "no") {
      counts.voluntaryReplay += 1;
    }
    if (firstRun.evidence.wave2Seconds !== null && observation.resonanceExplained === "yes") {
      counts.resonanceExplained += 1;
    }
  }

  const cleanErrors = unique(errors);
  const cleanMissing = unique(missing);
  const passes = counts.fiveSecondRelay >= THRESHOLDS.fiveSecondRelay
    && counts.fiveSecondInformation >= THRESHOLDS.fiveSecondInformation
    && counts.silhouettes >= THRESHOLDS.silhouettes
    && counts.chainExplained >= THRESHOLDS.chainExplained
    && counts.firstKillWithin25 >= THRESHOLDS.firstKillWithin25
    && counts.active90Reached >= THRESHOLDS.active90Reached
    && counts.voluntaryReplay >= THRESHOLDS.voluntaryReplay
    && counts.resonanceExplained >= THRESHOLDS.resonanceExplained
    && counts.criticalUiIssues === 0
    && counts.technicalIncidents === 0;

  const completeCohort = sessions.length === 10
    && cleanErrors.length === 0
    && cleanMissing.length === 0;
  const status: PlaytestGateStatus = !completeCohort
    ? "INCOMPLETE"
    : passes
      ? "GO"
      : "NO-GO";

  return {
    status,
    cohortSize: sessions.length,
    sourceRevision: revisions.length === 1 ? revisions[0] : null,
    deploymentUrl: deployments.length === 1 ? deployments[0] : null,
    errors: cleanErrors,
    missing: cleanMissing,
    counts,
    thresholds: THRESHOLDS,
  };
}
