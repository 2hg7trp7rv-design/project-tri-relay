import type { GameState, Sector } from "./model.ts";
import type { RunEvidenceResult } from "./playtest-metrics.ts";

export const PLAYTEST_RELEASE = "0.4.1";
export const PLAYTEST_PROTOCOL = "V04.1";
export const VOLUNTARY_REPLAY_WINDOW_SECONDS = 30;
export const PLAYTEST_SESSION_KEY = "tri-relay-playtest-session-v1";
export const PLAYTEST_TESTER_IDS = [
  "T01", "T02", "T03", "T04", "T05",
  "T06", "T07", "T08", "T09", "T10",
] as const;

export type PlaytestTesterId = (typeof PLAYTEST_TESTER_IDS)[number];
export type PlaytestDatasetKind = "official" | "pilot";
export type RecordedChoice = "yes" | "no" | "not-recorded";
export type ObservedTiming = number | "not-reached" | null;
export type PlaytestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface PlaytestObservation {
  observerCode: string;
  consentConfirmed: RecordedChoice;
  firstTimeConfirmed: RecordedChoice;
  externalTesterConfirmed: RecordedChoice;
  assistanceProvided: RecordedChoice;
  device: string;
  os: string;
  browser: string;
  inputMethod: string;
  audioMode: string;
  similarGameExperience: string;
  firstLookedAt: string;
  behaviorNotes: string;
  fiveSecondRelayFound: RecordedChoice;
  readabilityChecks: {
    threat: RecordedChoice;
    city: RecordedChoice;
    currentRoute: RecordedChoice;
    nextRoute: RecordedChoice;
    ore: RecordedChoice;
    ammo: RecordedChoice;
  };
  facilitySilhouettes: {
    extract: RecordedChoice;
    fabricate: RecordedChoice;
    defend: RecordedChoice;
  };
  enemySilhouettes: {
    rusher: RecordedChoice;
    sapper: RecordedChoice;
    jammer: RecordedChoice;
    warden: RecordedChoice;
  };
  wrongTarget: string;
  chainExplained: RecordedChoice;
  resonanceExplained: RecordedChoice;
  replayWasPrompted: RecordedChoice;
  criticalUiIssue: RecordedChoice;
  crashOrProgressBlockers: number | null;
  backgroundProgressIssue: RecordedChoice;
  protocolDeviation: string;
  wallTimings: {
    firstInput: ObservedTiming;
    firstExtract: ObservedTiming;
    firstFabricate: ObservedTiming;
    firstAmmo: ObservedTiming;
    firstDefend: ObservedTiming;
    firstKill: ObservedTiming;
    tutorialComplete: ObservedTiming;
    ninetySecondMark: ObservedTiming;
  };
  answers: [string, string, string, string, string, string];
  notes: string;
}

export interface PlaytestRunRecord {
  version: 1;
  recordedAt: string;
  startedAt: string;
  completedAt: string;
  replayStartedAt: string | null;
  replayDelaySeconds: number | null;
  evidence: RunEvidenceResult;
  result: {
    gameSeconds: number;
    wave: number;
    kills: number;
    score: number;
    integrity: number;
    totalPulses: number;
    validPulses: number;
    routeCounts: { extract: number; fabricate: number; defend: number };
    upgrades: string[];
    tutorialStep: number;
    lossCause: string | null;
  };
}

export interface PlaytestSession {
  schemaVersion: 1;
  datasetKind: PlaytestDatasetKind;
  protocolVersion: typeof PLAYTEST_PROTOCOL;
  release: typeof PLAYTEST_RELEASE;
  sessionId: string;
  testerId: PlaytestTesterId;
  status: "active" | "complete";
  startedAt: string;
  gameReadyAt: string | null;
  completedAt: string | null;
  deploymentUrl: string;
  deploymentEnvironment: "production" | "preview" | "development" | "local" | "unknown";
  sourceRevision: string;
  viewport: { width: number; height: number; dpr: number };
  language: "ja" | "en";
  freshStateConfirmed: true;
  currentRunStartedAt: string | null;
  runs: PlaytestRunRecord[];
  observation: PlaytestObservation;
}

