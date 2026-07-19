import {
  advanceGame,
  createGameState,
  getCircuitLoadForecast,
  getCurrentSector,
  getDefenseForecast,
  rotateRelay,
  selectUpgrade,
  startRun,
} from "../app/game/engine.ts";
import { SECTORS, type GameState, type Sector } from "../app/game/model.ts";

const TICK = 1 / 120;
const MAX_SECONDS = 480;
const SIMULATION_RUNS = Math.max(500, Math.min(5000, Number(process.env.SIMULATION_RUNS ?? 1000)));
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
type SimulationPolicy =
  | "heat-aware"
  | "old-ui-recommendation"
  | "simple-threshold"
  | "fixed"
  | "affinity"
  | "affinity-valid";
type BuildPlan = "mixed" | "extract" | "fabricate" | "defend";

const upgradePriorities: Record<BuildPlan, readonly string[]> = {
  mixed: [
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
  ],
  extract: [
    "reinforced-bit",
    "resonant-drill",
    "vein-memory",
    "fracture-counter",
    "rail-coil",
    "lean-press",
    "arc-fork",
    "loaded-capacitor",
    "double-chamber",
    "interdictor",
    "scrap-recovery",
    "resonant-mold",
  ],
  fabricate: [
    "lean-press",
    "resonant-mold",
    "double-chamber",
    "scrap-recovery",
    "rail-coil",
    "reinforced-bit",
    "arc-fork",
    "loaded-capacitor",
    "interdictor",
    "vein-memory",
    "fracture-counter",
    "resonant-drill",
  ],
  defend: [
    "rail-coil",
    "arc-fork",
    "loaded-capacitor",
    "interdictor",
    "lean-press",
    "reinforced-bit",
    "double-chamber",
    "scrap-recovery",
    "vein-memory",
    "fracture-counter",
    "resonant-mold",
    "resonant-drill",
  ],
};

function heatAwareTarget(state: GameState): Sector {
  const base = oldUiRecommendationTarget(state);
  const baseForecast = getCircuitLoadForecast(state, base);
  const defense = getDefenseForecast(state);
  if (base === "defend" && defense && defense.etaSeconds <= 4.5) return base;
  if (baseForecast.canReceive && baseForecast.outputMultiplier >= 0.85) return base;

  const affinity = state.pulseQueue[0] ?? "extract";
  const scores: Record<Sector, number> = { extract: -1000, fabricate: -1000, defend: -1000 };
  for (const sector of SECTORS) {
    const forecast = getCircuitLoadForecast(state, sector);
    if (!forecast.canReceive) continue;
    scores[sector] = forecast.outputMultiplier * 50;
    if (sector === affinity) scores[sector] += 18;
    if (forecast.urgent) scores[sector] += 20;
    if (forecast.overdrive) scores[sector] += sector === "defend" ? 30 : 18;
    if (sector === base) scores[sector] += 12;
    if (sector === "extract") scores[sector] += (24 - state.ore) * 0.35;
    if (sector === "fabricate") scores[sector] += (20 - state.ammo) * 0.45;
    if (sector === "defend") {
      scores[sector] += state.enemies.reduce((sum, enemy) => sum + enemy.hp, 0) * 0.08;
    }
  }
  return (["extract", "fabricate", "defend"] as const).reduce((best, sector) =>
    scores[sector] > scores[best] ? sector : best,
  );
}

/** The exact post-tutorial recommendation removed from v0.4's player UI. */
function oldUiRecommendationTarget(state: GameState): Sector {
  const defense = getDefenseForecast(state);
  if (defense && defense.etaSeconds <= 4.5 && state.ammo >= 1) return "defend";
  if (state.ammo < 4 && state.ore >= 2) return "fabricate";
  if (state.ore < 8) return "extract";
  return state.pulseQueue[0] ?? "extract";
}

function simpleThresholdTarget(state: GameState): Sector {
  const nearest = state.enemies.reduce((value, enemy) => Math.max(value, enemy.progress), 0);
  if (state.enemies.length && state.ammo >= 0.5 && nearest > 0.53) {
    return "defend";
  }
  if (state.ore >= 0.5 && state.ammo < 4.5) return "fabricate";
  if (state.ore < 8) return "extract";
  return state.pulseQueue[0] ?? "extract";
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
  // The three guided pulses are not part of the player's repeated policy.
  // Phase zero begins with the first unguided decision.
  return cycle[Math.max(0, pulse - 3) % cycle.length];
}

