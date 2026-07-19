import { cloneGameState, GAME_LIMITS } from "./engine.ts";
import {
  ENEMY_STATS,
  SECTORS,
  UPGRADES,
  WAVES,
  type EnemyKind,
  type GamePhase,
  type GameState,
  type Sector,
} from "./model.ts";
import type { RunEvidenceSnapshot } from "./playtest-metrics.ts";

export type Language = "ja" | "en";

export interface Profile {
  version: 2;
  runs: number;
  wins: number;
  bestWave: number;
  bestScore: number;
  muted: boolean;
  language: Language;
  tutorialCompleted: boolean;
}

export interface RestoredActiveRun {
  state: GameState;
  evidence: RunEvidenceSnapshot | null;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const PROFILE_KEY = "tri-relay-profile-v2";
export const LEGACY_PROFILE_KEY = "tri-relay-profile-v1";
export const ACTIVE_RUN_KEY = "tri-relay-active-run-v4";
export const LEGACY_ACTIVE_RUN_KEYS = [
  "tri-relay-active-run-v3",
  "tri-relay-active-run-v2",
] as const;

const ACTIVE_RUN_VERSION = 4;
const MAX_CHECKPOINT_AGE_MS = 12 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const MAX_RUN_SECONDS = 12 * 60 * 60;
const UPGRADE_IDS = new Set(UPGRADES.map((entry) => entry.id));

export const DEFAULT_PROFILE: Profile = {
  version: 2,
  runs: 0,
  wins: 0,
  bestWave: 0,
  bestScore: 0,
  muted: false,
  language: "ja",
  tutorialCompleted: false,
};

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function integer(value: unknown, minimum: number, maximum: number) {
  return finite(value, minimum, maximum) && Number.isInteger(value);
}

function bool(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function sector(value: unknown): value is Sector {
  return typeof value === "string" && (SECTORS as readonly string[]).includes(value);
}

function enemyKind(value: unknown): value is EnemyKind {
  return typeof value === "string" && Object.hasOwn(ENEMY_STATS, value);
}

function resumablePhase(value: unknown): value is GamePhase {
  return value === "playing" || value === "intermission" || value === "upgrade" || value === "paused";
}

function sanitizeCount(value: unknown, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(maximum, Math.floor(value)));
}

function sanitizeProfile(value: unknown, legacy: boolean): Profile | null {
  if (!isRecord(value)) return null;
  if (legacy) {
    // Very early local builds omitted the version field; v0.3 wrote version 1.
    if (value.version !== undefined && value.version !== 1) return null;
  } else if (value.version !== 2) {
    return null;
  }
  const runs = sanitizeCount(value.runs, 9_999);
  const profile: Profile = {
    version: 2,
    runs,
    wins: sanitizeCount(value.wins, 9_999),
    bestWave: sanitizeCount(value.bestWave, WAVES.length),
    bestScore: sanitizeCount(value.bestScore, 99_999_999),
    muted: value.muted === true,
    language: value.language === "en" ? "en" : "ja",
    // v0.3 treated every run after the first as unguided. Preserve that
    // behavior when migrating instead of unexpectedly locking a returning
    // player into onboarding again.
    tutorialCompleted: legacy ? runs > 0 : value.tutorialCompleted === true,
  };
  profile.wins = Math.min(profile.wins, profile.runs);
  return profile;
}

function removeQuietly(storage: StorageLike, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Storage can be blocked between reads in private/embedded contexts.
  }
}

