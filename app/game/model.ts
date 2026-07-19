export const SECTORS = ["extract", "fabricate", "defend"] as const;

export type Sector = (typeof SECTORS)[number];
export type CircuitLoadStatus = "stable" | "strained" | "overloaded";
export type GamePhase =
  | "ready"
  | "playing"
  | "intermission"
  | "upgrade"
  | "paused"
  | "won"
  | "lost";

export type EnemyKind = "rusher" | "sapper" | "jammer" | "warden";
export type UpgradeBranch = "extract" | "fabricate" | "defend";
export type TutorialStep = 0 | 1 | 2 | 3;
export type FailureCause =
  | "ore-full"
  | "ore-required"
  | "ammo-full"
  | "ammo-required"
  | "target-required";

export interface Enemy {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  progress: number;
  speed: number;
  breachDamage: number;
  track: number;
  spawnedAt: number;
  abilityAt: number;
  abilityUsed: boolean;
  nextAbilityAt: number;
  stunnedUntil: number;
  flashUntil: number;
}

export interface TransitPulse {
  id: number;
  sector: Sector;
  affinity: Sector;
  progress: number;
  multiplier: number;
  matched: boolean;
  overdrive: boolean;
  jammed: boolean;
  /** Output retained after the selected circuit's visible heat/load is applied. */
  loadMultiplier: number;
  /** Circuit heat after this pulse was dispatched (0..100). */
  heatAfter: number;
  /** Whether visible resource/threat demand qualified this route for relief. */
  urgent: boolean;
  /** Whether the selected machine could produce output when dispatched. */
  targetReady: boolean;
}

export interface SpawnEntry {
  at: number;
  kind: EnemyKind;
}

export interface JamEffect {
  id: number;
  sector: Sector;
  warningUntil: number;
  activeUntil: number;
  source: EnemyKind;
}

export interface Notice {
  id: number;
  text: string;
  tone: "info" | "good" | "warn" | "danger";
  expiresAt: number;
  upgradeId?: string;
}

export interface SectorEffect {
  id: number;
  sector: Sector;
  success: boolean;
  amount: number;
  cause?: FailureCause;
}

export interface ShotEffect {
  id: number;
  targetProgress: number;
  targetTrack: number;
  secondaryTargetProgress?: number;
  secondaryTargetTrack?: number;
  expiresAt: number;
  critical: boolean;
}

export interface GameState {
  phase: GamePhase;
  phaseBeforePause: GamePhase;
  clock: number;
  relayIndex: number;
  pulseElapsed: number;
  pulseInterval: number;
  pulseQueue: Sector[];
  lastInputAt: number;
  transits: TransitPulse[];
  ore: number;
  ammo: number;
  integrity: number;
  maxIntegrity: number;
  waveIndex: number;
  waveElapsed: number;
  waveResolved: number;
  spawnCursor: number;
  spawnSchedule: SpawnEntry[];
  enemies: Enemy[];
  jams: JamEffect[];
  intermissionLeft: number;
  score: number;
  kills: number;
  totalPulses: number;
  validPulses: number;
  /** Match charge. Dry routes reset it; non-urgent misses leak one; three arms overdrive. */
  resonance: number;
  overdrives: number;
  /** Visible per-circuit operating heat. High heat lowers that circuit's output. */
  circuitHeat: Record<Sector, number>;
  overloads: number;
  routeLog: Sector[];
  pulsesSinceExtract: number;
  extractCount: number;
  fabricateCount: number;
  defendCount: number;
  upgrades: string[];
  upgradeChoices: string[];
  notices: Notice[];
  sectorEffect: SectorEffect | null;
  shotEffect: ShotEffect | null;
  shakeUntil: number;
  lossCause: { enemyKind: EnemyKind; breachDamage: number } | null;
  tutorialStep: TutorialStep;
  nextId: number;
  rng: number;
}

