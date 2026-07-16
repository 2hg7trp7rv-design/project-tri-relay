import {
  ENEMY_STATS,
  SECTORS,
  UPGRADES,
  WAVES,
  type Enemy,
  type EnemyKind,
  type EngineEvent,
  type CircuitLoadStatus,
  type FailureCause,
  type GamePhase,
  type GameState,
  type JamEffect,
  type Sector,
  type SpawnEntry,
} from "./model.ts";

const ORE_CAP = 24;
const AMMO_CAP = 20;
const TRANSIT_SECONDS = 0.18;
const INPUT_LOCK_SECONDS = 0.075;
const RUSHER_PACK_SIZE = [1, 3, 3, 4, 4, 4] as const;

// Circuit load is pulse-based rather than time-based, so its outcome remains
// identical at every refresh rate. The upcoming affinity is already visible to
// the player: matching it vents heat, while converting a mismatched frequency
// adds a forecastable load spike. Avoiding a branch cools it automatically.
const CIRCUIT_HEAT_MAX = 100;
const CIRCUIT_STRAINED_AT = 60;
const CIRCUIT_OVERLOADED_AT = 100;
const CIRCUIT_MISMATCH_HEAT = 60;
const CIRCUIT_URGENT_HEAT = 20;
const CIRCUIT_DRY_HEAT = 60;
const CIRCUIT_MATCH_COOLING = 20;
const CIRCUIT_IDLE_COOLING = 14;
const CIRCUIT_OVERDRIVE_COOLING = 20;
const CIRCUIT_PRIORITY_OUTPUT: Record<Sector, number> = {
  extract: 1.25,
  fabricate: 1.25,
  defend: 1.25,
};

function nextId(state: GameState) {
  const id = state.nextId;
  state.nextId += 1;
  return id;
}

function random(state: GameState) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function shuffle<T>(state: GameState, values: T[]) {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random(state) * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output;
}

function refillPulseQueue(state: GameState) {
  while (state.pulseQueue.length < 8) {
    const recent = state.pulseQueue.slice(-3);
    const repeated =
      recent.length === 3 && recent.every((sector) => sector === recent[0]);
    const pool = repeated
      ? SECTORS.filter((sector) => sector !== recent[0])
      : [...SECTORS];
    state.pulseQueue.push(pool[Math.floor(random(state) * pool.length)]);
  }
}

function addNotice(
  state: GameState,
  text: string,
  tone: "info" | "good" | "warn" | "danger" = "info",
  duration = 1.25,
  upgradeId?: string,
) {
  state.notices.push({
    id: nextId(state),
    text,
    tone,
    expiresAt: state.clock + duration,
    upgradeId,
  });
  state.notices = state.notices.slice(-4);
}

function buildSchedule(state: GameState, waveIndex: number): SpawnEntry[] {
  const wave = WAVES[waveIndex];
  const jitter = wave.jitter ?? 1.4;
  const source = wave.spawns.flatMap((entry) => {
    const packSize = entry.kind === "rusher" ? RUSHER_PACK_SIZE[waveIndex] : 1;
    return Array.from({ length: packSize }, (_, packIndex) => ({
      ...entry,
      at: entry.at + packIndex * 0.2,
    }));
  });
  return source
    .map((entry, index) => ({
      ...entry,
      at:
        index === 0
          ? Math.max(0, entry.at)
          : Math.max(0, entry.at + (random(state) - 0.5) * jitter),
    }))
    .sort((a, b) => a.at - b.at);
}

function startWave(state: GameState, waveIndex: number) {
  state.waveIndex = waveIndex;
  state.waveElapsed = 0;
  state.waveResolved = 0;
  state.spawnCursor = 0;
  state.spawnSchedule = buildSchedule(state, waveIndex);
  state.pulseInterval = WAVES[waveIndex].interval;
  state.pulseElapsed = Math.min(state.pulseElapsed, state.pulseInterval * 0.45);
  state.phase = "playing";
  addNotice(state, `WAVE ${waveIndex + 1} // ${WAVES[waveIndex].title.en}`, "info", 2);
}