export function safeReadProfile(storage: StorageLike | null = browserStorage()): Profile {
  if (!storage) return { ...DEFAULT_PROFILE };
  let currentRaw: string | null = null;
  try {
    currentRaw = storage.getItem(PROFILE_KEY);
  } catch {
    return { ...DEFAULT_PROFILE };
  }
  if (currentRaw) {
    try {
      const current = sanitizeProfile(JSON.parse(currentRaw), false);
      if (current) return current;
    } catch {
      // Fall through to the legacy record after retiring corrupt v2 JSON.
    }
    removeQuietly(storage, PROFILE_KEY);
  }

  let legacyRaw: string | null = null;
  try {
    legacyRaw = storage.getItem(LEGACY_PROFILE_KEY);
  } catch {
    return { ...DEFAULT_PROFILE };
  }
  if (!legacyRaw) return { ...DEFAULT_PROFILE };
  try {
    const migrated = sanitizeProfile(JSON.parse(legacyRaw), true);
    if (!migrated) {
      removeQuietly(storage, LEGACY_PROFILE_KEY);
      return { ...DEFAULT_PROFILE };
    }
    if (safeWriteProfile(migrated, storage)) removeQuietly(storage, LEGACY_PROFILE_KEY);
    return migrated;
  } catch {
    removeQuietly(storage, LEGACY_PROFILE_KEY);
    return { ...DEFAULT_PROFILE };
  }
}

export function safeWriteProfile(
  profile: Profile,
  storage: StorageLike | null = browserStorage(),
) {
  if (!storage) return false;
  const sanitized = sanitizeProfile(profile, false);
  if (!sanitized) return false;
  try {
    storage.setItem(PROFILE_KEY, JSON.stringify(sanitized));
    return true;
  } catch {
    // Profile state is a convenience; play must remain offline-capable.
    return false;
  }
}

function validId(value: unknown) {
  return integer(value, 1, Number.MAX_SAFE_INTEGER);
}

function validateTransit(value: unknown, ids: Set<number>) {
  if (!isRecord(value) || !validId(value.id) || ids.has(value.id as number)) return false;
  if (!sector(value.sector) || !sector(value.affinity)) return false;
  if (!finite(value.progress, 0, 1.1) || !finite(value.multiplier, 0, 10)) return false;
  if (!bool(value.matched) || !bool(value.overdrive) || !bool(value.jammed)) return false;
  if (!finite(value.loadMultiplier, 0, 10) || !finite(value.heatAfter, 0, 100)) return false;
  if (!bool(value.urgent) || !bool(value.targetReady)) return false;
  ids.add(value.id as number);
  return true;
}

function validateEnemy(value: unknown, ids: Set<number>) {
  if (!isRecord(value) || !validId(value.id) || ids.has(value.id as number)) return false;
  if (!enemyKind(value.kind)) return false;
  if (!finite(value.maxHp, 0.01, 100_000) || !finite(value.hp, 0, value.maxHp as number)) return false;
  if (!finite(value.progress, 0, 1.1) || !finite(value.speed, 0.000_001, 10)) return false;
  if (!finite(value.breachDamage, 0, 100) || !integer(value.track, 0, 2)) return false;
  for (const name of ["spawnedAt", "abilityAt", "nextAbilityAt", "stunnedUntil", "flashUntil"] as const) {
    if (!finite(value[name], 0, MAX_RUN_SECONDS + 3_600)) return false;
  }
  if (!bool(value.abilityUsed)) return false;
  ids.add(value.id as number);
  return true;
}

function validateJam(value: unknown, ids: Set<number>) {
  if (!isRecord(value) || !validId(value.id) || ids.has(value.id as number)) return false;
  if (!sector(value.sector) || !enemyKind(value.source)) return false;
  if (!finite(value.warningUntil, 0, MAX_RUN_SECONDS + 3_600)) return false;
  if (!finite(value.activeUntil, value.warningUntil as number, MAX_RUN_SECONDS + 3_600)) return false;
  ids.add(value.id as number);
  return true;
}

function validateNotice(value: unknown, ids: Set<number>) {
  if (!isRecord(value) || !validId(value.id) || ids.has(value.id as number)) return false;
  if (typeof value.text !== "string" || value.text.length > 200) return false;
  if (!(["info", "good", "warn", "danger"] as unknown[]).includes(value.tone)) return false;
  if (!finite(value.expiresAt, 0, MAX_RUN_SECONDS + 3_600)) return false;
  if (value.upgradeId !== undefined && (typeof value.upgradeId !== "string" || !UPGRADE_IDS.has(value.upgradeId))) return false;
  ids.add(value.id as number);
  return true;
}