const MAX_TEXT = 2_000;
const MAX_RUNS = 6;
const CHOICES = new Set<RecordedChoice>(["yes", "no", "not-recorded"]);
const TESTER_IDS = new Set<string>(PLAYTEST_TESTER_IDS);
const SESSION_KEYS = [
  "schemaVersion", "datasetKind", "protocolVersion", "release", "sessionId",
  "testerId", "status", "startedAt", "gameReadyAt", "completedAt",
  "deploymentUrl", "deploymentEnvironment", "sourceRevision", "viewport", "language",
  "freshStateConfirmed", "currentRunStartedAt", "runs", "observation",
] as const;
const OBSERVATION_KEYS = [
  "observerCode", "consentConfirmed", "firstTimeConfirmed", "externalTesterConfirmed",
  "assistanceProvided", "device", "os", "browser", "inputMethod", "audioMode",
  "similarGameExperience", "firstLookedAt", "behaviorNotes", "fiveSecondRelayFound", "readabilityChecks",
  "facilitySilhouettes", "enemySilhouettes", "wrongTarget", "chainExplained", "resonanceExplained",
  "replayWasPrompted", "criticalUiIssue", "crashOrProgressBlockers",
  "backgroundProgressIssue", "protocolDeviation", "wallTimings", "answers", "notes",
] as const;
const EVIDENCE_KEYS = [
  "source", "runOrdinal", "guided", "activeSeconds", "wallSeconds", "rotations",
  "rotationsPerSecond", "firstInputSeconds", "firstInputWallSeconds",
  "firstSectorSeconds", "firstSectorWallSeconds", "firstKillSeconds",
  "wave2Seconds", "wave2WallSeconds", "tutorialCompleted", "active90Reached",
  "productiveRate", "overloads", "overdrives", "build", "outcome", "wave",
] as const;

export const DEFAULT_PLAYTEST_OBSERVATION: PlaytestObservation = {
  observerCode: "",
  consentConfirmed: "not-recorded",
  firstTimeConfirmed: "not-recorded",
  externalTesterConfirmed: "not-recorded",
  assistanceProvided: "not-recorded",
  device: "",
  os: "",
  browser: "",
  inputMethod: "",
  audioMode: "",
  similarGameExperience: "",
  firstLookedAt: "",
  behaviorNotes: "",
  fiveSecondRelayFound: "not-recorded",
  readabilityChecks: {
    threat: "not-recorded",
    city: "not-recorded",
    currentRoute: "not-recorded",
    nextRoute: "not-recorded",
    ore: "not-recorded",
    ammo: "not-recorded",
  },
  facilitySilhouettes: {
    extract: "not-recorded",
    fabricate: "not-recorded",
    defend: "not-recorded",
  },
  enemySilhouettes: {
    rusher: "not-recorded",
    sapper: "not-recorded",
    jammer: "not-recorded",
    warden: "not-recorded",
  },
  wrongTarget: "",
  chainExplained: "not-recorded",
  resonanceExplained: "not-recorded",
  replayWasPrompted: "not-recorded",
  criticalUiIssue: "not-recorded",
  crashOrProgressBlockers: null,
  backgroundProgressIssue: "not-recorded",
  protocolDeviation: "",
  wallTimings: {
    firstInput: null,
    firstExtract: null,
    firstFabricate: null,
    firstAmmo: null,
    firstDefend: null,
    firstKill: null,
    tutorialComplete: null,
    ninetySecondMark: null,
  },
  answers: ["", "", "", "", "", ""],
  notes: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}

function finite(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return finite(value, minimum, maximum) && Number.isInteger(value);
}

function boundedString(value: unknown, maximum = MAX_TEXT): value is string {
  return typeof value === "string" && value.length <= maximum;
}

function isoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function nullableIsoDate(value: unknown): value is string | null {
  return value === null || isoDate(value);
}

function nullableTiming(value: unknown): value is number | null {
  return value === null || finite(value, 0, 43_200);
}

function observedTiming(value: unknown): value is ObservedTiming {
  return value === null || value === "not-reached" || finite(value, 0, 43_200);
}

function choice(value: unknown): value is RecordedChoice {
  return typeof value === "string" && CHOICES.has(value as RecordedChoice);
}

function choiceRecord(value: unknown, keys: readonly string[]) {
  return isRecord(value) && hasOnlyKeys(value, keys) && keys.every((key) => choice(value[key]));
}

export function isImmutableVercelDeploymentUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.endsWith(".vercel.app")
      && url.hostname.length > ".vercel.app".length
      && (url.pathname === "/" || url.pathname === "")
      && !url.search
      && !url.hash
      && !url.username
      && !url.password
      && !url.port;
  } catch {
    return false;
  }
}

function validateSectorTimings(value: unknown): value is Record<Sector, number | null> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["extract", "fabricate", "defend"])) return false;
  return ["extract", "fabricate", "defend"].every((sector) => nullableTiming(value[sector]));
}