export function createGameState(seed = Date.now() >>> 0): GameState {
  const state: GameState = {
    phase: "ready",
    phaseBeforePause: "playing",
    clock: 0,
    relayIndex: 0,
    pulseElapsed: 0,
    pulseInterval: WAVES[0].interval,
    pulseQueue: [],
    lastInputAt: -10,
    transits: [],
    ore: 0,
    ammo: 0,
    integrity: 4,
    maxIntegrity: 4,
    waveIndex: 0,
    waveElapsed: 0,
    waveResolved: 0,
    spawnCursor: 0,
    spawnSchedule: [],
    enemies: [],
    jams: [],
    intermissionLeft: 0,
    score: 0,
    kills: 0,
    totalPulses: 0,
    validPulses: 0,
    resonance: 0,
    overdrives: 0,
    circuitHeat: { extract: 0, fabricate: 0, defend: 0 },
    overloads: 0,
    routeLog: [],
    pulsesSinceExtract: 0,
    extractCount: 0,
    fabricateCount: 0,
    defendCount: 0,
    upgrades: [],
    upgradeChoices: [],
    notices: [],
    sectorEffect: null,
    shotEffect: null,
    shakeUntil: 0,
    lossCause: null,
    tutorialStep: 0,
    nextId: 1,
    rng: seed || 0x5a17c9e3,
  };
  refillPulseQueue(state);
  return state;
}

export function startRun(seed = Date.now() >>> 0, guided = true) {
  const state = createGameState(seed);
  startWave(state, 0);
  state.relayIndex = 2;
  state.tutorialStep = guided ? 0 : 3;
  if (guided) {
    // Only the six onboarding cues are scripted. The seeded forecast that was
    // already generated remains in the queue and takes over from pulse seven.
    state.pulseQueue.splice(
      0,
      6,
      "extract",
      "fabricate",
      "defend",
      "extract",
      "fabricate",
      "defend",
    );
  }
  state.pulseElapsed = 0;
  return state;
}

export function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    pulseQueue: [...state.pulseQueue],
    transits: state.transits.map((pulse) => ({ ...pulse })),
    spawnSchedule: state.spawnSchedule.map((entry) => ({ ...entry })),
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    jams: state.jams.map((jam) => ({ ...jam })),
    routeLog: [...state.routeLog],
    // Defensive defaults also keep cloned fixtures and same-version records
    // valid when a test constructs only the fields it exercises.
    circuitHeat: {
      extract: state.circuitHeat?.extract ?? 0,
      fabricate: state.circuitHeat?.fabricate ?? 0,
      defend: state.circuitHeat?.defend ?? 0,
    },
    overloads: state.overloads ?? 0,
    upgrades: [...state.upgrades],
    upgradeChoices: [...state.upgradeChoices],
    notices: state.notices.map((notice) => ({ ...notice })),
    sectorEffect: state.sectorEffect ? { ...state.sectorEffect } : null,
    shotEffect: state.shotEffect ? { ...state.shotEffect } : null,
  };
}

export function getCurrentSector(state: GameState): Sector {
  return SECTORS[state.relayIndex];
}

export function rotateRelay(state: GameState): EngineEvent[] {
  if (state.phase !== "playing") return [];
  if (state.tutorialStep < 3 && state.transits.length > 0) return [];
  if (state.tutorialStep >= 3 && state.clock - state.lastInputAt < INPUT_LOCK_SECONDS) return [];
  state.lastInputAt = state.clock;
  state.relayIndex = (state.relayIndex + 1) % SECTORS.length;
  return [{ kind: "rotate", sector: getCurrentSector(state) }];
}

export function pauseGame(state: GameState) {
  if (state.phase !== "playing" && state.phase !== "intermission") return false;
  state.phaseBeforePause = state.phase;
  state.phase = "paused";
  return true;
}

export function resumeGame(state: GameState) {
  if (state.phase !== "paused") return false;
  state.phase = state.phaseBeforePause;
  return true;
}

function hasUpgrade(state: GameState, id: string) {
  return state.upgrades.includes(id);
}

function mostUsedSector(state: GameState, sampleSize: number): Sector {
  const counts: Record<Sector, number> = { extract: 0, fabricate: 0, defend: 0 };
  state.routeLog.slice(-sampleSize).forEach((sector) => {
    counts[sector] += 1;
  });
  const current = getCurrentSector(state);
  return [...SECTORS].sort((a, b) => {
    if (counts[b] === counts[a]) return a === current ? -1 : 1;
    return counts[b] - counts[a];
  })[0];
}

function scheduleJam(
  state: GameState,
  source: EnemyKind,
  sampleSize: number,
  activeSeconds: number,
) {
  const sector = mostUsedSector(state, sampleSize);
  const jam: JamEffect = {
    id: nextId(state),
    sector,
    warningUntil: state.clock + 2,
    activeUntil: state.clock + 2 + activeSeconds,
    source,
  };
  state.jams.push(jam);
  addNotice(state, `${sector.toUpperCase()} JAM IN 2s`, "warn", 2);
}

function isSectorJammed(state: GameState, sector: Sector) {
  return state.jams.some(
    (jam) =>
      jam.sector === sector &&
      state.clock >= jam.warningUntil &&
      state.clock < jam.activeUntil,
  );
}

