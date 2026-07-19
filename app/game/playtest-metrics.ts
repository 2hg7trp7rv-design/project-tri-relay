import { getRunBuild, type RunBuild } from "./debrief.ts";
import { SECTORS, type EngineEvent, type GameState, type Sector } from "./model.ts";
import { trackGameEvent } from "./telemetry.ts";

export type RunStartSource = "start" | "replay" | "checkpoint";

export interface RunEvidenceSnapshot {
  version: 1;
  source: RunStartSource;
  runOrdinal: number;
  guided: boolean;
  activeSeconds: number;
  wallSeconds: number;
  rotations: number;
  firstInputActiveSeconds?: number | null;
  firstInputWallSeconds?: number | null;
  firstSectorActiveSeconds?: Record<Sector, number | null>;
  firstSectorWallSeconds?: Record<Sector, number | null>;
  firstKillActiveSeconds: number | null;
  wave2ActiveSeconds?: number | null;
  wave2WallSeconds?: number | null;
  tutorialReported: boolean;
  active90Reported: boolean;
  completed: boolean;
}
export interface RunEvidenceResult {
  source: RunStartSource;
  runOrdinal: number;
  guided: boolean;
  activeSeconds: number;
  wallSeconds: number;
  rotations: number;
  rotationsPerSecond: number;
  firstInputSeconds: number | null;
  firstInputWallSeconds: number | null;
  firstSectorSeconds: Record<Sector, number | null>;
  firstSectorWallSeconds: Record<Sector, number | null>;
  firstKillSeconds: number | null;
  wave2Seconds: number | null;
  wave2WallSeconds: number | null;
  tutorialCompleted: boolean;
  active90Reached: boolean;
  productiveRate: number;
  overloads: number;
  overdrives: number;
  build: RunBuild;
  outcome: "won" | "lost" | "incomplete";
  wave: number;
}

type EvidenceValue = string | number | boolean;
type EvidenceEmitter = (name: string, properties: Record<string, EvidenceValue>) => void;

export interface RunEvidenceTrackerOptions {
  source: RunStartSource;
  runOrdinal: number;
  guided: boolean;
  snapshot?: RunEvidenceSnapshot | null;
  emit?: EvidenceEmitter;
  now?: () => number;
}