function timingWithin(value: unknown, ceiling: number) {
  return value === null || (typeof value === "number" && value <= ceiling + 0.02);
}

function validateEvidence(value: unknown): value is RunEvidenceResult {
  if (!isRecord(value) || !hasOnlyKeys(value, EVIDENCE_KEYS)) return false;
  if (!(value.source === "start" || value.source === "replay" || value.source === "checkpoint")) return false;
  if (!integer(value.runOrdinal, 1, 10_000) || typeof value.guided !== "boolean") return false;
  if (!finite(value.activeSeconds, 0, 43_200) || !finite(value.wallSeconds, 0, 43_200)) return false;
  if (value.wallSeconds + 0.02 < value.activeSeconds) return false;
  if (!integer(value.rotations, 0, 10_000_000) || !finite(value.rotationsPerSecond, 0, 10_000)) return false;
  if (!finite(value.productiveRate, 0, 1)) return false;
  if (!integer(value.overloads, 0, 10_000_000) || !integer(value.overdrives, 0, 10_000_000)) return false;
  if (!integer(value.wave, 1, 100)) return false;
  if (!nullableTiming(value.firstInputSeconds) || !nullableTiming(value.firstInputWallSeconds)) return false;
  if (!nullableTiming(value.firstKillSeconds) || !nullableTiming(value.wave2Seconds) || !nullableTiming(value.wave2WallSeconds)) return false;
  if (!validateSectorTimings(value.firstSectorSeconds) || !validateSectorTimings(value.firstSectorWallSeconds)) return false;
  if (typeof value.tutorialCompleted !== "boolean" || typeof value.active90Reached !== "boolean") return false;
  if (!value.guided && value.tutorialCompleted) return false;
  if (!(value.build === "extract" || value.build === "fabricate" || value.build === "defend" || value.build === "mixed")) return false;
  if (!(value.outcome === "won" || value.outcome === "lost" || value.outcome === "incomplete")) return false;
  if (!timingWithin(value.firstInputSeconds, value.activeSeconds)
    || !timingWithin(value.firstInputWallSeconds, value.wallSeconds)
    || !timingWithin(value.firstKillSeconds, value.activeSeconds)
    || !timingWithin(value.wave2Seconds, value.activeSeconds)
    || !timingWithin(value.wave2WallSeconds, value.wallSeconds)) return false;
  for (const sector of ["extract", "fabricate", "defend"] as const) {
    if (!timingWithin(value.firstSectorSeconds[sector], value.activeSeconds)
      || !timingWithin(value.firstSectorWallSeconds[sector], value.wallSeconds)) return false;
    if ((value.firstSectorSeconds[sector] === null) !== (value.firstSectorWallSeconds[sector] === null)) return false;
  }
  if ((value.firstInputSeconds === null) !== (value.firstInputWallSeconds === null)) return false;
  if ((value.wave2Seconds === null) !== (value.wave2WallSeconds === null)) return false;
  if ((value.wave >= 2) !== (value.wave2Seconds !== null)) return false;
  return value.active90Reached ? value.activeSeconds >= 90 : value.activeSeconds <= 90;
}

function validateObservation(value: unknown): value is PlaytestObservation {
  if (!isRecord(value) || !hasOnlyKeys(value, OBSERVATION_KEYS)) return false;
  const textFields = [
    "observerCode", "device", "os", "browser", "inputMethod", "audioMode",
    "similarGameExperience", "firstLookedAt", "behaviorNotes", "wrongTarget", "protocolDeviation", "notes",
  ];
  if (!textFields.every((field) => boundedString(value[field]))) return false;
  const choiceFields = [
    "consentConfirmed", "firstTimeConfirmed", "externalTesterConfirmed", "assistanceProvided",
    "fiveSecondRelayFound", "chainExplained", "resonanceExplained", "replayWasPrompted", "criticalUiIssue",
    "backgroundProgressIssue",
  ];
  if (!choiceFields.every((field) => choice(value[field]))) return false;
  if (!choiceRecord(value.readabilityChecks, ["threat", "city", "currentRoute", "nextRoute", "ore", "ammo"])) return false;
  if (!choiceRecord(value.facilitySilhouettes, ["extract", "fabricate", "defend"])) return false;
  if (!choiceRecord(value.enemySilhouettes, ["rusher", "sapper", "jammer", "warden"])) return false;
  if (!(value.crashOrProgressBlockers === null || integer(value.crashOrProgressBlockers, 0, 100))) return false;
  const wallTimings = value.wallTimings;
  if (!isRecord(wallTimings) || !hasOnlyKeys(wallTimings, [
    "firstInput", "firstExtract", "firstFabricate", "firstAmmo",
    "firstDefend", "firstKill", "tutorialComplete", "ninetySecondMark",
  ])) return false;
  const timingFields = [
    "firstInput", "firstExtract", "firstFabricate", "firstAmmo",
    "firstDefend", "firstKill", "tutorialComplete", "ninetySecondMark",
  ];
  if (!timingFields.every((field) => observedTiming(wallTimings[field]))) return false;
  return Array.isArray(value.answers)
    && value.answers.length === 6
    && value.answers.every((answer) => boundedString(answer));
}