function spawnEnemy(state: GameState, kind: EnemyKind, events: EngineEvent[]) {
  const stats = ENEMY_STATS[kind];
  const hp = round(stats.hp * (WAVES[state.waveIndex].enemyHpScale ?? 1));
  const enemy: Enemy = {
    id: nextId(state),
    kind,
    hp,
    maxHp: hp,
    progress: 0,
    speed: 1 / stats.arrival,
    breachDamage: stats.breachDamage,
    track: state.spawnCursor % 3,
    spawnedAt: state.clock,
    abilityAt: state.clock + (kind === "sapper" ? 6 : kind === "jammer" ? 5 : 10),
    abilityUsed: false,
    nextAbilityAt: state.clock + 10,
    stunnedUntil: 0,
    flashUntil: 0,
  };
  state.enemies.push(enemy);
  events.push({ kind: "spawn" });
  if (kind === "warden") addNotice(state, "GRID WARDEN ONLINE", "danger", 2.5);
}

function processEnemyAbility(
  state: GameState,
  enemy: Enemy,
  events: EngineEvent[],
) {
  if (enemy.kind === "sapper" && !enemy.abilityUsed && state.clock >= enemy.abilityAt) {
    enemy.abilityUsed = true;
    if (state.ammo / AMMO_CAP >= state.ore / ORE_CAP && state.ammo > 0) {
      const stolen = Math.min(5, state.ammo);
      state.ammo = round(state.ammo - stolen);
      addNotice(state, `SAPPER −${stolen.toFixed(1)} AMMO`, "danger", 1.8);
    } else if (state.ore > 0) {
      const stolen = Math.min(8, state.ore);
      state.ore = round(state.ore - stolen);
      addNotice(state, `SAPPER −${stolen.toFixed(1)} ORE`, "danger", 1.8);
    }
    events.push({ kind: "jam" });
  }

  if (enemy.kind === "jammer" && !enemy.abilityUsed && state.clock >= enemy.abilityAt) {
    enemy.abilityUsed = true;
    scheduleJam(state, "jammer", 6, 4);
    events.push({ kind: "jam" });
  }

  if (enemy.kind === "warden" && state.clock >= enemy.nextAbilityAt) {
    enemy.nextAbilityAt += 10;
    scheduleJam(state, "warden", 8, 5);
    events.push({ kind: "jam" });
  }
}

function applyEnemyMovement(state: GameState, delta: number, events: EngineEvent[]) {
  const breached: number[] = [];
  state.enemies.forEach((enemy) => {
    if (state.clock >= enemy.stunnedUntil) {
      processEnemyAbility(state, enemy, events);
      enemy.progress += enemy.speed * delta;
    }
    if (enemy.progress >= 1) breached.push(enemy.id);
  });

  if (!breached.length) return;
  state.enemies = state.enemies.filter((enemy) => {
    if (!breached.includes(enemy.id)) return true;
    const integrityBefore = state.integrity;
    state.integrity = Math.max(0, state.integrity - enemy.breachDamage);
    if (integrityBefore > 0 && state.integrity === 0 && !state.lossCause) {
      state.lossCause = { enemyKind: enemy.kind, breachDamage: enemy.breachDamage };
    }
    state.waveResolved += 1;
    state.shakeUntil = state.clock + 0.28;
    addNotice(state, `CORE −${enemy.breachDamage}`, "danger", 1.25);
    events.push({ kind: "breach", amount: enemy.breachDamage });
    return false;
  });

  if (state.integrity <= 0) {
    state.phase = "lost";
    events.push({ kind: "lose" });
  }
}

function killDestroyedEnemies(state: GameState, events: EngineEvent[]) {
  const destroyed = state.enemies.filter((enemy) => enemy.hp <= 0);
  if (!destroyed.length) return;
  destroyed.forEach((enemy) => {
    state.waveResolved += 1;
    state.kills += 1;
    state.score += enemy.kind === "warden" ? 2500 : enemy.kind === "jammer" ? 450 : 250;
    events.push({ kind: "kill" });
  });
  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
}

function damageAcrossFront(
  state: GameState,
  damage: number,
  events: EngineEvent[],
) {
  let remaining = damage;
  const ordered = [...state.enemies].sort((a, b) => b.progress - a.progress);
  let dealt = 0;
  ordered.forEach((enemy) => {
    if (remaining <= 0 || enemy.hp <= 0) return;
    const before = enemy.hp;
    enemy.hp = round(Math.max(0, enemy.hp - remaining));
    const applied = Math.min(before, remaining);
    dealt += applied;
    remaining = Math.max(0, remaining - before);
    enemy.flashUntil = state.clock + 0.2;
  });
  killDestroyedEnemies(state, events);
  return dealt;
}