export interface EngineEvent {
  kind:
    | "rotate"
    | "pulse"
    | "overdrive"
    | "overload"
    | "extract"
    | "fabricate"
    | "defend"
    | "fail"
    | "hit"
    | "kill"
    | "breach"
    | "spawn"
    | "jam"
    | "wave"
    | "upgrade"
    | "win"
    | "lose";
  sector?: Sector;
  amount?: number;
}

export interface UpgradeDefinition {
  id: string;
  branch: UpgradeBranch;
  icon: string;
  name: { ja: string; en: string };
  description: { ja: string; en: string };
  value: string;
}

export interface WaveDefinition {
  interval: number;
  minimumDuration?: number;
  enemyHpScale?: number;
  jitter?: number;
  title: { ja: string; en: string };
  spawns: SpawnEntry[];
}

export const ENEMY_STATS: Record<
  EnemyKind,
  {
    hp: number;
    arrival: number;
    breachDamage: number;
    icon: string;
    name: { ja: string; en: string };
  }
> = {
  rusher: {
    hp: 10,
    arrival: 16,
    breachDamage: 1,
    icon: "◆",
    name: { ja: "ラッシャー", en: "RUSHER" },
  },
  sapper: {
    hp: 18,
    arrival: 27,
    breachDamage: 2,
    icon: "⬡",
    name: { ja: "サッパー", en: "SAPPER" },
  },
  jammer: {
    hp: 28,
    arrival: 33,
    breachDamage: 2,
    icon: "✦",
    name: { ja: "ジャマー", en: "JAMMER" },
  },
  warden: {
    hp: 430,
    arrival: 72,
    breachDamage: 6,
    icon: "◉",
    name: { ja: "グリッド・ウォーデン", en: "GRID WARDEN" },
  },
};

export const WAVES: WaveDefinition[] = [
  {
    minimumDuration: 20,
    enemyHpScale: 0.8,
    jitter: 0,
    interval: 1.8,
    title: { ja: "最初の灯", en: "FIRST LIGHT" },
    spawns: [0, 6, 12, 18].map((at) => ({ at, kind: "rusher" })),
  },
  {
    interval: 1.72,
    title: { ja: "資源略奪", en: "RESOURCE RAID" },
    spawns: [
      ...[0, 6, 12, 19, 27, 33].map((at) => ({ at, kind: "rusher" as const })),
      { at: 15, kind: "sapper" as const },
    ],
  },
  {
    interval: 1.65,
    title: { ja: "回路妨害", en: "CIRCUIT DENIAL" },
    spawns: [
      ...[0, 6, 12, 20, 28, 36].map((at) => ({ at, kind: "rusher" as const })),
      ...[8, 24].map((at) => ({ at, kind: "sapper" as const })),
      { at: 23, kind: "jammer" as const },
    ],
  },
  {
    interval: 1.58,
    title: { ja: "複合侵攻", en: "COMBINED ASSAULT" },
    spawns: [
      ...[0, 5, 10, 16, 23, 30, 35, 38].map((at) => ({ at, kind: "rusher" as const })),
      ...[11, 29].map((at) => ({ at, kind: "sapper" as const })),
      { at: 25, kind: "jammer" as const },
    ],
  },
  {
    interval: 1.5,
    title: { ja: "限界圧力", en: "REDLINE" },
    spawns: [
      ...[0, 5, 10, 15, 21, 28, 34, 40].map((at) => ({ at, kind: "rusher" as const })),
      ...[8, 23, 34].map((at) => ({ at, kind: "sapper" as const })),
      ...[17, 27].map((at) => ({ at, kind: "jammer" as const })),
    ],
  },
  {
    interval: 1.45,
    title: { ja: "最終監視者", en: "THE LAST WARDEN" },
    spawns: [
      { at: 0, kind: "warden" },
      ...[8, 20, 32, 44].map((at) => ({ at, kind: "rusher" as const })),
      { at: 26, kind: "sapper" },
    ],
  },
];