function validateRun(value: unknown): value is PlaytestRunRecord {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "version", "recordedAt", "startedAt", "completedAt", "replayStartedAt", "replayDelaySeconds", "evidence", "result",
  ]) || value.version !== 1) return false;
  if (!isoDate(value.recordedAt) || !isoDate(value.startedAt) || !isoDate(value.completedAt)) return false;
  if (!nullableIsoDate(value.replayStartedAt) || !nullableTiming(value.replayDelaySeconds) || !validateEvidence(value.evidence)) return false;
  if ((value.replayStartedAt === null) !== (value.replayDelaySeconds === null)) return false;
  if (value.evidence.outcome === "incomplete" && value.replayStartedAt !== null) return false;
  const startedAt = Date.parse(value.startedAt);
  const completedAt = Date.parse(value.completedAt);
  const recordedAt = Date.parse(value.recordedAt);
  if (startedAt > completedAt || completedAt > recordedAt) return false;
  if ((value.evidence as RunEvidenceResult).wallSeconds > (completedAt - startedAt) / 1_000 + 0.05) return false;
  if (value.replayStartedAt !== null && Date.parse(value.replayStartedAt) < completedAt) return false;
  if (value.replayStartedAt !== null && value.replayDelaySeconds !== null
    && Math.abs((Date.parse(value.replayStartedAt) - completedAt) / 1_000 - value.replayDelaySeconds) > 1) return false;
  const result = value.result;
  if (!isRecord(result) || !hasOnlyKeys(result, [
    "gameSeconds", "wave", "kills", "score", "integrity", "totalPulses", "validPulses",
    "routeCounts", "upgrades", "tutorialStep", "lossCause",
  ])) return false;
  if (!finite(result.gameSeconds, 0, 43_200) || !integer(result.wave, 1, 100)) return false;
  if (!integer(result.kills, 0, 100_000_000) || !finite(result.score, 0, 100_000_000)) return false;
  if (!finite(result.integrity, 0, 100_000_000)) return false;
  if (!integer(result.totalPulses, 0, 100_000_000) || !integer(result.validPulses, 0, 100_000_000)) return false;
  if (result.validPulses > result.totalPulses || !integer(result.tutorialStep, 0, 3)) return false;
  if (result.wave !== value.evidence.wave) return false;
  if ((result.kills > 0) !== (value.evidence.firstKillSeconds !== null)) return false;
  const routeCounts = result.routeCounts;
  if (!isRecord(routeCounts) || !hasOnlyKeys(routeCounts, ["extract", "fabricate", "defend"])) return false;
  if (!["extract", "fabricate", "defend"].every((route) => integer(routeCounts[route], 0, 10_000_000))) return false;
  if (!Array.isArray(result.upgrades) || result.upgrades.length > 24 || !result.upgrades.every((id) => boundedString(id, 80))) return false;
  if (new Set(result.upgrades).size !== result.upgrades.length) return false;
  return result.lossCause === null || boundedString(result.lossCause, 80);
}

export function isPlaytestTesterId(value: unknown): value is PlaytestTesterId {
  return typeof value === "string" && TESTER_IDS.has(value);
}