function damageSecondTarget(state: GameState, damage: number, events: EngineEvent[]) {
  const ordered = [...state.enemies]
    .filter((enemy) => enemy.hp > 0)
    .sort((a, b) => b.progress - a.progress);
  const target = ordered[1];
  if (!target) return 0;
  const before = target.hp;
  target.hp = round(Math.max(0, target.hp - damage));
  target.flashUntil = state.clock + 0.2;
  killDestroyedEnemies(state, events);
  return Math.min(before, damage);
}

function resolveExtract(
  state: GameState,
  multiplier: number,
  overdrive: boolean,
  events: EngineEvent[],
) {
  const rested = state.pulsesSinceExtract >= 2;
  state.pulsesSinceExtract = 0;
  state.extractCount += 1;
  const veinTriggered = hasUpgrade(state, "vein-memory") && rested;
  const fractureTriggered = hasUpgrade(state, "fracture-counter") && state.extractCount % 4 === 0;
  let base = hasUpgrade(state, "reinforced-bit") ? 5 : 4;
  if (veinTriggered) base += 4;
  if (fractureTriggered) base += 7;
  const requested = overdrive ? Math.max(12, round(base * multiplier)) : round(base * multiplier);
  const added = round(Math.min(requested, ORE_CAP - state.ore));
  state.ore = round(state.ore + added);
  state.sectorEffect = {
    id: nextId(state),
    sector: "extract",
    success: added > 0,
    amount: added,
    ...(added > 0 ? {} : { cause: "ore-full" as FailureCause }),
  };
  if (added > 0) {
    if (state.tutorialStep === 0) state.tutorialStep = 1;
    state.validPulses += 1;
    state.score += Math.round(added * 12);
    addNotice(state, `+${added.toFixed(1)} ORE`, "good");
    if (veinTriggered) addNotice(state, "VEIN MEMORY", "good", 1.1, "vein-memory");
    if (fractureTriggered) addNotice(state, "FRACTURE COUNTER", "good", 1.1, "fracture-counter");
    events.push({ kind: "extract", sector: "extract", amount: added });
  } else {
    events.push({ kind: "fail", sector: "extract" });
  }
}

function resolveFabricate(
  state: GameState,
  multiplier: number,
  overdrive: boolean,
  events: EngineEvent[],
) {
  state.pulsesSinceExtract += 1;
  state.fabricateCount += 1;
  if (state.ore < 0.5 || state.ammo >= AMMO_CAP) {
    const cause: FailureCause = state.ammo >= AMMO_CAP ? "ammo-full" : "ore-required";
    state.sectorEffect = {
      id: nextId(state),
      sector: "fabricate",
      success: false,
      amount: 0,
      cause,
    };
    events.push({ kind: "fail", sector: "fabricate" });
    return;
  }

  let spend: number;
  let generated: number;
  const doubleChamberTriggered = hasUpgrade(state, "double-chamber") && state.ore >= 8;
  if (overdrive) {
    spend = Math.min(8, state.ore);
    generated = 14;
  } else if (doubleChamberTriggered) {
    spend = 8;
    const ratio = hasUpgrade(state, "lean-press") ? 1.25 : 1;
    generated = 10 * ratio * multiplier;
  } else {
    spend = Math.min(6, state.ore);
    const ratio = hasUpgrade(state, "lean-press") ? 1.25 : 1;
    generated = spend * ratio * multiplier;
  }
  state.ore = round(state.ore - spend);
  const scrapTriggered = hasUpgrade(state, "scrap-recovery") && spend >= 4;
  if (scrapTriggered) {
    state.ore = round(Math.min(ORE_CAP, state.ore + 2));
    addNotice(state, "SCRAP RETURN +2 ORE", "info", 1.1, "scrap-recovery");
  }
  const added = round(Math.min(generated, AMMO_CAP - state.ammo));
  state.ammo = round(state.ammo + added);
  state.sectorEffect = {
    id: nextId(state),
    sector: "fabricate",
    success: added > 0,
    amount: added,
  };
  state.validPulses += 1;
  if (added > 0 && state.tutorialStep === 1) state.tutorialStep = 2;
  state.score += Math.round(added * 20);
  addNotice(state, `+${added.toFixed(1)} AMMO`, "good");
  if (doubleChamberTriggered) addNotice(state, "DOUBLE CHAMBER", "good", 1.1, "double-chamber");
  events.push({ kind: "fabricate", sector: "fabricate", amount: added });
}