export const UPGRADES: UpgradeDefinition[] = [
  {
    id: "reinforced-bit",
    branch: "extract",
    icon: "⬢",
    name: { ja: "強化ビット", en: "REINFORCED BIT" },
    description: { ja: "採掘の基礎出力+1、弾薬威力+22%", en: "+1 base ore; manufactured rounds +22% damage" },
    value: "+1 ORE",
  },
  {
    id: "resonant-drill",
    branch: "extract",
    icon: "⌁",
    name: { ja: "共振ドリル", en: "RESONANT DRILL" },
    description: { ja: "採掘の周波数一致を2倍、弾薬威力+22%", en: "Matched extraction 2×; manufactured rounds +22% damage" },
    value: "MATCH ×2.0",
  },
  {
    id: "vein-memory",
    branch: "extract",
    icon: "◇",
    name: { ja: "鉱脈記憶", en: "VEIN MEMORY" },
    description: { ja: "採掘を2回休むと鉱石+4、弾薬威力+22%", en: "+4 ore after resting extraction twice; rounds +22% damage" },
    value: "+4 ORE",
  },
  {
    id: "fracture-counter",
    branch: "extract",
    icon: "✣",
    name: { ja: "破砕カウンター", en: "FRACTURE COUNTER" },
    description: { ja: "4回目の採掘に鉱石+7、弾薬威力+22%", en: "Every 4th extraction +7 ore; rounds +22% damage" },
    value: "4TH +7",
  },
  {
    id: "lean-press",
    branch: "fabricate",
    icon: "▤",
    name: { ja: "高効率プレス", en: "LEAN PRESS" },
    description: { ja: "製造量+25%、弾薬威力+18%", en: "+25% forge yield; manufactured rounds +18% damage" },
    value: "×1.25 YIELD",
  },
  {
    id: "resonant-mold",
    branch: "fabricate",
    icon: "⌬",
    name: { ja: "共振金型", en: "RESONANT MOLD" },
    description: { ja: "製造の周波数一致を2倍、弾薬威力+18%", en: "Matched fabrication 2×; manufactured rounds +18% damage" },
    value: "MATCH ×2.0",
  },
  {
    id: "double-chamber",
    branch: "fabricate",
    icon: "▥",
    name: { ja: "二重装填室", en: "DOUBLE CHAMBER" },
    description: { ja: "鉱石8から弾薬10を製造、弾薬威力+18%", en: "Forge 10 ammo from 8 ore; manufactured rounds +18% damage" },
    value: "8 → 10",
  },
  {
    id: "scrap-recovery",
    branch: "fabricate",
    icon: "↺",
    name: { ja: "端材回収", en: "SCRAP RECOVERY" },
    description: { ja: "大量製造後に鉱石2回収、弾薬威力+18%", en: "Recover 2 ore after a large batch; rounds +18% damage" },
    value: "+2 RETURN",
  },
  {
    id: "rail-coil",
    branch: "defend",
    icon: "➤",
    name: { ja: "レールコイル", en: "RAIL COIL" },
    description: { ja: "弾薬1あたりの攻撃力を25%増やす", en: "+25% damage per ammo" },
    value: "+25% DMG",
  },
  {
    id: "arc-fork",
    branch: "defend",
    icon: "ϟ",
    name: { ja: "分岐アーク", en: "ARC FORK" },
    description: { ja: "2番目の敵にも40%の連鎖ダメージ", en: "Chain 40% damage to a second target" },
    value: "40% CHAIN",
  },
  {
    id: "loaded-capacitor",
    branch: "defend",
    icon: "▰",
    name: { ja: "充填キャパシタ", en: "LOADED CAPACITOR" },
    description: { ja: "弾薬12以上で防衛ダメージを50%増やす", en: "+50% damage while holding 12+ ammo" },
    value: "+50% DMG",
  },
  {
    id: "interdictor",
    branch: "defend",
    icon: "⊘",
    name: { ja: "阻止フィールド", en: "INTERDICTOR" },
    description: { ja: "防衛パルスで先頭3体の移動と能力を停止", en: "Defense pulses briefly stun the front 3 enemies" },
    value: "3 TARGET STUN",
  },
];

export const SECTOR_COLORS: Record<Sector, string> = {
  extract: "#ffc857",
  fabricate: "#b99aff",
  defend: "#4adff3",
};