export function parsePlaytestSession(value: unknown): PlaytestSession | null {
  if (!isRecord(value) || !hasOnlyKeys(value, SESSION_KEYS) || value.schemaVersion !== 1) return null;
  if (!(value.datasetKind === "official" || value.datasetKind === "pilot")) return null;
  if (value.protocolVersion !== PLAYTEST_PROTOCOL || value.release !== PLAYTEST_RELEASE) return null;
  if (!boundedString(value.sessionId, 80) || !/^[a-zA-Z0-9-]{16,80}$/.test(value.sessionId)) return null;
  if (!isPlaytestTesterId(value.testerId) || !(value.status === "active" || value.status === "complete")) return null;
  if (!isoDate(value.startedAt) || !nullableIsoDate(value.gameReadyAt) || !nullableIsoDate(value.completedAt)) return null;
  if (!boundedString(value.deploymentUrl, 300) || !boundedString(value.sourceRevision, 64)) return null;
  if (!(value.deploymentEnvironment === "production"
    || value.deploymentEnvironment === "preview"
    || value.deploymentEnvironment === "development"
    || value.deploymentEnvironment === "local"
    || value.deploymentEnvironment === "unknown")) return null;
  if (!isRecord(value.viewport)
    || !integer(value.viewport.width, 1, 20_000)
    || !integer(value.viewport.height, 1, 20_000)
    || !finite(value.viewport.dpr, 0.1, 20)) return null;
  if (!(value.language === "ja" || value.language === "en") || value.freshStateConfirmed !== true) return null;
  if (!nullableIsoDate(value.currentRunStartedAt)) return null;
  if (!Array.isArray(value.runs) || value.runs.length > MAX_RUNS || !value.runs.every(validateRun)) return null;
  if (!validateObservation(value.observation)) return null;
  if (value.datasetKind === "official"
    && (!/^[0-9a-f]{40}$/i.test(value.sourceRevision)
      || value.deploymentEnvironment !== "production"
      || !isImmutableVercelDeploymentUrl(value.deploymentUrl))) return null;
  const startedAt = Date.parse(value.startedAt);
  const gameReadyAt = value.gameReadyAt === null ? null : Date.parse(value.gameReadyAt);
  const completedAt = value.completedAt === null ? null : Date.parse(value.completedAt);
  const currentRunStartedAt = value.currentRunStartedAt === null ? null : Date.parse(value.currentRunStartedAt);
  if (gameReadyAt !== null && gameReadyAt < startedAt) return null;
  if (value.status === "active" && completedAt !== null) return null;
  const technicalOnlyCompletion = value.runs.length === 0
    && value.currentRunStartedAt === null
    && (value.observation as PlaytestObservation).crashOrProgressBlockers !== null
    && ((value.observation as PlaytestObservation).crashOrProgressBlockers ?? 0) > 0;
  if (value.status === "complete"
    && (completedAt === null || value.currentRunStartedAt !== null || (gameReadyAt === null && !technicalOnlyCompletion))) return null;
  if (completedAt !== null && completedAt < (gameReadyAt ?? startedAt)) return null;
  if (currentRunStartedAt !== null && currentRunStartedAt < startedAt) return null;
  const runs = value.runs as unknown as PlaytestRunRecord[];
  const technicalIncidentRecorded = ((value.observation as PlaytestObservation).crashOrProgressBlockers ?? 0) > 0;
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    if (Date.parse(run.startedAt) < (gameReadyAt ?? startedAt)) return null;
    if (completedAt !== null && Date.parse(run.recordedAt) > completedAt) return null;
    if (completedAt !== null && run.replayStartedAt !== null && Date.parse(run.replayStartedAt) > completedAt) return null;
    if (index > 0) {
      const previous = runs[index - 1];
      if (previous.replayStartedAt !== run.startedAt
        || run.evidence.source !== "replay"
        || run.evidence.guided
        || run.evidence.runOrdinal !== previous.evidence.runOrdinal + 1) return null;
      if (Date.parse(run.recordedAt) < Date.parse(previous.recordedAt)) return null;
    }
    if (run.replayStartedAt !== null && index === runs.length - 1) {
      const replayIsStillActive = currentRunStartedAt !== null
        && run.replayStartedAt === value.currentRunStartedAt;
      if (!replayIsStillActive && !technicalIncidentRecorded) return null;
    }
  }
  if (value.status === "complete" && runs[0] && !technicalIncidentRecorded
    && runs[0].replayStartedAt === null
    && completedAt! - Date.parse(runs[0].completedAt) < VOLUNTARY_REPLAY_WINDOW_SECONDS * 1_000) return null;
  return value as unknown as PlaytestSession;
}

export function getPlaytestReplayDelaySeconds(run: PlaytestRunRecord) {
  return run.replayDelaySeconds;
}

export function isPlaytestReplayWithinWindow(run: PlaytestRunRecord) {
  const seconds = getPlaytestReplayDelaySeconds(run);
  return seconds !== null && seconds <= VOLUNTARY_REPLAY_WINDOW_SECONDS;
}