function resolveDefense(
  state: GameState,
  multiplier: number,
  overdrive: boolean,
  events: EngineEvent[],
) {
  state.pulsesSinceExtract += 1;
  state.defendCount += 1;
  const ordered = [...state.enemies].sort((a, b) => b.progress - a.progress);
  if (!ordered.length) {
    // Routing power to defense before contact is a valid armed/standby state.
    // A zero-output effect without a cause is intentionally neutral: it must
    // not spend ammo, score, advance the tutorial, or emit a failure event.
    state.sectorEffect = {
      id: nextId(state),
      sector: "defend",
      success: false,
      amount: 0,
    };
    addNotice(state, "DEFENSE ARMED // STANDBY", "info", 1.1);
    return;
  }

  if (state.ammo < 0.5) {
    state.sectorEffect = {
      id: nextId(state),
      sector: "defend",
      success: false,
      amount: 0,
      cause: "ammo-required" as FailureCause,
    };
    events.push({ kind: "fail", sector: "defend" });
    return;
  }

  const ammoBefore = state.ammo;
  const killsBefore = state.kills;
  const spend = Math.min(4, state.ammo);
  state.ammo = round(state.ammo - spend);
  const damagePerAmmo = hasUpgrade(state, "rail-coil") ? 3.75 : 3;
  let requestedDamage = overdrive ? 30 : spend * damagePerAmmo * multiplier;
  const loadedCapacitorTriggered = hasUpgrade(state, "loaded-capacitor") && ammoBefore >= 12;
  if (loadedCapacitorTriggered) requestedDamage *= 1.5;

  let dealt = 0;
  const secondaryTargetProgress = hasUpgrade(state, "arc-fork") ? ordered[1]?.progress : undefined;
  const secondaryTargetTrack = hasUpgrade(state, "arc-fork") ? ordered[1]?.track : undefined;
  if (secondaryTargetProgress !== undefined) {
    dealt += damageSecondTarget(state, requestedDamage * 0.4, events);
    addNotice(state, "ARC FORK", "good", 0.9, "arc-fork");
  }
  dealt += damageAcrossFront(state, requestedDamage, events);
  if (state.kills > killsBefore && state.tutorialStep === 2) {
    state.tutorialStep = 3;
    // Give the player a complete interval to read the training completion and
    // choose the first live route. Without this reset, transit time already
    // charged the next pulse and could cause an unintended follow-up shot.
    state.pulseElapsed = 0;
  }

  if (hasUpgrade(state, "interdictor") && state.enemies.length) {
    [...state.enemies]
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 3)
      .forEach((enemy) => {
      const delay = enemy.kind === "warden" ? 0.2 : 0.65;
      enemy.stunnedUntil = Math.max(enemy.stunnedUntil, state.clock + delay);
    });
    addNotice(state, "INTERDICTOR", "info", 0.9, "interdictor");
  }
  if (loadedCapacitorTriggered) addNotice(state, "LOADED CAPACITOR", "good", 0.9, "loaded-capacitor");

  state.shotEffect = {
    id: nextId(state),
    targetProgress: ordered[0].progress,
    targetTrack: ordered[0].track,
    secondaryTargetProgress,
    secondaryTargetTrack,
    expiresAt: state.clock + 0.22,
    critical: multiplier >= 1.5 || requestedDamage >= 25,
  };
  state.sectorEffect = {
    id: nextId(state),
    sector: "defend",
    success: dealt > 0,
    amount: round(dealt),
  };
  state.validPulses += 1;
  state.score += Math.round(dealt * 14);
  addNotice(state, `−${round(dealt, 1).toFixed(1)} DMG`, "good");
  events.push({ kind: "defend", sector: "defend", amount: dealt });
  events.push({ kind: "hit", amount: dealt });
}

function resolveTransit(state: GameState, pulseId: number, events: EngineEvent[]) {
  const pulse = state.transits.find((candidate) => candidate.id === pulseId);
  if (!pulse) return;
  if (pulse.sector === "extract") resolveExtract(state, pulse.multiplier, pulse.overdrive, events);
  if (pulse.sector === "fabricate") resolveFabricate(state, pulse.multiplier, pulse.overdrive, events);
  if (pulse.sector === "defend") resolveDefense(state, pulse.multiplier, pulse.overdrive, events);
}

function affinityBonus(state: GameState, sector: Sector, affinity: Sector) {
  if (sector !== affinity) return 0;
  if (sector === "extract" && hasUpgrade(state, "resonant-drill")) return 1;
  if (sector === "fabricate" && hasUpgrade(state, "resonant-mold")) return 1;
  return 0.5;
}

function ensureCircuitHeat(state: GameState) {
  if (!state.circuitHeat) {
    state.circuitHeat = { extract: 0, fabricate: 0, defend: 0 };
  }
  return state.circuitHeat;
}

function circuitLoadStatus(heat: number): CircuitLoadStatus {
  if (heat >= CIRCUIT_OVERLOADED_AT) return "overloaded";
  if (heat >= CIRCUIT_STRAINED_AT) return "strained";
  return "stable";
}

