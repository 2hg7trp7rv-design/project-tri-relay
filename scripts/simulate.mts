import {
  advanceGame,
  createGameState,
  getCircuitLoadForecast,
  getCurrentSector,
  rotateRelay,
  selectUpgrade,
  startRun,
} from "../app/game/engine.ts";
import { SECTORS, type GameState, type Sector } from "../app/game/model.ts";

const TICK = 1 / 120;
const MAX_SECONDS = 480;
const SIMULATION_RUNS = Math.max(40, Math.min(5000, Number(process.env.SIMULATION_RUNS ?? 200)));
const SIMULATION_CORE_INTEGRITY = Number(process.env.SIMULATION_CORE_INTEGRITY ?? 0);
const SKIP_EXHAUSTIVE_AUDIT = process.env.SIMULATION_SKIP_EXHAUSTIVE === "1";
const EXHAUSTIVE_CYCLE_SEEDS = Math.max(
  8,
  Math.min(64, Number(process.env.EXHAUSTIVE_CYCLE_SEEDS ?? 12)),
);
const EXHAUSTIVE_CYCLE_PULSES = Math.max(
  16,
  Math.min(96, Number(process.env.EXHAUSTIVE_CYCLE_PULSES ?? 24)),
);
const LEGACY_FIXED_CYCLE = ["extract", "extract", "fabricate", "defend"] as const;
type SimulationPolicy = "adaptive" | "fixed" | "affinity" | "affinity-valid";

const upgradePriority = [
  "rail-coil",
  "lean-press",
  "arc-fork",
  "reinforced-bit",
  "loaded-capacitor",
  "double-chamber",
  "interdictor",
  "scrap-recovery",
  "vein-memory",
  "fracture-counter",
  "resonant-mold",
  "resonant-drill",
];

function greedyTarget(state: GameState): Sector {
  const nearest = state.enemies.reduce((value, enemy) => Math.max(value, enemy.progress), 0);
  const enemyHp = state.enemies.reduce((value, enemy) => value + enemy.hp, 0);
  const affinity = state.pulseQueue[0] ?? "extract";
  const scores: Record<Sector, number> = {
    extract:
      state.ore >= 23.5
        ? -1000
        : 8 + (24 - state.ore) * 0.9 + (state.ore < 6 ? 16 : 0),
    fabricate:
      state.ore < 0.5 || state.ammo >= 19.5
        ? -1000
        : 9 + (20 - state.ammo) * 1.15 + (state.ammo < 7 ? 18 : 0),
    defend:
      !state.enemies.length || state.ammo < 0.5
        ? -1000
        : 8 + enemyHp * 0.24 + nearest * 42 + (nearest > 0.48 ? 28 : 0),
  };

  for (const sector of ["extract", "fabricate", "defend"] as const) {
    const forecast = getCircuitLoadForecast(state, sector);
    scores[sector] *= forecast.outputMultiplier;
    if (sector === affinity) scores[sector] += 26;
    if (forecast.willOverload) scores[sector] -= 24;
    if (forecast.overdrive) scores[sector] += sector === "defend" ? 34 : 22;
  }

  // A breach is worse than accepting one forecast overload. This is an
  // explicit emergency rule, not privileged information unavailable to a
  // player: enemy distance and ammunition are both visible.
  if (state.enemies.length && state.ammo >= 0.5 && nearest > 0.74) return "defend";

  return (["extract", "fabricate", "defend"] as const).reduce((best, sector) =>
    scores[sector] > scores[best] ? sector : best,
  );
}

function affinityFirstTarget(state: GameState): Sector {
  const affinity = state.pulseQueue[0] ?? "extract";
  if (getCircuitLoadForecast(state, affinity).canReceive) return affinity;
  const nearest = state.enemies.reduce((value, enemy) => Math.max(value, enemy.progress), 0);
  const enemyHp = state.enemies.reduce((value, enemy) => value + enemy.hp, 0);
  if (state.enemies.length && state.ammo >= 0.5 && (nearest > 0.42 || enemyHp > 18)) {
    return "defend";
  }
  if (state.ore >= 0.5 && state.ammo < 12) return "fabricate";
  return "extract";
}