function validateSectorEffect(value: unknown, ids: Set<number>) {
  if (value === null) return true;
  if (!isRecord(value) || !validId(value.id) || ids.has(value.id as number)) return false;
  if (!sector(value.sector) || !bool(value.success) || !finite(value.amount, 0, 100_000)) return false;
  if (value.cause !== undefined && !(["ore-full", "ore-required", "ammo-full", "ammo-required", "target-required"] as unknown[]).includes(value.cause)) return false;
  ids.add(value.id as number);
  return true;
}

function validateShotEffect(value: unknown, ids: Set<number>) {
  if (value === null) return true;
  if (!isRecord(value) || !validId(value.id) || ids.has(value.id as number)) return false;
  if (!finite(value.targetProgress, 0, 1.1) || !integer(value.targetTrack, 0, 2)) return false;
  if (value.secondaryTargetProgress !== undefined && !finite(value.secondaryTargetProgress, 0, 1.1)) return false;
  if (value.secondaryTargetTrack !== undefined && !integer(value.secondaryTargetTrack, 0, 2)) return false;
  if (!finite(value.expiresAt, 0, MAX_RUN_SECONDS + 3_600) || !bool(value.critical)) return false;
  ids.add(value.id as number);
  return true;
}

function validateEvidence(value: unknown): value is RunEvidenceSnapshot {
  if (value === null || value === undefined) return false;
  if (!isRecord(value) || value.version !== 1) return false;
  if (!(value.source === "start" || value.source === "replay" || value.source === "checkpoint")) return false;
  if (!integer(value.runOrdinal, 1, 10_000)) return false;
  if (!bool(value.guided)) return false;
  for (const name of ["activeSeconds", "wallSeconds"] as const) {
    if (!finite(value[name], 0, MAX_RUN_SECONDS)) return false;
  }
  if ((value.wallSeconds as number) + 0.1 < (value.activeSeconds as number)) return false;
  if (!integer(value.rotations, 0, 10_000_000)) return false;
  if (value.firstKillActiveSeconds !== null && !finite(value.firstKillActiveSeconds, 0, MAX_RUN_SECONDS)) return false;
  if (!bool(value.tutorialReported) || !bool(value.active90Reported) || !bool(value.completed)) return false;
  if (value.firstKillActiveSeconds !== null && (value.firstKillActiveSeconds as number) > (value.activeSeconds as number) + 0.001) return false;
  if (value.active90Reported && (value.activeSeconds as number) < 90) return false;
  if (!value.active90Reported && (value.activeSeconds as number) > 90) return false;
  // Active-run storage is cleared before a completion snapshot can be saved.
  if (value.completed) return false;
  return true;
}

function evidenceMatchesState(evidence: RunEvidenceSnapshot | null, state: GameState) {
  // A v0.4 writer always records the first-kill event in the same frame that
  // increments `kills`. Reject partial evidence instead of manufacturing a
  // later kill time after restore.
  return state.kills > 0
    ? evidence?.firstKillActiveSeconds !== null && evidence?.firstKillActiveSeconds !== undefined
    : evidence?.firstKillActiveSeconds === null || evidence === null;
}