function circuitLoadMultiplier(status: CircuitLoadStatus) {
  if (status === "overloaded") return 0.15;
  if (status === "strained") return 0.85;
  return 1;
}

function targetCanReceivePulse(state: GameState, sector: Sector) {
  if (sector === "extract") return state.ore < ORE_CAP;
  if (sector === "fabricate") return state.ore >= 0.5 && state.ammo < AMMO_CAP;
  return state.enemies.length > 0 && state.ammo >= 0.5;
}

function targetCanUseOverdrive(state: GameState, sector: Sector) {
  if (sector === "extract") return ORE_CAP - state.ore >= 12;
  if (sector === "fabricate") return state.ore >= 8 && AMMO_CAP - state.ammo >= 14;
  return state.enemies.length > 0 && state.ammo >= 4;
}

function projectedCircuitHeat(
  current: number,
  matched: boolean,
  canReceive: boolean,
  jammed: boolean,
  overdrive: boolean,
  urgent: boolean,
) {
  const change = overdrive
    ? -CIRCUIT_OVERDRIVE_COOLING
    : !canReceive
      ? CIRCUIT_DRY_HEAT
      : matched && !jammed
        ? -CIRCUIT_MATCH_COOLING
        : urgent && !jammed
          ? CIRCUIT_URGENT_HEAT
          : CIRCUIT_MISMATCH_HEAT;
  return Math.max(0, Math.min(CIRCUIT_HEAT_MAX, current + change));
}

function isUrgentCircuitDemand(state: GameState, sector: Sector) {
  if (sector === "extract") return state.ore <= 4;
  if (sector === "fabricate") return state.ammo <= 6 && state.ore >= 0.5;
  if (state.ammo < 0.5) return false;
  return state.enemies.some((enemy) => {
    const stunLeft = Math.max(0, enemy.stunnedUntil - state.clock);
    const travelLeft = Math.max(0, 1 - enemy.progress) / enemy.speed;
    return stunLeft + travelLeft <= 4.5;
  });
}

/**
 * Read-only forecast for the exact next dispatch. The UI can expose this
 * before the player commits: no route-history detector or surprise penalty is
 * involved. Heat is measured from 0 to 100.
 */
function buildCircuitLoadForecast(state: GameState, sector: Sector, affinity: Sector) {
  const heat = ensureCircuitHeat(state)[sector];
  const matched = affinity === sector;
  const jammed = isSectorJammed(state, sector);
  const canReceive = targetCanReceivePulse(state, sector);
  const urgent = isUrgentCircuitDemand(state, sector);
  const overdrive =
    state.resonance >= 3 &&
    targetCanUseOverdrive(state, sector) &&
    !jammed;
  const projectedHeat = projectedCircuitHeat(
    heat,
    matched,
    canReceive,
    jammed,
    overdrive,
    urgent,
  );
  const status = circuitLoadStatus(heat);
  const projectedStatus = circuitLoadStatus(projectedHeat);
  return {
    sector,
    affinity,
    heat,
    projectedHeat,
    heatDelta: projectedHeat - heat,
    status,
    projectedStatus,
    matched,
    jammed,
    canReceive,
    urgent,
    overdrive,
    outputMultiplier: overdrive
      ? 1
      : circuitLoadMultiplier(projectedStatus) *
        (urgent && !matched && canReceive && !jammed
          ? CIRCUIT_PRIORITY_OUTPUT[sector]
          : 1),
    willOverload: status !== "overloaded" && projectedStatus === "overloaded",
  };
}

export function getCircuitLoadForecast(state: GameState, sector: Sector) {
  return buildCircuitLoadForecast(state, sector, state.pulseQueue[0] ?? "extract");
}

function applyCircuitLoad(state: GameState, sector: Sector, affinity: Sector) {
  const heat = ensureCircuitHeat(state);
  const forecast = buildCircuitLoadForecast(state, sector, affinity);
  SECTORS.forEach((candidate) => {
    heat[candidate] = candidate === sector
      ? forecast.projectedHeat
      : Math.max(0, heat[candidate] - CIRCUIT_IDLE_COOLING);
  });
  return forecast;
}