function fixedTarget(pulse: number, cycle: readonly Sector[]): Sector {
  return cycle[pulse % cycle.length];
}

function run(
  seed: number,
  policy: SimulationPolicy,
  fixedCycle: readonly Sector[] = LEGACY_FIXED_CYCLE,
) {
  const state = startRun(seed);
  if (Number.isFinite(SIMULATION_CORE_INTEGRITY) && SIMULATION_CORE_INTEGRITY > 0) {
    state.integrity = SIMULATION_CORE_INTEGRITY;
    state.maxIntegrity = SIMULATION_CORE_INTEGRITY;
  }
  let desired: Sector = "extract";
  let chosenForPulse = -1;
  let measuredPulses = 0;
  let matchedPulses = 0;
  let overloadPulses = 0;
  let invalidPulses = 0;
  let urgentPulses = 0;
  let urgentMismatches = 0;
  const routeCounts: Record<Sector, number> = { extract: 0, fabricate: 0, defend: 0 };
  const urgentMismatchCounts: Record<Sector, number> = {
    extract: 0,
    fabricate: 0,
    defend: 0,
  };
  for (let ticks = 0; ticks < MAX_SECONDS / TICK; ticks += 1) {
    if (state.phase === "upgrade") {
      const selected = upgradePriority.find((id) => state.upgradeChoices.includes(id)) ?? state.upgradeChoices[0];
      if (selected) selectUpgrade(state, selected);
    }
    if (state.phase === "playing") {
      if (state.tutorialStep < 3) {
        desired = (["extract", "fabricate", "defend"] as Sector[])[state.tutorialStep];
        if (!state.transits.length && getCurrentSector(state) !== desired) rotateRelay(state);
      } else {
        if (chosenForPulse !== state.totalPulses) {
          desired =
            policy === "adaptive"
              ? greedyTarget(state)
              : policy === "affinity-valid"
                ? affinityFirstTarget(state)
              : policy === "affinity"
                ? state.pulseQueue[0] ?? "extract"
                : fixedTarget(state.totalPulses, fixedCycle);
          chosenForPulse = state.totalPulses;
        }
        const timeLeft = state.pulseInterval - state.pulseElapsed;
        if (
          timeLeft <= 0.29 &&
          getCurrentSector(state) !== desired &&
          state.clock - state.lastInputAt >= 0.112
        ) {
          rotateRelay(state);
        }
      }
    }
    const pulsesBefore = state.totalPulses;
    advanceGame(state, TICK);
    if (state.totalPulses > pulsesBefore && state.tutorialStep >= 3) {
      const transit = state.transits.at(-1);
      if (!transit) throw new Error(`missing transit for seed ${seed}`);
      measuredPulses += 1;
      routeCounts[transit.sector] += 1;
      matchedPulses += transit.matched ? 1 : 0;
      overloadPulses += transit.heatAfter >= 100 ? 1 : 0;
      invalidPulses += transit.targetReady ? 0 : 1;
      urgentPulses += transit.urgent ? 1 : 0;
      urgentMismatches += transit.urgent && !transit.matched ? 1 : 0;
      if (transit.urgent && !transit.matched) urgentMismatchCounts[transit.sector] += 1;
    }
    if (state.phase === "won" || state.phase === "lost") break;
  }
  return {
    won: state.phase === "won",
    wave: state.waveIndex + 1,
    score: state.score,
    integrity: state.integrity,
    maxIntegrity: state.maxIntegrity,
    pulses: state.totalPulses,
    validRate: state.totalPulses ? state.validPulses / state.totalPulses : 0,
    overloads: state.overloads,
    endingOre: state.ore,
    endingAmmo: state.ammo,
    endingWardenHp: state.enemies.find((enemy) => enemy.kind === "warden")?.hp ?? 0,
    measuredPulses,
    matchedPulses,
    overloadPulses,
    invalidPulses,
    urgentPulses,
    urgentMismatches,
    routeCounts,
    urgentMismatchCounts,
  };
}