export function getPlaytestCompletionIssues(session: PlaytestSession, at = new Date()) {
  const issues: string[] = [];
  const observation = session.observation;
  const technicalOnly = !session.runs.length
    && !session.currentRunStartedAt
    && (observation.crashOrProgressBlockers ?? 0) > 0;
  if (!session.gameReadyAt && !technicalOnly) issues.push("ゲーム開始記録");
  if (!session.runs.length && !technicalOnly) issues.push("ラン記録");
  if (session.currentRunStartedAt) issues.push("進行中ランの確定");
  const firstRun = session.runs[0];
  if (firstRun && !firstRun.replayStartedAt && !observation.crashOrProgressBlockers
    && at.getTime() - Date.parse(firstRun.completedAt) < VOLUNTARY_REPLAY_WINDOW_SECONDS * 1_000) {
    issues.push("結果画面30秒観察");
  }
  if (session.runs.some((run, index) => run.replayStartedAt && !session.runs[index + 1])
    && !session.currentRunStartedAt && !observation.crashOrProgressBlockers) {
    issues.push("再挑戦ランの確定");
  }
  for (const [field, label] of [
    ["observerCode", "観察者コード"], ["device", "端末"], ["os", "OS"],
    ["browser", "ブラウザ"], ["inputMethod", "入力方法"], ["audioMode", "音声状態"],
    ["similarGameExperience", "類似ゲーム経験"], ["firstLookedAt", "最初に見た場所"],
    ["behaviorNotes", "迷い・連打・長時間読解（なしを含む）"],
    ["wrongTarget", "誤操作対象（なしを含む）"],
  ] as const) {
    if (!observation[field].trim()) issues.push(label);
  }
  for (const [field, label] of [
    ["consentConfirmed", "同意確認"], ["firstTimeConfirmed", "初見確認"],
    ["externalTesterConfirmed", "外部テスター確認"], ["assistanceProvided", "操作補助"],
    ["fiveSecondRelayFound", "5秒リレー"], ["chainExplained", "基本連鎖"],
    ["resonanceExplained", "W2共鳴"], ["replayWasPrompted", "再挑戦の促し"],
    ["criticalUiIssue", "重要UI妨害"], ["backgroundProgressIssue", "バックグラウンド進行"],
  ] as const) {
    if (observation[field] === "not-recorded") issues.push(label);
  }
  for (const [field, label] of [
    ["threat", "脅威"], ["city", "都市"], ["currentRoute", "現在経路"],
    ["nextRoute", "次経路"], ["ore", "鉱石"], ["ammo", "弾薬"],
  ] as const) {
    if (observation.readabilityChecks[field] === "not-recorded") issues.push(`重要情報・${label}`);
  }
  for (const [field, label] of [
    ["extract", "採掘設備"], ["fabricate", "製造設備"], ["defend", "防衛設備"],
  ] as const) {
    if (observation.facilitySilhouettes[field] === "not-recorded") issues.push(label);
  }
  for (const [field, label] of [
    ["rusher", "ラッシャー"], ["sapper", "サッパー"],
    ["jammer", "ジャマー"], ["warden", "ウォーデン"],
  ] as const) {
    if (observation.enemySilhouettes[field] === "not-recorded") issues.push(`敵・${label}`);
  }
  if (observation.crashOrProgressBlockers === null) issues.push("クラッシュ／進行不能件数");
  for (const [field, label] of [
    ["firstInput", "最初の入力"], ["firstExtract", "最初の採掘"],
    ["firstFabricate", "最初の製造"], ["firstAmmo", "最初の弾薬生成"],
    ["firstDefend", "最初の防衛"], ["firstKill", "最初の撃破"],
    ["tutorialComplete", "チュートリアル完了"], ["ninetySecondMark", "壁時計90秒地点"],
  ] as const) {
    if (observation.wallTimings[field] === null) issues.push(`観察者壁時計・${label}`);
  }
  observation.answers.forEach((answer, index) => {
    if (!answer.trim()) issues.push(`終了後回答${index + 1}`);
  });
  return issues;
}

export function safeReadPlaytestSession(storage: PlaytestStorage | null): PlaytestSession | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PLAYTEST_SESSION_KEY);
    if (!raw) return null;
    const parsed = parsePlaytestSession(JSON.parse(raw));
    if (parsed) return parsed;
    storage.removeItem(PLAYTEST_SESSION_KEY);
  } catch {
    try { storage.removeItem(PLAYTEST_SESSION_KEY); } catch { /* blocked storage */ }
  }
  return null;
}