/** Strictly validates data before it is allowed anywhere near clone/engine code. */
export function isValidGameState(value: unknown): value is GameState {
  if (!isRecord(value) || !resumablePhase(value.phase)) return false;
  if (!(value.phaseBeforePause === "playing" || value.phaseBeforePause === "intermission")) return false;
  if (value.phase === "paused" && !resumablePhase(value.phaseBeforePause)) return false;

  const arrays: Array<[unknown, number]> = [
    [value.pulseQueue, 32],
    [value.transits, 8],
    [value.spawnSchedule, 128],
    [value.enemies, 128],
    [value.jams, 32],
    [value.routeLog, 12],
    [value.upgrades, UPGRADES.length],
    [value.upgradeChoices, 3],
    [value.notices, 4],
  ];
  if (arrays.some(([candidate, maximum]) => !Array.isArray(candidate) || candidate.length > maximum)) return false;
  // resolvePulse consumes the first forecast before refill. Restoring an empty
  // queue would turn that affinity into undefined inside otherwise valid play.
  if ((value.pulseQueue as unknown[]).length < 1) return false;
  if ((value.spawnSchedule as unknown[]).length < 1) return false;

  const scalarRanges: Array<[unknown, number, number]> = [
    [value.clock, 0, MAX_RUN_SECONDS],
    [value.lastInputAt, -60, MAX_RUN_SECONDS],
    [value.ore, 0, GAME_LIMITS.ore],
    [value.ammo, 0, GAME_LIMITS.ammo],
    [value.integrity, 0, 100],
    [value.maxIntegrity, 1, 100],
    [value.waveElapsed, 0, MAX_RUN_SECONDS],
    [value.intermissionLeft, 0, 3_600],
    [value.score, 0, 1_000_000_000],
    [value.shakeUntil, 0, MAX_RUN_SECONDS + 60],
  ];
  if (scalarRanges.some(([candidate, minimum, maximum]) => !finite(candidate, minimum, maximum))) return false;
  if ((value.integrity as number) > (value.maxIntegrity as number)) return false;
  // The same engine step that reaches zero also switches to `lost` and clears
  // persistence. No resumable production state can have terminal integrity.
  if ((value.integrity as number) <= 0) return false;

  const integerRanges: Array<[unknown, number, number]> = [
    [value.relayIndex, 0, SECTORS.length - 1],
    [value.waveIndex, 0, WAVES.length - 1],
    [value.waveResolved, 0, 1_000],
    [value.spawnCursor, 0, (value.spawnSchedule as unknown[]).length],
    [value.kills, 0, 100_000],
    [value.totalPulses, 0, 1_000_000],
    [value.validPulses, 0, 1_000_000],
    [value.resonance, 0, 3],
    [value.overdrives, 0, 1_000_000],
    [value.overloads, 0, 1_000_000],
    [value.pulsesSinceExtract, 0, 1_000_000],
    [value.extractCount, 0, 1_000_000],
    [value.fabricateCount, 0, 1_000_000],
    [value.defendCount, 0, 1_000_000],
    [value.tutorialStep, 0, 3],
    [value.nextId, 1, Number.MAX_SAFE_INTEGER],
    [value.rng, 0, 0xffff_ffff],
  ];
  if (integerRanges.some(([candidate, minimum, maximum]) => !integer(candidate, minimum, maximum))) return false;
  if ((value.validPulses as number) > (value.totalPulses as number)) return false;

  const finalWaveIndex = WAVES.length - 1;
  const wouldAdvancePastFinalWave = value.phase === "intermission"
    || (value.phase === "paused" && value.phaseBeforePause === "intermission");
  // finishWave ends the final wave directly as `won`. It can never create a
  // final-wave upgrade/intermission; accepting one would let resume call
  // startWave(WAVES.length) and dereference missing rule data.
  if ((wouldAdvancePastFinalWave || value.phase === "upgrade") && value.waveIndex === finalWaveIndex) return false;

  // The interval is rule data, not checkpoint data. A crafted near-zero value
  // would make advanceGame's subtraction loop effectively non-terminating.
  // Live engine snapshots always leave pulseElapsed below the current interval
  // before returning to React/storage.
  const expectedPulseInterval = WAVES[value.waveIndex as number].interval;
  if (!finite(value.pulseInterval, expectedPulseInterval - 1e-9, expectedPulseInterval + 1e-9)) return false;
  if (!finite(value.pulseElapsed, 0, expectedPulseInterval) || (value.pulseElapsed as number) >= expectedPulseInterval) return false;

  if (!Array.isArray(value.pulseQueue) || value.pulseQueue.some((entry) => !sector(entry))) return false;
  if (!Array.isArray(value.routeLog) || value.routeLog.some((entry) => !sector(entry))) return false;
  const circuitHeat = value.circuitHeat;
  if (!isRecord(circuitHeat) || SECTORS.some((entry) => !finite(circuitHeat[entry], 0, 100))) return false;

  if (!Array.isArray(value.spawnSchedule) || value.spawnSchedule.some((entry) =>
    !isRecord(entry) || !finite(entry.at, 0, MAX_RUN_SECONDS) || !enemyKind(entry.kind)
  )) return false;

  for (const name of ["upgrades", "upgradeChoices"] as const) {
    const list = value[name] as unknown[];
    if (list.some((entry) => typeof entry !== "string" || !UPGRADE_IDS.has(entry))) return false;
    if (new Set(list).size !== list.length) return false;
  }
  if (value.phase === "upgrade" && (value.upgradeChoices as unknown[]).length !== 3) return false;
  if (value.phase !== "upgrade" && (value.upgradeChoices as unknown[]).length > 0) return false;
  if ((value.upgradeChoices as string[]).some((choice) => (value.upgrades as string[]).includes(choice))) return false;

  const ids = new Set<number>();
  if (!(value.transits as unknown[]).every((entry) => validateTransit(entry, ids))) return false;
  if (!(value.enemies as unknown[]).every((entry) => validateEnemy(entry, ids))) return false;
  if (!(value.jams as unknown[]).every((entry) => validateJam(entry, ids))) return false;
  if (!(value.notices as unknown[]).every((entry) => validateNotice(entry, ids))) return false;
  if (!validateSectorEffect(value.sectorEffect, ids) || !validateShotEffect(value.shotEffect, ids)) return false;
  if (ids.size && (value.nextId as number) <= Math.max(...ids)) return false;

  // lossCause is written only on the terminal breach that sets phase=`lost`.
  if (value.lossCause !== null) return false;
  return true;
}