function wilsonInterval(successes: number, total: number) {
  const z = 1.96;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denominator;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function reportFullRun(policy: SimulationPolicy) {
  const results = Array.from({ length: SIMULATION_RUNS }, (_, index) => run(1000 + index, policy));
  const wins = results.filter((result) => result.won).length;
  const average = (
    key:
      | "wave"
      | "score"
      | "integrity"
      | "validRate"
      | "overloads"
      | "endingOre"
      | "endingAmmo"
      | "endingWardenHp",
  ) =>
    results.reduce((sum, result) => sum + result[key], 0) / results.length;
  const sum = (
    key:
      | "measuredPulses"
      | "matchedPulses"
      | "overloadPulses"
      | "invalidPulses"
      | "urgentPulses"
      | "urgentMismatches",
  ) => results.reduce((total, result) => total + result[key], 0);
  const pulses = sum("measuredPulses");
  const urgent = sum("urgentPulses");
  const routeTotal = (sector: Sector) =>
    results.reduce((total, result) => total + result.routeCounts[sector], 0);
  const urgentMismatchTotal = (sector: Sector) =>
    results.reduce((total, result) => total + result.urgentMismatchCounts[sector], 0);
  const summary = {
    policy,
    runs: SIMULATION_RUNS,
    coreIntegrity: results[0]?.maxIntegrity ?? 0,
    wins,
    winRate: wins / results.length,
    winRate95: wilsonInterval(wins, results.length),
    averageWave: average("wave"),
    averageScore: Math.round(average("score")),
    averageIntegrity: average("integrity"),
    averageValidRate: average("validRate"),
    averageOverloads: average("overloads"),
    averageEndingOre: average("endingOre"),
    averageEndingAmmo: average("endingAmmo"),
    averageEndingWardenHp: average("endingWardenHp"),
    sectorShare: {
      extract: routeTotal("extract") / pulses,
      fabricate: routeTotal("fabricate") / pulses,
      defend: routeTotal("defend") / pulses,
    },
    matchRate: sum("matchedPulses") / pulses,
    mismatchRate: 1 - sum("matchedPulses") / pulses,
    overloadRate: sum("overloadPulses") / pulses,
    invalidRate: sum("invalidPulses") / pulses,
    urgentRouteRate: urgent / pulses,
    urgentMismatchRate: sum("urgentMismatches") / pulses,
    urgentOverrideShare: urgent ? sum("urgentMismatches") / urgent : 0,
    urgentMismatchSectorShare: {
      extract: urgentMismatchTotal("extract") / Math.max(1, sum("urgentMismatches")),
      fabricate: urgentMismatchTotal("fabricate") / Math.max(1, sum("urgentMismatches")),
      defend: urgentMismatchTotal("defend") / Math.max(1, sum("urgentMismatches")),
    },
  };
  console.log(
    JSON.stringify(summary),
  );
  return summary;
}

function measureLoadEfficiency(seed: number, cycle: readonly Sector[] | null) {
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
  let overloadPulses = 0;
  let matches = 0;
  for (let pulse = 0; pulse < EXHAUSTIVE_CYCLE_PULSES; pulse += 1) {
    state.ore = 8;
    state.ammo = 8;
    state.transits = [];
    const affinity = state.pulseQueue[0] ?? "extract";
    const sector = cycle ? cycle[pulse % cycle.length] : affinity;
    state.relayIndex = SECTORS.indexOf(sector);
    state.pulseElapsed = state.pulseInterval;
    advanceGame(state, TICK);
    const transit = state.transits.at(-1);
    if (!transit) throw new Error(`pulse ${pulse} was not dispatched`);
    retainedOutput += transit.loadMultiplier;
    overloadPulses += transit.heatAfter >= 100 ? 1 : 0;
    matches += transit.matched ? 1 : 0;
  }
  return {
    retainedOutput: retainedOutput / EXHAUSTIVE_CYCLE_PULSES,
    overloadRate: overloadPulses / EXHAUSTIVE_CYCLE_PULSES,
    matchRate: matches / EXHAUSTIVE_CYCLE_PULSES,
  };
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

function auditEveryFixedCycle() {
  const seeds = Array.from(
    { length: EXHAUSTIVE_CYCLE_SEEDS },
    (_, index) => 8100 + index * 97,
  );
  const adaptive = seeds.reduce(
    (sum, seed) => sum + measureLoadEfficiency(seed, null).retainedOutput,
    0,
  ) / seeds.length;
  let totalCycles = 0;
  let globalBest = 0;
  const topFixedCycles: Array<{ cycle: Sector[]; efficiency: number }> = [];
  for (let length = 2; length <= 8; length += 1) {
    let cycleCount = 0;
    let bestEfficiency = 0;
    let bestCycle: Sector[] = [];
    let bestOverloadRate = 0;
    let bestMatchRate = 0;
    forEachFixedCycle(length, (cycle) => {
      cycleCount += 1;
      const aggregate = seeds.reduce(
        (sum, seed) => {
          const metric = measureLoadEfficiency(seed, cycle);
          return {
            retainedOutput: sum.retainedOutput + metric.retainedOutput,
            overloadRate: sum.overloadRate + metric.overloadRate,
            matchRate: sum.matchRate + metric.matchRate,
          };
        },
        { retainedOutput: 0, overloadRate: 0, matchRate: 0 },
      );
      const efficiency = aggregate.retainedOutput / seeds.length;
      const key = cycle.join(">");
      if (!topFixedCycles.some((candidate) => candidate.cycle.join(">") === key)) {
        topFixedCycles.push({ cycle: [...cycle], efficiency });
        topFixedCycles.sort((a, b) => b.efficiency - a.efficiency);
        topFixedCycles.length = Math.min(topFixedCycles.length, 8);
      }
      if (efficiency > bestEfficiency) {
        bestEfficiency = efficiency;
        bestCycle = [...cycle];
        bestOverloadRate = aggregate.overloadRate / seeds.length;
        bestMatchRate = aggregate.matchRate / seeds.length;
      }
    });
    totalCycles += cycleCount;
    globalBest = Math.max(globalBest, bestEfficiency);
    console.log(JSON.stringify({
      audit: "fixed-cycle-load",
      length,
      cycleCount,
      seeds: seeds.length,
      pulsesPerSeed: EXHAUSTIVE_CYCLE_PULSES,
      adaptiveEfficiency: adaptive,
      bestFixedEfficiency: bestEfficiency,
      bestFixedCycle: bestCycle,
      bestFixedMatchRate: bestMatchRate,
      bestFixedOverloadRate: bestOverloadRate,
    }));
  }
  console.log(JSON.stringify({
    audit: "fixed-cycle-load-summary",
    lengths: "2-8",
    totalCycles,
    seeds: seeds.length,
    adaptiveEfficiency: adaptive,
    bestFixedEfficiency: globalBest,
    minimumGap: adaptive - globalBest,
    passed: globalBest <= adaptive - 0.08,
  }));
  if (globalBest > adaptive - 0.08) process.exitCode = 1;

  // The exhaustive pulse-level screen is cheap enough to cover all 9,837
  // cycles. Then challenge the real six-wave game with its eight strongest
  // survivors; this catches a lower-output pattern that might still exploit
  // enemy timing or stockpile thresholds.
  const challengeRuns = Math.min(80, SIMULATION_RUNS);
  const adaptiveResults = Array.from(
    { length: challengeRuns },
    (_, index) => run(12000 + index, "adaptive"),
  );
  const adaptiveWins = adaptiveResults.filter((result) => result.won).length;
  const averageResult = (
    results: ReturnType<typeof run>[],
    key: "wave" | "score" | "integrity",
  ) => results.reduce((sum, result) => sum + result[key], 0) / results.length;
  let bestFixedWinRate = -1;
  let bestFixedScore = -1;
  let bestFixedWinningCycle: Sector[] = [];
  for (const candidate of topFixedCycles) {
    const results = Array.from(
      { length: challengeRuns },
      (_, index) => run(12000 + index, "fixed", candidate.cycle),
    );
    const wins = results.filter((result) => result.won).length;
    const winRate = wins / challengeRuns;
    const averageScore = averageResult(results, "score");
    if (winRate > bestFixedWinRate || (winRate === bestFixedWinRate && averageScore > bestFixedScore)) {
      bestFixedWinRate = winRate;
      bestFixedScore = averageScore;
      bestFixedWinningCycle = candidate.cycle;
    }
    console.log(JSON.stringify({
      audit: "fixed-cycle-full-run-challenge",
      cycle: candidate.cycle,
      screenedEfficiency: candidate.efficiency,
      runs: challengeRuns,
      wins,
      winRate,
      averageWave: averageResult(results, "wave"),
      averageScore: Math.round(averageScore),
      averageIntegrity: averageResult(results, "integrity"),
    }));
  }
  const adaptiveWinRate = adaptiveWins / challengeRuns;
  console.log(JSON.stringify({
    audit: "fixed-cycle-full-run-summary",
    challengers: topFixedCycles.length,
    runsPerPolicy: challengeRuns,
    adaptiveWinRate,
    adaptiveAverageWave: averageResult(adaptiveResults, "wave"),
    adaptiveAverageScore: Math.round(averageResult(adaptiveResults, "score")),
    adaptiveAverageIntegrity: averageResult(adaptiveResults, "integrity"),
    bestFixedWinRate,
    bestFixedAverageScore: Math.round(bestFixedScore),
    bestFixedWinningCycle,
    gap: adaptiveWinRate - bestFixedWinRate,
    passed: bestFixedWinRate <= adaptiveWinRate - 0.2,
  }));
  if (bestFixedWinRate > adaptiveWinRate - 0.2) process.exitCode = 1;
}

const adaptiveSummary = reportFullRun("adaptive");
reportFullRun("fixed");
const affinitySummary = reportFullRun("affinity");
const affinityValidSummary = reportFullRun("affinity-valid");
const adversarialGap = adaptiveSummary.winRate - affinitySummary.winRate;
const scoreGap = adaptiveSummary.averageScore - affinitySummary.averageScore;
const fallbackGap = adaptiveSummary.winRate - affinityValidSummary.winRate;
const fallbackScoreGap =
  adaptiveSummary.averageScore - affinityValidSummary.averageScore;
const fallbackGapBasisPoints = Math.round(fallbackGap * 10_000);
const adversarialPassed =
  affinitySummary.winRate <= 0.5 &&
  adversarialGap >= 0.2 &&
  scoreGap >= 10_000 &&
  fallbackGapBasisPoints >= 1_000 &&
  fallbackScoreGap >= 1_500 &&
  adaptiveSummary.urgentMismatchRate >= 0.03 &&
  adaptiveSummary.urgentOverrideShare >= 0.25;
console.log(JSON.stringify({
  audit: "affinity-autopilot",
  adaptiveWinRate: adaptiveSummary.winRate,
  affinityWinRate: affinitySummary.winRate,
  winRateGap: adversarialGap,
  adaptiveAverageScore: adaptiveSummary.averageScore,
  affinityAverageScore: affinitySummary.averageScore,
  scoreGap,
  affinityValidWinRate: affinityValidSummary.winRate,
  affinityValidAverageScore: affinityValidSummary.averageScore,
  affinityValidWinRateGap: fallbackGap,
  affinityValidWinRateGapBasisPoints: fallbackGapBasisPoints,
  affinityValidScoreGap: fallbackScoreGap,
  affinitySectorShare: affinitySummary.sectorShare,
  adaptiveUrgentMismatchRate: adaptiveSummary.urgentMismatchRate,
  adaptiveUrgentOverrideShare: adaptiveSummary.urgentOverrideShare,
  passed: adversarialPassed,
}));
if (!adversarialPassed) process.exitCode = 1;
if (!SKIP_EXHAUSTIVE_AUDIT) auditEveryFixedCycle();