function dispatchPulse(state: GameState, events: EngineEvent[]) {
  refillPulseQueue(state);
  const affinity = state.pulseQueue.shift() ?? "extract";
  refillPulseQueue(state);
  const sector = getCurrentSector(state);
  const matched = sector === affinity;
  const jammed = isSectorJammed(state, sector);
  const targetCanReceive = targetCanReceivePulse(state, sector);
  const load = applyCircuitLoad(state, sector, affinity);
  const overdrive = load.overdrive;
  if (overdrive) {
    state.resonance = 0;
    state.overdrives += 1;
  } else if (matched && targetCanReceive && !jammed) {
    state.resonance = Math.min(3, state.resonance + 1);
  } else if (!targetCanReceive || jammed) {
    state.resonance = 0;
  } else if (!load.urgent && state.resonance > 0) {
    // A normal miss leaks one charge. Routing into an explicitly forecast
    // emergency preserves the charge, so survival/resource decisions can
    // rationally override affinity without becoming a hidden punishment.
    state.resonance -= 1;
  }
  let multiplier = 1 + affinityBonus(state, sector, affinity);
  multiplier =
    Math.min(2, multiplier) *
    (overdrive ? 1 : load.outputMultiplier) *
    (jammed ? 0.5 : 1);
  multiplier = round(multiplier);

  state.transits.push({
    id: nextId(state),
    sector,
    affinity,
    progress: 0,
    multiplier,
    matched,
    overdrive,
    jammed,
    loadMultiplier: load.outputMultiplier,
    heatAfter: load.projectedHeat,
    urgent: load.urgent,
    targetReady: targetCanReceive,
  });
  state.totalPulses += 1;
  state.routeLog.push(sector);
  state.routeLog = state.routeLog.slice(-12);
  state.score += matched ? 25 : 0;
  if (overdrive) {
    state.score += 150;
    addNotice(state, `RESONANCE OVERDRIVE ×${multiplier.toFixed(2)}`, "good", 1.25);
    events.push({ kind: "overdrive", sector });
  } else if (matched) {
    addNotice(state, `FREQUENCY MATCH ×${multiplier.toFixed(2)}`, "good", 0.9);
  }
  if (load.urgent && !matched && targetCanReceive && !jammed) {
    addNotice(state, `${sector.toUpperCase()} PRIORITY RELIEF`, "info", 1.1);
  }
  if (load.willOverload) {
    state.overloads = (state.overloads ?? 0) + 1;
    addNotice(state, `${sector.toUpperCase()} OVERLOAD // OUTPUT 15%`, "danger", 1.6);
    events.push({ kind: "overload", sector });
  }
  events.push({ kind: "pulse", sector });
}

function chooseUpgradeCandidates(state: GameState) {
  if (state.waveIndex === 0 && state.upgrades.length === 0) {
    state.upgradeChoices = ["lean-press", "rail-coil", "arc-fork"];
    return;
  }
  const available = UPGRADES.filter((upgrade) => !state.upgrades.includes(upgrade.id));
  const choices: string[] = [];
  SECTORS.forEach((branch) => {
    const branchPool = available.filter((upgrade) => upgrade.branch === branch);
    if (branchPool.length) {
      choices.push(branchPool[Math.floor(random(state) * branchPool.length)].id);
    }
  });
  if (choices.length < 3) {
    const extras = shuffle(
      state,
      available.filter((upgrade) => !choices.includes(upgrade.id)),
    );
    while (choices.length < 3 && extras.length) choices.push(extras.shift()!.id);
  }
  state.upgradeChoices = choices.slice(0, 3);
}

export function selectUpgrade(state: GameState, upgradeId: string): EngineEvent[] {
  if (state.phase !== "upgrade" || !state.upgradeChoices.includes(upgradeId)) return [];
  if (!state.upgrades.includes(upgradeId)) state.upgrades.push(upgradeId);
  state.upgradeChoices = [];
  state.phase = "intermission";
  state.intermissionLeft = 2.1;
  addNotice(state, "MODULE INSTALLED", "good", 1.6);
  return [{ kind: "upgrade" }];
}

function finishWave(state: GameState, events: EngineEvent[]) {
  if (state.waveIndex >= WAVES.length - 1) {
    state.phase = "won";
    state.score += state.integrity * 750;
    events.push({ kind: "win" });
    return;
  }
  chooseUpgradeCandidates(state);
  state.phase = "upgrade";
  events.push({ kind: "wave", amount: state.waveIndex + 1 });
}

