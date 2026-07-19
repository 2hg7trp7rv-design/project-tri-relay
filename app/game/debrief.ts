import { ENEMY_STATS, SECTORS, UPGRADES, type GameState, type Sector, type UpgradeBranch } from "./model.ts";

export type DebriefLanguage = "ja" | "en";
export type RunBuild = UpgradeBranch | "mixed";

const SECTOR_NAME: Record<DebriefLanguage, Record<Sector, string>> = {
  ja: { extract: "採掘", fabricate: "製造", defend: "防衛" },
  en: { extract: "EXTRACT", fabricate: "FABRICATE", defend: "DEFEND" },
};

function percent(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}
/** Returns only a branch evidenced by installed modules; ties stay mixed. */
export function getRunBuild(state: Pick<GameState, "upgrades">): RunBuild {
  const branches: Record<UpgradeBranch, number> = { extract: 0, fabricate: 0, defend: 0 };
  state.upgrades.forEach((upgradeId) => {
    const branch = UPGRADES.find((upgrade) => upgrade.id === upgradeId)?.branch;
    if (branch) branches[branch] += 1;
  });
  const highest = Math.max(...Object.values(branches));
  if (highest === 0) return "mixed";
  const leaders = SECTORS.filter((sector) => branches[sector] === highest);
  return leaders.length === 1 ? leaders[0] : "mixed";
}

/**
 * Produces short observations from recorded state only. These lines avoid
 * causal language: they say what was observed, never why a run was lost.
 */
export function getRunDebrief(
  state: GameState,
  language: DebriefLanguage,
  limit = 2,
) {
  if (limit <= 0) return [];
  const lines: string[] = [];
  const names = SECTOR_NAME[language];

  if (state.ammo <= 0.01) {
    lines.push(language === "ja" ? "終了時の弾薬：0" : "AMMO AT END: 0");
  }

  if (state.overloads > 0) {
    const hottest = [...SECTORS].sort(
      (left, right) => state.circuitHeat[right] - state.circuitHeat[left],
    )[0];
    const heat = Math.round(state.circuitHeat[hottest]);
    lines.push(
      language === "ja"
        ? `記録された過負荷：${state.overloads}回／終了時最高 ${names[hottest]} ${heat}`
        : `RECORDED OVERLOADS: ${state.overloads} / HOTTEST AT END ${names[hottest]} ${heat}`,
    );
  }

  if (state.totalPulses > 0) {
    const rate = percent(state.validPulses / state.totalPulses);
    lines.push(
      language === "ja"
        ? `有効送電：${state.validPulses}/${state.totalPulses}（${rate}%）`
        : `PRODUCTIVE ROUTES: ${state.validPulses}/${state.totalPulses} (${rate}%)`,
    );
  }

  const routeCounts: Record<Sector, number> = {
    extract: state.extractCount,
    fabricate: state.fabricateCount,
    defend: state.defendCount,
  };
  const routeTotal = Object.values(routeCounts).reduce((sum, count) => sum + count, 0);
  if (routeTotal > 0) {
    const highest = Math.max(...Object.values(routeCounts));
    const lowest = Math.min(...Object.values(routeCounts));
    if (highest - lowest >= Math.max(3, routeTotal * 0.2)) {
      lines.push(
        language === "ja"
          ? `送電配分：採掘 ${routeCounts.extract}／製造 ${routeCounts.fabricate}／防衛 ${routeCounts.defend}`
          : `ROUTE MIX: EXTRACT ${routeCounts.extract} / FABRICATE ${routeCounts.fabricate} / DEFEND ${routeCounts.defend}`,
      );
    }
  }

  if (state.lossCause) {
    const enemy = ENEMY_STATS[state.lossCause.enemyKind].name[language];
    lines.push(
      language === "ja"
        ? `最後の突破：${enemy}／被害 ${state.lossCause.breachDamage}`
        : `FINAL BREACH: ${enemy} / DAMAGE ${state.lossCause.breachDamage}`,
    );
  }

  return lines.slice(0, Math.max(0, Math.floor(limit)));
}