function retireLegacyRuns(storage: StorageLike) {
  LEGACY_ACTIVE_RUN_KEYS.forEach((key) => removeQuietly(storage, key));
}

export function safeReadActiveRun(
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
): RestoredActiveRun | null {
  if (!storage) return null;
  retireLegacyRuns(storage);
  const reject = () => {
    removeQuietly(storage, ACTIVE_RUN_KEY);
    return null;
  };

  try {
    const raw = storage.getItem(ACTIVE_RUN_KEY);
    if (!raw) return null;
    const record: unknown = JSON.parse(raw);
    if (!isRecord(record) || record.version !== ACTIVE_RUN_VERSION) return reject();
    if (!finite(record.savedAt, 0, Number.MAX_SAFE_INTEGER)) return reject();
    const age = now - (record.savedAt as number);
    if (age > MAX_CHECKPOINT_AGE_MS || age < -MAX_FUTURE_SKEW_MS) return reject();
    if (!isValidGameState(record.state)) return reject();
    if (record.evidence !== null && record.evidence !== undefined && !validateEvidence(record.evidence)) return reject();
    const evidence = validateEvidence(record.evidence) ? record.evidence : null;
    if (!evidenceMatchesState(evidence, record.state)) return reject();

    const state = cloneGameState(record.state);
    if (state.phase === "playing" || state.phase === "intermission") {
      state.phaseBeforePause = state.phase;
      state.phase = "paused";
    }
    return {
      state,
      evidence,
    };
  } catch {
    return reject();
  }
}

export function safeWriteActiveRun(
  state: GameState | null,
  evidence: RunEvidenceSnapshot | null = null,
  storage: StorageLike | null = browserStorage(),
  now = Date.now(),
) {
  if (!storage) return;
  try {
    if (!state || !isValidGameState(state)) {
      removeQuietly(storage, ACTIVE_RUN_KEY);
      return;
    }
    const validatedEvidence = evidence && validateEvidence(evidence) ? evidence : null;
    if (!evidenceMatchesState(validatedEvidence, state)) {
      removeQuietly(storage, ACTIVE_RUN_KEY);
      return;
    }
    const record = {
      version: ACTIVE_RUN_VERSION,
      savedAt: now,
      state,
      evidence: validatedEvidence,
    };
    storage.setItem(ACTIVE_RUN_KEY, JSON.stringify(record));
    retireLegacyRuns(storage);
  } catch {
    // A blocked/full store must never stop a live simulation.
  }
}