export function advanceGame(state: GameState, deltaSeconds: number): EngineEvent[] {
  const events: EngineEvent[] = [];
  const delta = Math.max(0, Math.min(deltaSeconds, 0.05));

  if (state.phase === "intermission") {
    state.clock += delta;
    state.intermissionLeft = Math.max(0, state.intermissionLeft - delta);
    state.notices = state.notices.filter((notice) => notice.expiresAt > state.clock);
    if (state.intermissionLeft <= 0) startWave(state, state.waveIndex + 1);
    return events;
  }

  if (state.phase !== "playing") return events;

  if (
    state.tutorialStep < 3 &&
    state.transits.length === 0 &&
    getCurrentSector(state) !== SECTORS[state.tutorialStep as 0 | 1 | 2]
  ) {
    return events;
  }

  state.clock += delta;
  state.waveElapsed += delta;
  state.notices = state.notices.filter((notice) => notice.expiresAt > state.clock);
  state.jams = state.jams.filter((jam) => jam.activeUntil > state.clock);
  if (state.shotEffect && state.shotEffect.expiresAt <= state.clock) state.shotEffect = null;

  while (
    state.spawnCursor < state.spawnSchedule.length &&
    state.waveElapsed >= state.spawnSchedule[state.spawnCursor].at
  ) {
    const entry = state.spawnSchedule[state.spawnCursor];
    state.spawnCursor += 1;
    spawnEnemy(state, entry.kind, events);
  }

  applyEnemyMovement(state, delta, events);
  if (state.integrity <= 0) return events;

  const resolvedIds: number[] = [];
  state.transits.forEach((pulse) => {
    pulse.progress += delta / TRANSIT_SECONDS;
    if (pulse.progress >= 1) resolvedIds.push(pulse.id);
  });
  resolvedIds.forEach((pulseId) => resolveTransit(state, pulseId, events));
  state.transits = state.transits.filter((pulse) => !resolvedIds.includes(pulse.id));

  state.pulseElapsed += delta;
  while (state.pulseElapsed >= state.pulseInterval) {
    state.pulseElapsed -= state.pulseInterval;
    dispatchPulse(state, events);
  }

  const waveSpawnsDone = state.spawnCursor >= state.spawnSchedule.length;
  const minimumReached = state.waveElapsed >= (WAVES[state.waveIndex].minimumDuration ?? 0);
  if (minimumReached && waveSpawnsDone && state.enemies.length === 0 && state.transits.length === 0) {
    finishWave(state, events);
  }

  return events;
}

export function getPulseProgress(state: GameState) {
  return Math.min(1, state.pulseElapsed / state.pulseInterval);
}

export function getWaveProgress(state: GameState) {
  const totalThreats = state.spawnSchedule.length;
  if (!totalThreats) return 0;
  const progressUnits = state.spawnCursor + Math.min(state.waveResolved, totalThreats);
  return Math.min(1, progressUnits / (totalThreats * 2));
}

export function getWaveReadout(state: GameState) {
  const nextSpawn = state.spawnSchedule[state.spawnCursor];
  if (nextSpawn) {
    return {
      kind: "next" as const,
      seconds: Math.max(0, Math.ceil(nextSpawn.at - state.waveElapsed)),
    };
  }
  if (state.enemies.length) return { kind: "remaining" as const, count: state.enemies.length };
  if (state.transits.length) return { kind: "resolving" as const };
  return { kind: "clear" as const };
}

export function getDefenseForecast(state: GameState) {
  const approaching = state.enemies
    .map((enemy) => ({
      enemy,
      etaSeconds:
        Math.max(0, enemy.stunnedUntil - state.clock) + Math.max(0, 1 - enemy.progress) / enemy.speed,
    }))
    .sort((a, b) => a.etaSeconds - b.etaSeconds);
  const primary = approaching[0];
  if (!primary) return null;
  const threatWindow = approaching.filter((item) => item.etaSeconds <= primary.etaSeconds + 2.5);
  const totalHp = threatWindow.reduce((sum, item) => sum + item.enemy.hp, 0);
  const totalBreachDamage = threatWindow.reduce((sum, item) => sum + item.enemy.breachDamage, 0);
  const damagePerAmmo = hasUpgrade(state, "rail-coil") ? 3.75 : 3;
  const loadedMultiplier = hasUpgrade(state, "loaded-capacitor") && state.ammo >= 12 ? 1.5 : 1;
  const damagePerPulse = 4 * damagePerAmmo * loadedMultiplier;
  const ammoRequired = Math.max(1, Math.ceil(totalHp / (damagePerAmmo * loadedMultiplier)));
  return {
    enemy: primary.enemy,
    threatCount: threatWindow.length,
    etaSeconds: primary.etaSeconds,
    totalHp,
    breachDamage: totalBreachDamage,
    ammoRequired,
    defensePulsesRequired: Math.max(1, Math.ceil(totalHp / damagePerPulse)),
    hasEnoughAmmo: state.ammo >= ammoRequired,
  };
}

export function getActiveJamState(state: GameState, sector: Sector) {
  const matching = state.jams.filter((jam) => jam.sector === sector);
  if (matching.some((jam) => state.clock >= jam.warningUntil && state.clock < jam.activeUntil)) {
    return "active" as const;
  }
  if (matching.some((jam) => state.clock < jam.warningUntil)) return "warning" as const;
  return "none" as const;
}

export function getPhaseAllowsPause(phase: GamePhase) {
  return phase === "playing" || phase === "intermission";
}

export const GAME_LIMITS = { ore: ORE_CAP, ammo: AMMO_CAP };