function clampFinite(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function conservativeCeil(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.ceil(value * factor - 1e-7) / factor;
}

function monotonicNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Collects a deliberately small, anonymous set of playtest evidence.
 *
 * The caller decides whether a frame is active. Pass `active=false` while the
 * document is hidden or the run is paused; guided input-wait frames remain
 * active so tutorial thinking time is not erased from the 90-second measure.
 */
export class RunEvidenceTracker {
  private readonly emit: EvidenceEmitter;
  private readonly now: () => number;
  private readonly source: RunStartSource;
  private readonly runOrdinal: number;
  private readonly guided: boolean;
  private activeSeconds: number;
  private wallBaseSeconds: number;
  private wallStartedAt: number;
  private rotations: number;
  private firstInputActiveSeconds: number | null;
  private firstInputWallSeconds: number | null;
  private firstSectorActiveSeconds: Record<Sector, number | null>;
  private firstSectorWallSeconds: Record<Sector, number | null>;
  private firstKillActiveSeconds: number | null;
  private wave2ActiveSeconds: number | null;
  private wave2WallSeconds: number | null;
  private tutorialReported: boolean;
  private active90Reported: boolean;
  private completed: boolean;

  constructor(options: RunEvidenceTrackerOptions) {
    const snapshot = options.snapshot;
    this.emit = options.emit ?? trackGameEvent;
    this.now = options.now ?? monotonicNow;
    this.source = snapshot?.source ?? options.source;
    this.runOrdinal = Math.max(1, Math.floor(snapshot?.runOrdinal ?? options.runOrdinal));
    this.guided = snapshot?.guided ?? options.guided;
    this.activeSeconds = clampFinite(snapshot?.activeSeconds ?? 0, 0, 43_200);
    this.wallBaseSeconds = clampFinite(snapshot?.wallSeconds ?? 0, 0, 43_200);
    this.wallStartedAt = this.now();
    this.rotations = Math.max(0, Math.floor(snapshot?.rotations ?? 0));
    this.firstInputActiveSeconds = snapshot?.firstInputActiveSeconds ?? null;
    this.firstInputWallSeconds = snapshot?.firstInputWallSeconds ?? null;
    this.firstSectorActiveSeconds = {
      extract: snapshot?.firstSectorActiveSeconds?.extract ?? null,
      fabricate: snapshot?.firstSectorActiveSeconds?.fabricate ?? null,
      defend: snapshot?.firstSectorActiveSeconds?.defend ?? null,
    };
    this.firstSectorWallSeconds = {
      extract: snapshot?.firstSectorWallSeconds?.extract ?? null,
      fabricate: snapshot?.firstSectorWallSeconds?.fabricate ?? null,
      defend: snapshot?.firstSectorWallSeconds?.defend ?? null,
    };
    this.firstKillActiveSeconds = snapshot?.firstKillActiveSeconds ?? null;
    this.wave2ActiveSeconds = snapshot?.wave2ActiveSeconds ?? null;
    this.wave2WallSeconds = snapshot?.wave2WallSeconds ?? null;
    this.tutorialReported = snapshot?.tutorialReported ?? false;
    this.active90Reported = snapshot?.active90Reported ?? false;
    this.completed = snapshot?.completed ?? false;
  }

  private wallSeconds() {
    return clampFinite(
      this.wallBaseSeconds + Math.max(0, this.now() - this.wallStartedAt) / 1_000,
      0,
      43_200,
    );
  }

  private sharedEventFields(state: GameState) {
    return {
      source: this.source,
      run_ordinal: this.runOrdinal,
      wave: state.waveIndex + 1,
      active_seconds: round(this.activeSeconds, 1),
    };
  }

  private markFirstKill(state: GameState) {
    if (this.firstKillActiveSeconds !== null) return;
    this.firstKillActiveSeconds = this.activeSeconds;
    this.emit("first_kill", {
      ...this.sharedEventFields(state),
      wall_seconds: round(this.wallSeconds(), 1),
      rotations: this.rotations,
    });
  }

  private markFirstSector(sector: Sector) {
    if (this.firstSectorActiveSeconds[sector] !== null) return;
    this.firstSectorActiveSeconds[sector] = this.activeSeconds;
    this.firstSectorWallSeconds[sector] = this.wallSeconds();
  }

  private markWave2() {
    if (this.wave2ActiveSeconds !== null) return;
    this.wave2ActiveSeconds = this.activeSeconds;
    this.wave2WallSeconds = this.wallSeconds();
  }

  recordRotation() {
    if (this.completed) return;
    if (this.firstInputActiveSeconds === null) {
      this.firstInputActiveSeconds = this.activeSeconds;
      this.firstInputWallSeconds = this.wallSeconds();
    }
    this.rotations += 1;
  }

  recordTutorialCompleted(state: GameState) {
    if (!this.guided || this.tutorialReported || this.completed) return;
    this.tutorialReported = true;
    this.emit("tutorial_completed", {
      ...this.sharedEventFields(state),
      wall_seconds: round(this.wallSeconds(), 1),
      pulses: state.totalPulses,
      rotations: this.rotations,
    });
  }

  advance(
    deltaSeconds: number,
    state: GameState,
    events: readonly EngineEvent[] = [],
    active = true,
  ) {
    if (this.completed) return;
    if (active) {
      this.activeSeconds = clampFinite(this.activeSeconds + Math.max(0, deltaSeconds), 0, 43_200);
    }
    for (const sector of SECTORS) {
      if (events.some((event) => event.kind === sector)) this.markFirstSector(sector);
    }
    if (events.some((event) => event.kind === "kill")) this.markFirstKill(state);
    if (state.waveIndex >= 1) this.markWave2();
    if (this.guided && state.tutorialStep >= 3) this.recordTutorialCompleted(state);
    if (!this.active90Reported && this.activeSeconds >= 90) {
      this.active90Reported = true;
      this.emit("active_90s_reached", {
        ...this.sharedEventFields(state),
        wall_seconds: round(this.wallSeconds(), 1),
        rotations: this.rotations,
        productive_rate: round(state.validPulses / Math.max(1, state.totalPulses), 3),
      });
    }
  }

  getResult(state: GameState): RunEvidenceResult {
    const activeSeconds = round(this.activeSeconds, 2);
    return {
      source: this.source,
      runOrdinal: this.runOrdinal,
      guided: this.guided,
      activeSeconds,
      wallSeconds: round(this.wallSeconds(), 2),
      rotations: this.rotations,
      rotationsPerSecond: round(this.rotations / Math.max(1, activeSeconds), 3),
      firstInputSeconds: this.firstInputActiveSeconds === null
        ? null
        : round(this.firstInputActiveSeconds, 2),
      firstInputWallSeconds: this.firstInputWallSeconds === null
        ? null
        : round(this.firstInputWallSeconds, 2),
      firstSectorSeconds: Object.fromEntries(
        SECTORS.map((sector) => [
          sector,
          this.firstSectorActiveSeconds[sector] === null
            ? null
            : round(this.firstSectorActiveSeconds[sector] as number, 2),
        ]),
      ) as Record<Sector, number | null>,
      firstSectorWallSeconds: Object.fromEntries(
        SECTORS.map((sector) => [
          sector,
          this.firstSectorWallSeconds[sector] === null
            ? null
            : round(this.firstSectorWallSeconds[sector] as number, 2),
        ]),
      ) as Record<Sector, number | null>,
      firstKillSeconds: this.firstKillActiveSeconds === null
        ? null
        : conservativeCeil(this.firstKillActiveSeconds, 3),
      wave2Seconds: this.wave2ActiveSeconds === null ? null : round(this.wave2ActiveSeconds, 2),
      wave2WallSeconds: this.wave2WallSeconds === null ? null : round(this.wave2WallSeconds, 2),
      tutorialCompleted: this.tutorialReported,
      active90Reached: this.active90Reported,
      productiveRate: round(state.validPulses / Math.max(1, state.totalPulses), 3),
      overloads: state.overloads,
      overdrives: state.overdrives,
      build: getRunBuild(state),
      outcome: state.phase === "won" ? "won" : state.phase === "lost" ? "lost" : "incomplete",
      wave: state.waveIndex + 1,
    };
  }

  complete(state: GameState) {
    const result = this.getResult(state);
    if (this.completed) return result;
    this.completed = true;
    this.emit("run_completed", {
      outcome: result.outcome,
      wave: result.wave,
      source: result.source,
      run_ordinal: result.runOrdinal,
      guided: result.guided,
      active_seconds: round(result.activeSeconds, 1),
      wall_seconds: round(result.wallSeconds, 1),
      rotations: result.rotations,
      rotations_per_second: result.rotationsPerSecond,
      first_kill_seconds: result.firstKillSeconds ?? -1,
      first_kill_recorded: result.firstKillSeconds !== null,
      tutorial_completed: result.tutorialCompleted,
      active_90_reached: result.active90Reached,
      productive_rate: result.productiveRate,
      overloads: result.overloads,
      overdrives: result.overdrives,
      build: result.build,
    });
    return result;
  }

  snapshot(): RunEvidenceSnapshot {
    return {
      version: 1,
      source: this.source,
      runOrdinal: this.runOrdinal,
      guided: this.guided,
      activeSeconds: round(this.activeSeconds, 3),
      wallSeconds: round(this.wallSeconds(), 3),
      rotations: this.rotations,
      firstInputActiveSeconds: this.firstInputActiveSeconds === null
        ? null
        : round(this.firstInputActiveSeconds, 3),
      firstInputWallSeconds: this.firstInputWallSeconds === null
        ? null
        : round(this.firstInputWallSeconds, 3),
      firstSectorActiveSeconds: Object.fromEntries(
        SECTORS.map((sector) => [
          sector,
          this.firstSectorActiveSeconds[sector] === null
            ? null
            : round(this.firstSectorActiveSeconds[sector] as number, 3),
        ]),
      ) as Record<Sector, number | null>,
      firstSectorWallSeconds: Object.fromEntries(
        SECTORS.map((sector) => [
          sector,
          this.firstSectorWallSeconds[sector] === null
            ? null
            : round(this.firstSectorWallSeconds[sector] as number, 3),
        ]),
      ) as Record<Sector, number | null>,
      firstKillActiveSeconds: this.firstKillActiveSeconds === null
        ? null
        : conservativeCeil(this.firstKillActiveSeconds, 3),
      wave2ActiveSeconds: this.wave2ActiveSeconds === null
        ? null
        : round(this.wave2ActiveSeconds, 3),
      wave2WallSeconds: this.wave2WallSeconds === null
        ? null
        : round(this.wave2WallSeconds, 3),
      tutorialReported: this.tutorialReported,
      active90Reported: this.active90Reported,
      completed: this.completed,
    };
  }
}

/** Rehydrates a saved, unfinished checkpoint without adding console time. */
export function getStoredRunEvidenceResult(
  state: GameState,
  snapshot: RunEvidenceSnapshot,
) {
  return new RunEvidenceTracker({
    source: snapshot.source,
    runOrdinal: snapshot.runOrdinal,
    guided: snapshot.guided,
    snapshot,
    now: () => 0,
    emit: () => {},
  }).getResult(state);
}