function run(
  seed: number,
  policy: SimulationPolicy,
  buildPlan: BuildPlan = "mixed",
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
      const selected =
        upgradePriorities[buildPlan].find((id) => state.upgradeChoices.includes(id)) ??
        state.upgradeChoices[0];
      if (selected) selectUpgrade(state, selected);
    }
    if (state.phase === "playing") {
      if (state.tutorialStep < 3) {
        desired = (["extract", "fabricate", "defend"] as Sector[])[state.tutorialStep];
        if (!state.transits.length && getCurrentSector(state) !== desired) rotateRelay(state);
      } else {
        if (chosenForPulse !== state.totalPulses) {
          desired =
            policy === "heat-aware"
              ? heatAwareTarget(state)
              : policy === "old-ui-recommendation"
                ? oldUiRecommendationTarget(state)
                : policy === "simple-threshold"
                  ? simpleThresholdTarget(state)
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
    durationSeconds: state.clock,
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

function reportFullRun(policy: SimulationPolicy, buildPlan: BuildPlan = "mixed") {
  const results = Array.from(
    { length: SIMULATION_RUNS },
    (_, index) => run(1000 + index, policy, buildPlan),
  );
  const wins = results.filter((result) => result.won).length;
  const winningResults = results.filter((result) => result.won);
  const average = (
    key:
      | "wave"
      | "score"
      | "integrity"
      | "validRate"
      | "overloads"
      | "endingOre"
      | "endingAmmo"
      | "endingWardenHp"
      | "durationSeconds"
      | "pulses",
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
    buildPlan,
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
    averageDurationSeconds: average("durationSeconds"),
    averagePulses: average("pulses"),
    averageWinningDurationSeconds: winningResults.length
      ? winningResults.reduce((sum, result) => sum + result.durationSeconds, 0) /
        winningResults.length
      : null,
    averageWinningPulses: winningResults.length
      ? winningResults.reduce((sum, result) => sum + result.pulses, 0) /
        winningResults.length
      : null,
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
  state.waveIndex = 2;
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

function forEachPrimitiveCycle(length: number, visit: (cycle: readonly Sector[]) => void) {
  const cycle = Array<Sector>(length);
  const walk = (index: number) => {
    if (index === length) {
      const hasShorterPeriod = Array.from(
        { length: Math.max(0, length - 1) },
        (_, periodIndex) => periodIndex + 1,
      ).some(
        (period) =>
          length % period === 0 &&
          cycle.every((sector, cycleIndex) => sector === cycle[cycleIndex % period]),
      );
      if (hasShorterPeriod) return;
      const phases = cycle.map((_, offset) => [
        ...cycle.slice(offset),
        ...cycle.slice(0, offset),
      ]);
      const normalized = phases.reduce((best, phase) =>
        phase.join(">") < best.join(">") ? phase : best,
      );
      if (cycle.join(">") === normalized.join(">")) visit([...cycle]);
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
  const screenedCycles: Array<{ cycle: Sector[]; efficiency: number }> = [];
  for (let length = 1; length <= 8; length += 1) {
    let cycleCount = 0;
    let bestEfficiency = 0;
    let bestCycle: Sector[] = [];
    let bestOverloadRate = 0;
    let bestMatchRate = 0;
    forEachPrimitiveCycle(length, (cycle) => {
      cycleCount += 1;
      const phaseMetrics = cycle.map((_, offset) => {
        const phase = [...cycle.slice(offset), ...cycle.slice(0, offset)];
        const aggregate = seeds.reduce(
          (sum, seed) => {
            const metric = measureLoadEfficiency(seed, phase);
            return {
              retainedOutput: sum.retainedOutput + metric.retainedOutput,
              overloadRate: sum.overloadRate + metric.overloadRate,
              matchRate: sum.matchRate + metric.matchRate,
            };
          },
          { retainedOutput: 0, overloadRate: 0, matchRate: 0 },
        );
        return { phase, aggregate };
      });
      const { phase, aggregate } = phaseMetrics.reduce((best, candidate) =>
        candidate.aggregate.retainedOutput > best.aggregate.retainedOutput
          ? candidate
          : best,
      );
      const efficiency = aggregate.retainedOutput / seeds.length;
      screenedCycles.push({ cycle: phase, efficiency });
      if (efficiency > bestEfficiency) {
        bestEfficiency = efficiency;
        bestCycle = phase;
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
    lengths: "1-8",
    totalCycles,
    seeds: seeds.length,
    adaptiveEfficiency: adaptive,
    bestFixedEfficiency: globalBest,
    minimumGap: adaptive - globalBest,
    passed: globalBest <= adaptive - 0.08,
  }));
  if (totalCycles !== 1_318) process.exitCode = 1;
  if (globalBest > adaptive - 0.08) process.exitCode = 1;

  // The primitive, phase-normalized screen covers every unique cycle once.
  // A short, disjoint full-run screen promotes 137 adversarial candidates.
  // This catches lower-output cycles that can still exploit wave timing or
  // stockpile thresholds; the promoted candidates then face 80 fresh seeds.
  const preScreenRuns = 2;
  const challengers = screenedCycles
    .map((candidate) => {
      const phases = candidate.cycle.map((_, offset) => [
        ...candidate.cycle.slice(offset),
        ...candidate.cycle.slice(0, offset),
      ]);
      const buildScreens = phases
        .flatMap((phase) =>
          (["mixed", "extract", "fabricate", "defend"] as const).map((buildPlan) => {
            const results = Array.from(
              { length: preScreenRuns },
              (_, index) => run(11000 + index, "fixed", buildPlan, phase),
            );
            return {
              phase,
              buildPlan,
              wins: results.filter((result) => result.won).length,
              wave: results.reduce((sum, result) => sum + result.wave, 0) / results.length,
              score: results.reduce((sum, result) => sum + result.score, 0) / results.length,
            };
          }),
        )
        .sort(
          (a, b) =>
            b.wins - a.wins || b.wave - a.wave || b.score - a.score,
        );
      const bestBuild = buildScreens[0];
      return {
        ...candidate,
        cycle: bestBuild.phase,
        buildPlan: bestBuild.buildPlan,
        preScreenWins: bestBuild.wins,
        preScreenWave: bestBuild.wave,
        preScreenScore: bestBuild.score,
      };
    })
    .sort(
      (a, b) =>
        b.preScreenWins - a.preScreenWins ||
        b.preScreenWave - a.preScreenWave ||
        b.preScreenScore - a.preScreenScore ||
        b.efficiency - a.efficiency,
    )
    .slice(0, 137);
  const challengeRuns = Math.min(80, SIMULATION_RUNS);
  const adaptiveResults = Array.from(
    { length: challengeRuns },
      (_, index) => run(12000 + index, "heat-aware"),
  );
  const adaptiveWins = adaptiveResults.filter((result) => result.won).length;
  const averageResult = (
    results: ReturnType<typeof run>[],
    key: "wave" | "score" | "integrity",
  ) => results.reduce((sum, result) => sum + result[key], 0) / results.length;
  let bestFixedWinRate = -1;
  let bestFixedScore = -1;
  let bestFixedWinningCycle: Sector[] = [];
  let bestFixedBuildPlan: BuildPlan = "mixed";
  for (const candidate of challengers) {
    const results = Array.from(
      { length: challengeRuns },
      (_, index) => run(12000 + index, "fixed", candidate.buildPlan, candidate.cycle),
    );
    const wins = results.filter((result) => result.won).length;
    const winRate = wins / challengeRuns;
    const averageScore = averageResult(results, "score");
    if (winRate > bestFixedWinRate || (winRate === bestFixedWinRate && averageScore > bestFixedScore)) {
      bestFixedWinRate = winRate;
      bestFixedScore = averageScore;
      bestFixedWinningCycle = candidate.cycle;
      bestFixedBuildPlan = candidate.buildPlan;
    }
    console.log(JSON.stringify({
      audit: "fixed-cycle-full-run-challenge",
      cycle: candidate.cycle,
      buildPlan: candidate.buildPlan,
      screenedEfficiency: candidate.efficiency,
      preScreenRuns,
      preScreenWins: candidate.preScreenWins,
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
    challengers: challengers.length,
    runsPerPolicy: challengeRuns,
    adaptiveWinRate,
    adaptiveAverageWave: averageResult(adaptiveResults, "wave"),
    adaptiveAverageScore: Math.round(averageResult(adaptiveResults, "score")),
    adaptiveAverageIntegrity: averageResult(adaptiveResults, "integrity"),
    bestFixedWinRate,
    bestFixedAverageScore: Math.round(bestFixedScore),
    bestFixedWinningCycle,
    bestFixedBuildPlan,
    gap: adaptiveWinRate - bestFixedWinRate,
    passed: bestFixedWinRate <= adaptiveWinRate - 0.2,
  }));
  if (bestFixedWinRate > adaptiveWinRate - 0.2) process.exitCode = 1;
}

const onlyPolicy = process.env.SIMULATION_ONLY_POLICY as SimulationPolicy | undefined;
if (onlyPolicy) {
  reportFullRun(onlyPolicy);
} else {
const heatAwareSummary = reportFullRun("heat-aware");
const oldUiSummary = reportFullRun("old-ui-recommendation");
const simpleSummary = reportFullRun("simple-threshold");
reportFullRun("fixed");
const affinitySummary = reportFullRun("affinity");
const affinityValidSummary = reportFullRun("affinity-valid");
const extractBuildSummary = reportFullRun("heat-aware", "extract");
const fabricateBuildSummary = reportFullRun("heat-aware", "fabricate");
const defendBuildSummary = reportFullRun("heat-aware", "defend");

const adversarialGap = heatAwareSummary.winRate - affinitySummary.winRate;
const oldUiGap = heatAwareSummary.winRate - oldUiSummary.winRate;
const fallbackGap = heatAwareSummary.winRate - affinityValidSummary.winRate;
const routingGatePassed =
  SIMULATION_RUNS >= 500 &&
  heatAwareSummary.winRate >= 0.5 &&
  affinitySummary.winRate <= 0.5 &&
  adversarialGap >= 0.2 &&
  oldUiGap >= 0.03 &&
  simpleSummary.winRate <= 0.2 &&
  fallbackGap >= 0.05 &&
  heatAwareSummary.urgentMismatchRate >= 0.03 &&
  heatAwareSummary.urgentOverrideShare >= 0.25;
console.log(JSON.stringify({
  audit: "routing-policy-gate",
  runs: SIMULATION_RUNS,
  heatAwareWinRate: heatAwareSummary.winRate,
  oldUiRecommendationWinRate: oldUiSummary.winRate,
  oldUiGap,
  simpleThresholdWinRate: simpleSummary.winRate,
  affinityWinRate: affinitySummary.winRate,
  affinityGap: adversarialGap,
  affinityValidWinRate: affinityValidSummary.winRate,
  affinityValidGap: fallbackGap,
  heatAwareUrgentMismatchRate: heatAwareSummary.urgentMismatchRate,
  heatAwareUrgentOverrideShare: heatAwareSummary.urgentOverrideShare,
  passed: routingGatePassed,
}));
if (!routingGatePassed) process.exitCode = 1;

const specialistBuilds = [
  extractBuildSummary,
  fabricateBuildSummary,
  defendBuildSummary,
];
const lowestBuildWinRate = Math.min(...specialistBuilds.map((summary) => summary.winRate));
const highestBuildWinRate = Math.max(...specialistBuilds.map((summary) => summary.winRate));
const buildSpread = highestBuildWinRate - lowestBuildWinRate;
const buildGatePassed =
  SIMULATION_RUNS >= 500 && lowestBuildWinRate >= 0.2 && buildSpread <= 0.1;
console.log(JSON.stringify({
  audit: "build-viability-gate",
  runsPerBuild: SIMULATION_RUNS,
  extractWinRate: extractBuildSummary.winRate,
  fabricateWinRate: fabricateBuildSummary.winRate,
  defendWinRate: defendBuildSummary.winRate,
  minimumWinRate: lowestBuildWinRate,
  spread: buildSpread,
  passed: buildGatePassed,
}));
if (!buildGatePassed) process.exitCode = 1;
if (!SKIP_EXHAUSTIVE_AUDIT) auditEveryFixedCycle();
}