function writeSession(session: PlaytestSession, storage: PlaytestStorage | null) {
  if (!storage || !parsePlaytestSession(session)) return false;
  try {
    storage.setItem(PLAYTEST_SESSION_KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

function mutateSession(
  sessionId: string,
  storage: PlaytestStorage | null,
  recipe: (session: PlaytestSession) => PlaytestSession | null,
) {
  const current = safeReadPlaytestSession(storage);
  if (!current || current.sessionId !== sessionId || current.status !== "active") return null;
  const next = recipe(current);
  if (!next) return null;
  return writeSession(next, storage) ? next : null;
}

function newSessionId(randomUUID?: () => string) {
  const generated = randomUUID?.()
    ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : "");
  if (/^[a-zA-Z0-9-]{16,80}$/.test(generated)) return generated;
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}

export function createPlaytestSession(options: {
  datasetKind: PlaytestDatasetKind;
  testerId: PlaytestTesterId;
  deploymentUrl: string;
  deploymentEnvironment: PlaytestSession["deploymentEnvironment"];
  sourceRevision: string;
  viewport: { width: number; height: number; dpr: number };
  language: "ja" | "en";
  storage: PlaytestStorage | null;
  initialObservation?: PlaytestObservation;
  now?: () => Date;
  randomUUID?: () => string;
}) {
  const now = options.now?.() ?? new Date();
  const session: PlaytestSession = {
    schemaVersion: 1,
    datasetKind: options.datasetKind,
    protocolVersion: PLAYTEST_PROTOCOL,
    release: PLAYTEST_RELEASE,
    sessionId: newSessionId(options.randomUUID),
    testerId: options.testerId,
    status: "active",
    startedAt: now.toISOString(),
    gameReadyAt: null,
    completedAt: null,
    deploymentUrl: options.deploymentUrl.slice(0, 300),
    deploymentEnvironment: options.deploymentEnvironment,
    sourceRevision: options.sourceRevision.slice(0, 64),
    viewport: {
      width: Math.max(1, Math.round(options.viewport.width)),
      height: Math.max(1, Math.round(options.viewport.height)),
      dpr: Math.max(0.1, Math.min(20, options.viewport.dpr)),
    },
    language: options.language,
    freshStateConfirmed: true,
    currentRunStartedAt: null,
    runs: [],
    observation: structuredClone(options.initialObservation ?? DEFAULT_PLAYTEST_OBSERVATION),
  };
  return writeSession(session, options.storage) ? session : null;
}

export function getPlaytestSessionToken(hash: string) {
  const match = hash.match(/^#playtest=([a-zA-Z0-9-]{16,80})$/);
  return match?.[1] ?? null;
}

export function markPlaytestGameReady(sessionId: string, storage: PlaytestStorage | null, at = new Date()) {
  return mutateSession(sessionId, storage, (session) => session.gameReadyAt
    ? session
    : { ...session, gameReadyAt: at.toISOString() });
}

export function beginPlaytestRun(
  sessionId: string,
  storage: PlaytestStorage | null,
  options: {
    source: "opening" | "replay";
    at?: Date;
    replayDelaySeconds?: number;
    viewport: { width: number; height: number; dpr: number };
    language: "ja" | "en";
  },
) {
  const at = options.at ?? new Date();
  return mutateSession(sessionId, storage, (session) => {
    if (!session.gameReadyAt || session.currentRunStartedAt) return null;
    if (options.source === "opening" && session.runs.length > 0) return null;
    if (options.source === "replay" && session.runs.length >= MAX_RUNS) return null;
    if (session.datasetKind === "official"
      && (options.viewport.width < 320 || options.viewport.width > 430
        || options.viewport.height < 568 || options.viewport.height > 932
        || options.viewport.width >= options.viewport.height
        || options.language !== session.language)) return null;
    let runs = session.runs;
    if (options.source === "replay") {
      const delay = options.replayDelaySeconds;
      const lastRun = runs.at(-1);
      if (!lastRun || !Number.isFinite(delay) || (delay ?? -1) < 0 || (delay ?? 43_201) > 43_200
        || lastRun.evidence.outcome === "incomplete" || lastRun.replayStartedAt) return null;
      runs = runs.map((run, index) => index === runs.length - 1
        ? {
            ...run,
            replayStartedAt: at.toISOString(),
            replayDelaySeconds: Math.ceil((delay as number) * 1_000) / 1_000,
          }
        : run);
    }
    return {
      ...session,
      runs,
      currentRunStartedAt: at.toISOString(),
      ...(session.runs.length === 0 ? {
        viewport: {
          width: Math.max(1, Math.min(20_000, Math.round(options.viewport.width))),
          height: Math.max(1, Math.min(20_000, Math.round(options.viewport.height))),
          dpr: Math.max(0.1, Math.min(20, options.viewport.dpr)),
        },
        language: options.language,
      } : {}),
    };
  });
}

export function closeUnrecoverablePlaytestRun(
  sessionId: string,
  storage: PlaytestStorage | null,
) {
  return mutateSession(sessionId, storage, (session) => {
    if (!session.currentRunStartedAt || !session.observation.crashOrProgressBlockers) return session;
    return { ...session, currentRunStartedAt: null };
  });
}

function summarizeState(state: GameState) {
  return {
    gameSeconds: Math.max(0, state.clock),
    wave: state.waveIndex + 1,
    kills: state.kills,
    score: state.score,
    integrity: state.integrity,
    totalPulses: state.totalPulses,
    validPulses: state.validPulses,
    routeCounts: {
      extract: state.extractCount,
      fabricate: state.fabricateCount,
      defend: state.defendCount,
    },
    upgrades: [...state.upgrades],
    tutorialStep: state.tutorialStep,
    lossCause: state.lossCause?.enemyKind ?? null,
  };
}

export function recordPlaytestRun(
  sessionId: string,
  evidence: RunEvidenceResult,
  state: GameState,
  storage: PlaytestStorage | null,
  at = new Date(),
) {
  return mutateSession(sessionId, storage, (session) => {
    if (!session.currentRunStartedAt) return null;
    if (session.runs.some((run) => run.evidence.runOrdinal === evidence.runOrdinal)) return null;
    const startedAt = session.currentRunStartedAt;
    const record: PlaytestRunRecord = {
      version: 1,
      recordedAt: at.toISOString(),
      startedAt,
      completedAt: at.toISOString(),
      replayStartedAt: null,
      replayDelaySeconds: null,
      evidence: structuredClone(evidence),
      result: summarizeState(state),
    };
    if (session.runs.length >= MAX_RUNS) return null;
    const runs = [...session.runs, record];
    return { ...session, currentRunStartedAt: null, runs };
  });
}

export function savePlaytestObservation(
  sessionId: string,
  observation: PlaytestObservation,
  storage: PlaytestStorage | null,
) {
  if (!validateObservation(observation)) return null;
  return mutateSession(sessionId, storage, (session) => {
    const next = structuredClone(observation);
    next.protocolDeviation = mergeProtocolDeviation(
      session.observation.protocolDeviation,
      next.protocolDeviation,
    );
    return { ...session, observation: next };
  });
}

function mergeProtocolDeviation(existingValue: string, incomingValue: string) {
  const existing = existingValue.trim();
  const incoming = incomingValue.trim();
  if (!existing) return incoming.slice(0, MAX_TEXT);
  if (!incoming || existing.includes(incoming)) return existing;
  if (incoming.includes(existing)) return incoming.slice(0, MAX_TEXT);
  return `${existing}; ${incoming}`.slice(0, MAX_TEXT);
}

export function recordPlaytestProtocolDeviation(
  sessionId: string,
  reason: string,
  storage: PlaytestStorage | null,
) {
  const normalized = reason.trim().slice(0, 500);
  if (!normalized) return null;
  return mutateSession(sessionId, storage, (session) => {
    const protocolDeviation = mergeProtocolDeviation(
      session.observation.protocolDeviation,
      normalized,
    );
    return {
      ...session,
      observation: { ...session.observation, protocolDeviation },
    };
  });
}

export function completePlaytestSession(sessionId: string, storage: PlaytestStorage | null, at = new Date()) {
  return mutateSession(sessionId, storage, (session) => {
    if (session.currentRunStartedAt) return null;
    const firstRun = session.runs[0];
    const technicalIncidentRecorded = (session.observation.crashOrProgressBlockers ?? 0) > 0;
    if (firstRun && !firstRun.replayStartedAt && !technicalIncidentRecorded
      && at.getTime() - Date.parse(firstRun.completedAt) < VOLUNTARY_REPLAY_WINDOW_SECONDS * 1_000) return null;
    if (session.runs.some((run, index) => run.replayStartedAt && !session.runs[index + 1])
      && !technicalIncidentRecorded) return null;
    return {
      ...session,
      status: "complete",
      completedAt: at.toISOString(),
    };
  });
}

export function clearPlaytestSession(storage: PlaytestStorage | null) {
  try {
    storage?.removeItem(PLAYTEST_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

export function serializePlaytestSession(session: PlaytestSession) {
  const validated = parsePlaytestSession(session);
  if (!validated) return null;
  return `${JSON.stringify(validated, null, 2)}\n`;
}
