"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { AudioDirector } from "./audio";
import {
  GAME_LIMITS,
  advanceGame,
  cloneGameState,
  createGameState,
  getActiveJamState,
  getCircuitLoadForecast,
  getCurrentSector,
  getDefenseForecast,
  getPulseProgress,
  getWaveReadout,
  getWaveProgress,
  isCircuitLoadEnabled,
  isResonanceEnabled,
  pauseGame,
  resumeGame,
  rotateRelay,
  selectUpgrade,
  startRun,
} from "./engine";
import {
  ENEMY_STATS,
  SECTORS,
  SECTOR_COLORS,
  UPGRADES,
  WAVES,
  type EngineEvent,
  type FailureCause,
  type GameState,
  type Sector,
} from "./model";
import { PlatformBridge } from "./platform";
import { getRunDebrief } from "./debrief";
import {
  DEFAULT_PROFILE,
  PROFILE_KEY,
  safeReadActiveRun,
  safeReadProfile,
  safeWriteActiveRun,
  safeWriteProfile,
  type Profile,
} from "./persistence";
import {
  RunEvidenceTracker,
  type RunEvidenceResult,
  type RunStartSource,
} from "./playtest-metrics";
import { CityGate, EnemyGlyph, MachineGlyph, RelayDial, WorldStateOverlay } from "./production-visuals";
import { UiIcon } from "./ui-icons";
import { trackGameEvent } from "./telemetry";

type Language = "ja" | "en";

const INITIAL_GAME_STATE = createGameState(0x57a17);

const TEXT = {
  ja: {
    titleKicker: "崩壊都市・最終夜勤",
    title: "TRI RELAY",
    subtitle: "LAST SHIFT",
    premise: "タップで送電先を切り替える。採掘で鉱石を得て、製造で弾薬を作り、防衛で敵を止める。",
    start: "シフト開始",
    startGuided: "操作説明つきで開始",
    skipTutorial: "操作説明をスキップして開始",
    replay: "もう一度挑戦",
    continue: "復帰する",
    paused: "送電停止中",
    victory: "夜明けを守った",
    defeat: "都市電力、喪失",
    upgrade: "改造モジュールを1つ選択",
    upgradeSub: "選択中、侵攻と電力パルスは停止しています",
    core: "都市耐久",
    wave: "ウェーブ",
    score: "スコア",
    best: "最高記録",
    runs: "試行",
    wins: "勝利",
    privacy: "計測とプライバシー",
    valid: "有効パルス",
    nextPulse: "次の周波数",
    next: "NEXT",
    rotate: "タップで120°回転",
    tapRelay: "中央リレーをタップ",
    tap: "タップ",
    routeNow: "次は",
    pause: "一時停止",
    mute: "音声を切る",
    unmute: "音声を戻す",
    language: "EN",
    languageLabel: "英語へ切り替え",
    active: "稼働中",
    installed: "装備中",
    intermission: "次の侵攻まで",
    sector: {
      extract: "採掘",
      fabricate: "製造",
      defend: "防衛",
    },
    sectorShort: {
      extract: "ORE",
      fabricate: "AMMO",
      defend: "THREAT",
    },
    tutorial: [
      "① 採掘へつなぐ",
      "② 製造へつなぐ",
      "③ 防衛へつなぐ",
    ],
    affinityHelp: "次の周波数と同じ色へ合わせると出力が上昇する。空の設備へ送ると出力は失われる。",
    contact: "接触まで",
    nextThreat: "次の侵攻",
    breach: "突破被害",
    attacks: "撃破目安",
    shot: "射",
    cityStatus: "第7区・送電維持中",
    scan: "侵入路を走査中",
    failureCause: "防衛線を突破した",
    waveNext: "増援",
    waveRemaining: "残敵",
    resolving: "処理中",
    clear: "制圧",
    flowEnemy: "敵の状況",
    flowConnection: "現在の送電先",
    flowControl: "送電先を切り替える",
    flowResult: "直前の結果",
    pulseIn: "送電まで",
    waitingInput: "切替待ち",
    switchTap: "タップで切替",
    firstEnemyWait: "最初の敵は操作後に接近",
    firstEnemyWaitShort: "操作で敵始動",
    waitingPulse: "次のパルスを待機中",
    success: "成功",
    failed: "失敗",
    need: "必要",
    loopHint: "採掘 → 製造 → 防衛",
    connected: "接続済み",
    commandDefend: "敵が接近 — 防衛へ切り替える",
    commandFabricate: "弾薬を作る — 製造へ切り替える",
    commandExtract: "鉱石を得る — 採掘へ切り替える",
    commandMatch: "次の周波数に合わせる",
    nextPulseShort: "次パルス",
    matchBonus: "色一致・出力上昇",
    sent: "へ送電",
    oreResource: "鉱石",
    ammoResource: "弾薬",
    coreResource: "都市",
    damage: "ダメージ",
    noPulseYet: "まだ送電していません",
    tutorialLocked: "正しい接続先になるまで時間は止まります",
    armed: "防衛待機",
    armedShort: "待機",
    defenseEmpty: "弾薬 0",
    hostiles: "敵",
    enemyShort: {
      rusher: "突撃",
      sapper: "略奪",
      jammer: "妨害",
      warden: "監視者",
    },
    frontline: "都市防衛線",
    battlefield: "戦場",
    training: "操作訓練",
    resultWave: "到達ウェーブ",
    resultKills: "撃破数",
    resultScore: "最終スコア",
    noTarget: "接近なし",
    jamWarning: "妨害予告",
    jammed: "出力50%",
    resonance: "共鳴",
    overdrive: "オーバードライブ",
    overdriveReady: "超出力 準備完了",
    circuitLoad: "回路負荷",
    loadShort: "負荷",
    stable: "安定",
    strained: "高負荷",
    overloaded: "過負荷",
    nextLoad: "次送電",
    output: "出力",
    cooling: "冷却",
    overloadWarning: "次で過負荷",
    priorityRelief: "緊急需要・負荷軽減",
    evidence: "このランの記録",
    activeTime: "アクティブ時間",
    firstKillTime: "初撃破",
    rotationsPerSecond: "1秒あたり切替",
    productiveRate: "有効送電率",
    debrief: "記録から分かること",
    seconds: "秒",
    noRecord: "—",
  },
  en: {
    titleKicker: "THE FALLEN CITY // FINAL SHIFT",
    title: "TRI RELAY",
    subtitle: "LAST SHIFT",
    premise: "Tap to switch the power route. Extract ore, fabricate ammunition, then defend the city.",
    start: "START SHIFT",
    startGuided: "START WITH TUTORIAL",
    skipTutorial: "START WITHOUT TUTORIAL",
    replay: "RUN IT AGAIN",
    continue: "RESUME GRID",
    paused: "GRID SUSPENDED",
    victory: "DAWN SECURED",
    defeat: "CITY GRID LOST",
    upgrade: "SELECT ONE GRID MODULE",
    upgradeSub: "The invasion and pulse clock are frozen while you choose.",
    core: "CITY POWER",
    wave: "WAVE",
    score: "SCORE",
    best: "BEST",
    runs: "RUNS",
    wins: "WINS",
    privacy: "DATA & PRIVACY",
    valid: "VALID PULSES",
    nextPulse: "NEXT FREQUENCY",
    next: "NEXT",
    rotate: "TAP TO ROTATE 120°",
    tapRelay: "TAP THE CENTRAL RELAY",
    tap: "TAP",
    routeNow: "ROUTE NEXT",
    pause: "PAUSE",
    mute: "MUTE AUDIO",
    unmute: "ENABLE AUDIO",
    language: "JP",
    languageLabel: "Switch to Japanese",
    active: "ACTIVE",
    installed: "INSTALLED",
    intermission: "NEXT INCURSION",
    sector: {
      extract: "EXTRACT",
      fabricate: "FABRICATE",
      defend: "DEFEND",
    },
    sectorShort: {
      extract: "ORE",
      fabricate: "AMMO",
      defend: "THREAT",
    },
    tutorial: [
      "1. CONNECT EXTRACTION",
      "2. CONNECT FABRICATION",
      "3. CONNECT DEFENSE",
    ],
    affinityHelp: "Matching the next frequency color boosts output. Routing into an empty machine wastes the pulse.",
    contact: "CONTACT IN",
    nextThreat: "NEXT INCURSION",
    breach: "BREACH DAMAGE",
    attacks: "TO DESTROY",
    shot: "SHOT",
    cityStatus: "DISTRICT 07 // GRID HOLDING",
    scan: "SCANNING APPROACH",
    failureCause: "BREACHED THE DEFENSE LINE",
    waveNext: "NEXT",
    waveRemaining: "HOSTILES",
    resolving: "RESOLVING",
    clear: "CLEAR",
    flowEnemy: "ENEMY STATUS",
    flowConnection: "CURRENT POWER ROUTE",
    flowControl: "SWITCH POWER ROUTE",
    flowResult: "LAST PULSE RESULT",
    pulseIn: "PULSE IN",
    waitingInput: "WAITING FOR INPUT",
    switchTap: "TAP TO SWITCH",
    firstEnemyWait: "THE FIRST ENEMY MOVES AFTER YOUR INPUT",
    firstEnemyWaitShort: "INPUT STARTS ENEMY",
    waitingPulse: "WAITING FOR THE NEXT PULSE",
    success: "SUCCESS",
    failed: "FAILED",
    need: "NEED",
    loopHint: "EXTRACT → FABRICATE → DEFEND",
    connected: "CONNECTED",
    commandDefend: "ENEMY CLOSE — SWITCH TO DEFENSE",
    commandFabricate: "MAKE AMMO — SWITCH TO FABRICATION",
    commandExtract: "GET ORE — SWITCH TO EXTRACTION",
    commandMatch: "MATCH THE NEXT FREQUENCY",
    nextPulseShort: "NEXT PULSE",
    matchBonus: "COLOR MATCH · OUTPUT BOOST",
    sent: "POWER ROUTED TO",
    oreResource: "ORE",
    ammoResource: "AMMO",
    coreResource: "CITY",
    damage: "DAMAGE",
    noPulseYet: "NO PULSE SENT YET",
    tutorialLocked: "TIME STOPS UNTIL THE CORRECT ROUTE IS SELECTED",
    armed: "DEFENSE ARMED",
    armedShort: "READY",
    defenseEmpty: "AMMO 0",
    hostiles: "HOSTILES",
    enemyShort: {
      rusher: "RUSHER",
      sapper: "SAPPER",
      jammer: "JAMMER",
      warden: "WARDEN",
    },
    frontline: "CITY FRONTLINE",
    battlefield: "BATTLEFIELD",
    training: "ROUTE TRAINING",
    resultWave: "WAVE REACHED",
    resultKills: "HOSTILES CLEARED",
    resultScore: "FINAL SCORE",
    noTarget: "CLEAR",
    jamWarning: "JAM INBOUND",
    jammed: "OUTPUT 50%",
    resonance: "RESONANCE",
    overdrive: "OVERDRIVE",
    overdriveReady: "OVERDRIVE READY",
    circuitLoad: "CIRCUIT LOAD",
    loadShort: "LOAD",
    stable: "STABLE",
    strained: "STRAINED",
    overloaded: "OVERLOADED",
    nextLoad: "NEXT PULSE",
    output: "OUTPUT",
    cooling: "COOLING",
    overloadWarning: "OVERLOAD NEXT",
    priorityRelief: "PRIORITY RELIEF",
    evidence: "RUN EVIDENCE",
    activeTime: "ACTIVE TIME",
    firstKillTime: "FIRST KILL",
    rotationsPerSecond: "ROTATIONS / SEC",
    productiveRate: "PRODUCTIVE RATE",
    debrief: "WHAT THE RECORD SHOWS",
    seconds: "s",
    noRecord: "—",
  },
} as const;

const FAILURE_TEXT: Record<Language, Record<FailureCause, string>> = {
  ja: {
    "ore-full": "鉱石庫満杯 — 次は製造へ",
    "ore-required": "鉱石不足 — 先に採掘へ",
    "ammo-full": "弾薬庫満杯 — 次は防衛へ",
    "ammo-required": "弾薬不足 — 先に製造へ",
    "target-required": "射撃対象なし — 接近を待て",
  },
  en: {
    "ore-full": "ORE FULL — ROUTE TO FABRICATION",
    "ore-required": "ORE EMPTY — EXTRACT FIRST",
    "ammo-full": "AMMO FULL — ROUTE TO DEFENSE",
    "ammo-required": "AMMO EMPTY — FABRICATE FIRST",
    "target-required": "NO TARGET — WAIT FOR CONTACT",
  },
};

const ROUTE_POINTS: Record<Sector, { x: number; y: number }> = {
  extract: { x: 205, y: 555 },
  fabricate: { x: 795, y: 555 },
  defend: { x: 500, y: 160 },
};

const PRODUCTION_ROUTE_POINTS: Record<Sector, { x: number; y: number }> = {
  extract: { x: 21, y: 58 },
  fabricate: { x: 58, y: 51 },
  defend: { x: 21, y: 20 },
};

const PRODUCTION_RELAY_POINT = { x: 23, y: 84 } as const;

function localizeEngineNotice(text: string, language: Language) {
  const copy = TEXT[language];
  const wave = text.match(/^WAVE (\d+)/);
  if (wave) {
    const waveIndex = Number(wave[1]) - 1;
    const title = WAVES[waveIndex]?.title[language] ?? "";
    return language === "ja" ? `ウェーブ ${wave[1]} // ${title}` : `WAVE ${wave[1]} // ${title}`;
  }

  const jam = text.match(/^(EXTRACT|FABRICATE|DEFEND) JAM IN (\d+)s$/);
  if (jam) {
    const sector = jam[1].toLowerCase() as Sector;
    return language === "ja"
      ? `${copy.sector[sector]}：${copy.jamWarning} ${jam[2]}秒`
      : `${copy.sector[sector]} // ${copy.jamWarning} ${jam[2]}s`;
  }

  const overload = text.match(/^(EXTRACT|FABRICATE|DEFEND) OVERLOAD \/\/ OUTPUT (\d+)%$/);
  if (overload) {
    const sector = overload[1].toLowerCase() as Sector;
    return language === "ja"
      ? `${copy.sector[sector]}：${copy.overloaded} // ${copy.output} ${overload[2]}%`
      : `${copy.sector[sector]} // ${copy.overloaded} // ${copy.output} ${overload[2]}%`;
  }

  const priorityRelief = text.match(/^(EXTRACT|FABRICATE|DEFEND) PRIORITY RELIEF$/);
  if (priorityRelief) {
    const sector = priorityRelief[1].toLowerCase() as Sector;
    return language === "ja"
      ? `${copy.sector[sector]}：${copy.priorityRelief}`
      : `${copy.sector[sector]} // ${copy.priorityRelief}`;
  }

  const theft = text.match(/^SAPPER −([\d.]+) (ORE|AMMO)$/);
  if (theft) {
    const resource = theft[2] === "ORE" ? copy.oreResource : copy.ammoResource;
    return language === "ja"
      ? `工作兵：${resource} −${theft[1]}`
      : `SAPPER // ${resource} −${theft[1]}`;
  }

  const coreDamage = text.match(/^CORE −([\d.]+)$/);
  if (coreDamage) return `${copy.core} −${coreDamage[1]}`;

  const resourceGain = text.match(/^\+([\d.]+) (ORE|AMMO)$/);
  if (resourceGain) {
    const resource = resourceGain[2] === "ORE" ? copy.oreResource : copy.ammoResource;
    return `${resource} +${resourceGain[1]}`;
  }

  const damage = text.match(/^−([\d.]+) DMG$/);
  if (damage) {
    return language === "ja" ? `敵へ ${damage[1]} ${copy.damage}` : `${damage[1]} ${copy.damage}`;
  }

  const match = text.match(/^FREQUENCY MATCH ×([\d.]+)$/);
  if (match) return language === "ja" ? `周波数一致 ×${match[1]}` : `FREQUENCY MATCH ×${match[1]}`;
  const overdrive = text.match(/^RESONANCE OVERDRIVE ×([\d.]+)$/);
  if (overdrive) return language === "ja" ? `共鳴オーバードライブ ×${overdrive[1]}` : `RESONANCE OVERDRIVE ×${overdrive[1]}`;
  if (text === "GRID WARDEN ONLINE") return language === "ja" ? "監視者、侵入" : "GRID WARDEN ONLINE";
  if (text === "DEFENSE ARMED // STANDBY") return copy.armed;
  if (text === "MODULE INSTALLED") return language === "ja" ? "モジュール装備完了" : "MODULE INSTALLED";
  return text;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: value % 1 ? 1 : 0 });
}

function formatAmmoForecast(value: number) {
  return value > GAME_LIMITS.ammo ? `${GAME_LIMITS.ammo}+` : formatNumber(value);
}

function sectorStyle(sector: Sector) {
  return { "--sector": SECTOR_COLORS[sector] } as CSSProperties;
}

function circuitClass(state: GameState, sector: Sector, recommended: Sector | null) {
  const active = getCurrentSector(state) === sector;
  const jam = getActiveJamState(state, sector);
  return [
    "circuit-node",
    `circuit-${sector}`,
    active ? "is-active" : "",
    recommended === sector ? "is-recommended" : "",
    jam === "warning" ? "is-jam-warning" : "",
    jam === "active" ? "is-jammed" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export default function Game() {
  const stateRef = useRef<GameState>(cloneGameState(INITIAL_GAME_STATE));
  const audioRef = useRef<AudioDirector>(new AudioDirector());
  const platformRef = useRef<PlatformBridge | null>(null);
  const endCommittedRef = useRef(false);
  const guidedRunRef = useRef(false);
  const tutorialTrackedRef = useRef(false);
  const initializationCompleteRef = useRef(false);
  const evidenceRef = useRef<RunEvidenceTracker | null>(null);
  const evidenceFrameAtRef = useRef<number | null>(null);
  const [view, setView] = useState<GameState>(() => cloneGameState(INITIAL_GAME_STATE));
  const [resultEvidence, setResultEvidence] = useState<RunEvidenceResult | null>(null);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [language, setLanguage] = useState<Language>("ja");
  const [muted, setMuted] = useState(false);
  const [platformMuted, setPlatformMuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const t = TEXT[language];
  const modalOpen = ["ready", "upgrade", "paused", "won", "lost"].includes(view.phase);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousModalRef = useRef(modalOpen);
  const keyboardNavigationRef = useRef(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const relayRef = useRef<HTMLButtonElement | null>(null);
  const mobileRelayRef = useRef<HTMLButtonElement | null>(null);
  const pauseRef = useRef<HTMLButtonElement | null>(null);
  const lastCheckpointClockRef = useRef(0);
  const lastCheckpointEvidenceRef = useRef(0);

  const trapModalFocus = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (document.activeElement === event.currentTarget) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  const syncView = useCallback((forceCheckpoint = false) => {
    const snapshot = cloneGameState(stateRef.current);
    const evidence = evidenceRef.current?.snapshot() ?? null;
    setView(snapshot);
    if (
      forceCheckpoint
      || snapshot.clock - lastCheckpointClockRef.current >= 2
      || (evidence?.activeSeconds ?? 0) - lastCheckpointEvidenceRef.current >= 2
    ) {
      safeWriteActiveRun(snapshot, evidence);
      lastCheckpointClockRef.current = snapshot.clock;
      lastCheckpointEvidenceRef.current = evidence?.activeSeconds ?? 0;
    }
  }, []);

  const playEvents = useCallback((events: EngineEvent[]) => {
    if (!events.length) return;
    audioRef.current?.play(events);
    const current = stateRef.current;
    if (events.some((event) => event.kind === "overdrive")) {
      trackGameEvent("overdrive_used", {
        wave: current.waveIndex + 1,
        sector: getCurrentSector(current),
      });
    }
    if (events.some((event) => event.kind === "wave")) {
      trackGameEvent("wave_cleared", {
        wave: current.waveIndex,
        integrity: current.integrity,
      });
    }
    if (events.some((event) => event.kind === "wave" || event.kind === "win" || event.kind === "lose")) {
      platformRef.current?.gameplayStop();
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      if (events.some((event) => event.kind === "breach")) navigator.vibrate?.(35);
      else if (events.some((event) => event.kind === "overdrive")) navigator.vibrate?.([12, 28, 18]);
      else if (events.some((event) => event.kind === "defend")) navigator.vibrate?.(10);
    }
  }, []);

  const updateProfile = useCallback((recipe: (current: Profile) => Profile) => {
    setProfile((current) => {
      const next = recipe(current);
      safeWriteProfile(next);
      return next;
    });
  }, []);

  const beginRun = useCallback((source: "opening" | "replay", guidedOverride?: boolean) => {
    if (!initializationCompleteRef.current) return;
    const phase = stateRef.current.phase;
    if (source === "opening" ? phase !== "ready" : !["won", "lost"].includes(phase)) return;
    audioRef.current?.unlock();
    const seed = ((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const guided = guidedOverride ?? !profile.tutorialCompleted;
    guidedRunRef.current = guided;
    tutorialTrackedRef.current = false;
    stateRef.current = startRun(seed, guided);
    const evidenceSource: RunStartSource = source === "replay" ? "replay" : "start";
    evidenceRef.current = new RunEvidenceTracker({
      source: evidenceSource,
      runOrdinal: profile.runs + 1,
      guided,
    });
    evidenceFrameAtRef.current = performance.now();
    setResultEvidence(null);
    trackGameEvent("run_started", { guided, source });
    safeWriteActiveRun(stateRef.current, evidenceRef.current.snapshot());
    lastCheckpointClockRef.current = 0;
    lastCheckpointEvidenceRef.current = 0;
    endCommittedRef.current = false;
    audioRef.current?.setMuted(muted || platformMuted);
    audioRef.current?.startDrone();
    platformRef.current?.gameplayStart();
    updateProfile((current) => ({
      ...current,
      runs: current.runs + 1,
      tutorialCompleted: current.tutorialCompleted || !guided,
    }));
    playEvents([{ kind: "upgrade", amount: 1 }]);
    syncView(true);
  }, [muted, platformMuted, playEvents, profile.runs, profile.tutorialCompleted, syncView, updateProfile]);

  const rotate = useCallback(() => {
    audioRef.current?.unlock();
    const events = rotateRelay(stateRef.current);
    playEvents(events);
    if (events.length) {
      evidenceRef.current?.recordRotation();
      syncView();
    }
  }, [playEvents, syncView]);

  const togglePause = useCallback(() => {
    const state = stateRef.current;
    if (state.phase === "paused") {
      audioRef.current?.unlock();
      if (resumeGame(state)) {
        audioRef.current?.startDrone();
        platformRef.current?.gameplayStart();
      }
    } else if (pauseGame(state)) {
      audioRef.current?.suspend();
      platformRef.current?.gameplayStop();
    }
    syncView(true);
  }, [syncView]);

  const installUpgrade = useCallback(
    (upgradeId: string) => {
      audioRef.current?.unlock();
      const events = selectUpgrade(stateRef.current, upgradeId);
      playEvents(events);
      if (events.length) {
        const upgrade = UPGRADES.find((candidate) => candidate.id === upgradeId);
        trackGameEvent("upgrade_selected", {
          wave: stateRef.current.waveIndex + 1,
          branch: upgrade?.branch ?? "unknown",
        });
        audioRef.current?.startDrone();
        platformRef.current?.gameplayStart();
        syncView(true);
      }
    },
    [playEvents, syncView],
  );

  const toggleMute = useCallback(() => {
    audioRef.current?.unlock();
    setMuted((current) => {
      const next = !current;
      audioRef.current?.setMuted(next || platformMuted);
      updateProfile((stored) => ({ ...stored, muted: next }));
      return next;
    });
  }, [platformMuted, updateProfile]);

  const toggleLanguage = useCallback(() => {
    setLanguage((current) => {
      const next = current === "ja" ? "en" : "ja";
      updateProfile((stored) => ({ ...stored, language: next }));
      return next;
    });
  }, [updateProfile]);

  useEffect(() => {
    // React Strict Mode intentionally replays mount effects in development.
    // Give each setup its own bridge so the cleanup probe cannot leave the
    // next setup holding a permanently disposed SDK connection.
    const platform = new PlatformBridge();
    platformRef.current = platform;
    platform.setMuteListener(setPlatformMuted);
    void platform.init();
    let embedded = false;
    try {
      embedded = window.self !== window.top;
    } catch {
      embedded = true;
    }
    const hostname = window.location.hostname;
    const chatGptHost = hostname === "chatgpt.com"
      || hostname.endsWith(".chatgpt.com")
      || hostname === "chatgpt.site"
      || hostname.endsWith(".chatgpt.site");
    const chatGptContainer = /chatgpt/i.test(navigator.userAgent)
      || /(^|:\/\/|\.)chatgpt\.(com|site)(\/|$)/i.test(document.referrer);
    document.documentElement.dataset.gameHost = chatGptHost || chatGptContainer
      ? "chatgpt"
      : embedded
        ? "embedded"
        : "standard";
    const stored = safeReadProfile();
    const browserLanguage = navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
    let hasStoredProfile = false;
    try {
      hasStoredProfile = window.localStorage.getItem(PROFILE_KEY) !== null;
    } catch {
      hasStoredProfile = false;
    }
    const initialLanguage = hasStoredProfile ? stored.language : browserLanguage;
    const animationFrame = requestAnimationFrame(() => {
      setProfile(stored);
      setLanguage(initialLanguage);
      setMuted(stored.muted);
      audioRef.current.setMuted(stored.muted || platform.isAudioMuted());
      setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      const restored = safeReadActiveRun();
      if (restored) {
        const restoredRun = restored.state;
        const guided = restored.evidence?.guided ?? restoredRun.tutorialStep < 3;
        evidenceRef.current = new RunEvidenceTracker({
          source: "checkpoint",
          runOrdinal: restored.evidence?.runOrdinal ?? Math.max(1, stored.runs),
          guided,
          snapshot: restored.evidence,
        });
        evidenceFrameAtRef.current = performance.now();
        stateRef.current = restoredRun;
        setView(cloneGameState(restoredRun));
        setResultEvidence(null);
        lastCheckpointClockRef.current = restoredRun.clock;
        lastCheckpointEvidenceRef.current = restored.evidence?.activeSeconds ?? 0;
        guidedRunRef.current = guided;
        tutorialTrackedRef.current = restoredRun.tutorialStep >= 3;
        trackGameEvent("checkpoint_restored", {
          wave: restoredRun.waveIndex + 1,
          phase: restoredRun.phase,
        });
      }
      initializationCompleteRef.current = true;
      setInitialized(true);
    });
    return () => {
      initializationCompleteRef.current = false;
      cancelAnimationFrame(animationFrame);
      platform.gameplayStop();
      platform.dispose();
      if (platformRef.current === platform) platformRef.current = null;
    };
  }, []);

  useEffect(() => () => {
    audioRef.current.dispose();
  }, []);

  useEffect(() => {
    audioRef.current.setMuted(muted || platformMuted);
  }, [muted, platformMuted]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    const root = document.documentElement;
    const useKeyboard = (event: globalThis.KeyboardEvent) => {
      if (["Tab", "Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        keyboardNavigationRef.current = true;
        root.dataset.inputMode = "keyboard";
      }
    };
    const usePointer = () => {
      keyboardNavigationRef.current = false;
      root.dataset.inputMode = "pointer";
    };
    window.addEventListener("keydown", useKeyboard, true);
    window.addEventListener("pointerdown", usePointer, true);
    window.addEventListener("touchstart", usePointer, true);
    return () => {
      window.removeEventListener("keydown", useKeyboard, true);
      window.removeEventListener("pointerdown", usePointer, true);
      window.removeEventListener("touchstart", usePointer, true);
    };
  }, []);

  useEffect(() => {
    const rememberWorldFocus = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest(".game-world")) previousFocusRef.current = target;
    };
    document.addEventListener("focusin", rememberWorldFocus);
    return () => document.removeEventListener("focusin", rememberWorldFocus);
  }, []);

  useEffect(() => {
    if (modalOpen) {
      requestAnimationFrame(() => {
        const modal = modalRef.current;
        if (modal && !modal.contains(document.activeElement)) modal.focus({ preventScroll: true });
      });
    } else if (previousModalRef.current) {
      const target = previousFocusRef.current;
      requestAnimationFrame(() => {
        if (!keyboardNavigationRef.current) return;
        if (target?.isConnected && !(target instanceof HTMLButtonElement && target.disabled)) target.focus();
        else if (mobileRelayRef.current?.getClientRects().length && !mobileRelayRef.current.disabled) mobileRelayRef.current.focus();
        else if (relayRef.current && !relayRef.current.disabled) relayRef.current.focus();
        else pauseRef.current?.focus();
      });
    }
    previousModalRef.current = modalOpen;
  }, [modalOpen]);

  useEffect(() => {
    let animationFrame = 0;
    let idleTimer = 0;
    let previous = performance.now();
    let renderAccumulator = 0;
    let simulationAccumulator = 0;
    const simulationStep = 1 / 120;

    const frame = (now: number) => {
      const rawElapsed = Math.max(0, (now - previous) / 1000);
      const elapsed = Math.min(rawElapsed, 0.25);
      previous = now;
      const evidencePrevious = evidenceFrameAtRef.current ?? now;
      const evidenceElapsed = Math.max(0, (now - evidencePrevious) / 1000);
      evidenceFrameAtRef.current = now;
      const evidenceActive = !document.hidden
        && (stateRef.current.phase === "playing" || stateRef.current.phase === "intermission");
      const simulationActive =
        stateRef.current.phase === "playing" || stateRef.current.phase === "intermission";
      const events: EngineEvent[] = [];
      if (simulationActive) {
        simulationAccumulator = Math.min(0.25, simulationAccumulator + elapsed);
        while (simulationAccumulator >= simulationStep) {
          events.push(...advanceGame(stateRef.current, simulationStep));
          simulationAccumulator -= simulationStep;
          if (stateRef.current.phase !== "playing" && stateRef.current.phase !== "intermission") break;
        }
      } else {
        simulationAccumulator = 0;
      }
      playEvents(events);
      // Evidence uses unclamped foreground wall time. The simulation keeps its
      // defensive clamp so a stalled render cannot fast-forward the game.
      evidenceRef.current?.advance(evidenceElapsed, stateRef.current, events, evidenceActive);
      if (
        guidedRunRef.current &&
        !tutorialTrackedRef.current &&
        stateRef.current.tutorialStep >= 3
      ) {
        tutorialTrackedRef.current = true;
        updateProfile((current) => ({ ...current, tutorialCompleted: true }));
      }
      renderAccumulator = simulationActive ? renderAccumulator + Math.min(elapsed, 0.05) : 0;

      if (
        !endCommittedRef.current &&
        events.some((event) => event.kind === "win" || event.kind === "lose")
      ) {
        endCommittedRef.current = true;
        audioRef.current?.stopDrone();
        const finalState = stateRef.current;
        const evidence = evidenceRef.current?.complete(finalState) ?? null;
        setResultEvidence(evidence);
        updateProfile((current) => ({
          ...current,
          wins: current.wins + (finalState.phase === "won" ? 1 : 0),
          bestWave: Math.max(current.bestWave, finalState.waveIndex + 1),
          bestScore: Math.max(current.bestScore, finalState.score),
        }));
        safeWriteActiveRun(null, null);
      }

      if (events.length || (simulationActive && renderAccumulator >= 0.04)) {
        syncView(events.some((event) => event.kind === "wave" || event.kind === "win" || event.kind === "lose"));
        renderAccumulator = 0;
      }
      if (simulationActive) {
        animationFrame = requestAnimationFrame(frame);
      } else {
        idleTimer = window.setTimeout(() => {
          animationFrame = requestAnimationFrame(frame);
        }, 250);
      }
    };

    animationFrame = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.clearTimeout(idleTimer);
    };
  }, [playEvents, syncView, updateProfile]);

  useEffect(() => {
    const suspendAndCheckpoint = () => {
      // Lifecycle events can fire before the deferred restore frame (for
      // example when a background tab is opened). Never let the untouched
      // ready-state overwrite or delete an existing Active Run in that gap.
      if (!initializationCompleteRef.current) return;
      evidenceFrameAtRef.current = performance.now();
      pauseGame(stateRef.current);
      audioRef.current?.suspend();
      platformRef.current?.gameplayStop();
      syncView(true);
    };

    const resyncWithoutResuming = () => {
      if (!initializationCompleteRef.current) return;
      evidenceFrameAtRef.current = performance.now();
      // BFCache and Page Lifecycle restores retain in-memory state. Keep the
      // run explicitly paused until the player chooses to resume.
      pauseGame(stateRef.current);
      audioRef.current?.suspend();
      platformRef.current?.gameplayStop();
      syncView(true);
    };

    const handleVisibility = () => {
      // Reset on both edges so a suspended rAF interval is never counted as
      // active play when the document becomes visible again.
      evidenceFrameAtRef.current = performance.now();
      if (document.hidden) suspendAndCheckpoint();
      else resyncWithoutResuming();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", suspendAndCheckpoint);
    document.addEventListener("freeze", suspendAndCheckpoint);
    window.addEventListener("pageshow", resyncWithoutResuming);
    document.addEventListener("resume", resyncWithoutResuming);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", suspendAndCheckpoint);
      document.removeEventListener("freeze", suspendAndCheckpoint);
      window.removeEventListener("pageshow", resyncWithoutResuming);
      document.removeEventListener("resume", resyncWithoutResuming);
    };
  }, [syncView]);

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.repeat) return;
      const phase = stateRef.current.phase;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isInteractiveTarget = Boolean(target?.closest("button, a, input, select, textarea"));
      if (event.key === "Escape" || event.key.toLowerCase() === "p") {
        if (["playing", "intermission", "paused"].includes(phase)) {
          event.preventDefault();
          togglePause();
        }
        return;
      }
      if (phase === "upgrade" && ["1", "2", "3"].includes(event.key)) {
        const index = Number(event.key) - 1;
        const choice = stateRef.current.upgradeChoices[index];
        if (choice) {
          event.preventDefault();
          installUpgrade(choice);
        }
        return;
      }
      if (isInteractiveTarget) return;
      if (event.code === "Space" || event.key === "Enter") {
        event.preventDefault();
        if (phase === "ready") beginRun("opening");
        else if (phase === "won" || phase === "lost") beginRun("replay", false);
        else if (phase === "paused") togglePause();
        else if (phase === "playing") rotate();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [beginRun, installUpgrade, rotate, togglePause]);

  const currentSector = getCurrentSector(view);
  const pulseProgress = getPulseProgress(view);
  const waveProgress = getWaveProgress(view);
  const waveReadout = getWaveReadout(view);
  const tutorialSequence = ["extract", "fabricate", "defend"] as const;
  const tutorialStep = view.tutorialStep;
  const tutorialCopy = tutorialStep < 3 ? t.tutorial[tutorialStep as 0 | 1 | 2] : null;
  const defenseForecast = getDefenseForecast(view);
  const nearestEnemy = view.enemies.reduce(
    (nearest, enemy) => Math.max(nearest, enemy.progress),
    0,
  );
  const nextSpawn = view.spawnSchedule[view.spawnCursor];
  const nextSpawnSeconds = nextSpawn ? Math.max(0, Math.ceil(nextSpawn.at - view.waveElapsed)) : null;
  const nextAffinity = view.pulseQueue[0] ?? "extract";
  const nextAfter = view.pulseQueue[1] ?? "fabricate";
  const resonanceEnabled = isResonanceEnabled(view);
  const circuitLoadEnabled = isCircuitLoadEnabled(view);
  const recommendedSector: Sector | null = tutorialStep < tutorialSequence.length
    ? tutorialSequence[tutorialStep as 0 | 1 | 2]
    : null;
  const validRate = view.totalPulses ? Math.round((view.validPulses / view.totalPulses) * 100) : 100;
  const waveClockText = waveReadout.kind === "next"
    ? `${t.waveNext} +${waveReadout.seconds}s`
    : waveReadout.kind === "remaining"
      ? `${t.waveRemaining} ×${waveReadout.count}`
      : waveReadout.kind === "resolving"
        ? t.resolving
        : t.clear;
  const waveClockShort = waveReadout.kind === "next"
    ? `+${waveReadout.seconds}s`
    : waveReadout.kind === "remaining"
      ? `×${waveReadout.count}`
      : waveReadout.kind === "resolving"
        ? "..."
        : "OK";
  const enemyRoster = (["rusher", "sapper", "jammer", "warden"] as const)
    .map((kind) => ({
      kind,
      count: view.enemies.filter((enemy) => enemy.kind === kind).length,
    }))
    .filter(({ count }) => count > 0)
    .map(({ kind, count }) => `${ENEMY_STATS[kind].name[language]} ${count}`)
    .join(", ");
  const threatAnnouncement = defenseForecast
    ? `${enemyRoster}. ${defenseForecast.threatCount} ${t.attacks}. ${t.breach} ${defenseForecast.breachDamage} CORE. AMMO ${formatAmmoForecast(defenseForecast.ammoRequired)}`
    : view.enemies.length === 0 && nextSpawnSeconds !== null
      ? t.nextThreat
      : "";
  const actionFailure = view.phase === "playing" && view.sectorEffect?.success === false && view.sectorEffect.cause
    ? FAILURE_TEXT[language][view.sectorEffect.cause]
    : null;
  const nextSector = SECTORS[(view.relayIndex + 1) % SECTORS.length];
  const expectedTutorialSector = tutorialStep < 3
    ? tutorialSequence[tutorialStep as 0 | 1 | 2]
    : null;
  const tutorialAligned = expectedTutorialSector === currentSector;
  const pulseSeconds = Math.max(0, (1 - pulseProgress) * view.pulseInterval);
  const selectedLoadForecast = getCircuitLoadForecast(view, currentSector);
  const recentEffect = view.sectorEffect;
  const recentEffectText = recentEffect
    ? recentEffect.success
      ? recentEffect.sector === "extract"
        ? `+${formatNumber(recentEffect.amount)} ${t.oreResource}`
        : recentEffect.sector === "fabricate"
          ? `+${formatNumber(recentEffect.amount)} ${t.ammoResource}`
          : `−${formatNumber(recentEffect.amount)} ${t.damage}`
      : recentEffect.cause
        ? FAILURE_TEXT[language][recentEffect.cause]
        : recentEffect.sector === "defend"
          ? t.armed
          : t.waitingPulse
    : null;
  const mobileNotice = view.notices.length ? view.notices[view.notices.length - 1] : null;
  const mobileNoticeUpgrade = mobileNotice?.upgradeId
    ? UPGRADES.find((upgrade) => upgrade.id === mobileNotice.upgradeId) ?? null
    : null;
  const mobileNoticeText = mobileNotice
    ? mobileNoticeUpgrade
      ? `${mobileNoticeUpgrade.name[language]} // ${mobileNoticeUpgrade.value}`
      : localizeEngineNotice(mobileNotice.text, language)
    : null;
  const isShaking = !reducedMotion && view.shakeUntil > view.clock;

  const upgradeChoices = useMemo(
    () => view.upgradeChoices.map((id) => UPGRADES.find((upgrade) => upgrade.id === id)).filter(Boolean),
    [view.upgradeChoices],
  );
  const latestUpgrade = view.upgrades.length
    ? UPGRADES.find((upgrade) => upgrade.id === view.upgrades[view.upgrades.length - 1]) ?? null
    : null;
  const visibleEvidence = view.phase === "won" || view.phase === "lost" ? resultEvidence : null;
  const debriefLines = view.phase === "won" || view.phase === "lost"
    ? getRunDebrief(view, language, 2)
    : [];

  const relayStyle = {
    "--relay-rotation": `${view.relayIndex * 120}deg`,
    "--counter-rotation": `${view.relayIndex * -120}deg`,
    "--pulse-angle": `${pulseProgress * 360}deg`,
    "--active-sector": SECTOR_COLORS[currentSector],
  } as CSSProperties;

  return (
    <div
      className={`game-shell phase-${view.phase} ${isShaking ? "is-shaking" : ""}`}
      data-testid="game-shell"
    >
      <div className="ambient-grid" aria-hidden="true" />
      <div className="game-world" inert={modalOpen} aria-hidden={modalOpen}>
      <header className="game-hud">
        <div className="hud-cluster integrity-cluster" aria-label={`${t.core}: ${view.integrity}/${view.maxIntegrity}`}>
          <span className="hud-label">{t.core}</span>
          <div className="integrity-pips">
            {Array.from({ length: view.maxIntegrity }, (_, index) => (
              <span key={index} className={index < view.integrity ? "is-live" : ""} />
            ))}
          </div>
          <strong>{view.integrity}/{view.maxIntegrity}</strong>
        </div>

        <div className="hud-cluster wave-cluster">
          <span className="hud-label">{t.wave}</span>
          <strong>{String(view.waveIndex + 1).padStart(2, "0")}/{String(WAVES.length).padStart(2, "0")}</strong>
          <span className="wave-clock" aria-label={waveClockText}>
            <span className="wave-clock-full" aria-hidden="true">{waveClockText}</span>
            <span className="wave-clock-short" aria-hidden="true">{waveClockShort}</span>
          </span>
          <span className="wave-progress" style={{ "--wave-progress": `${waveProgress * 100}%` } as CSSProperties} />
        </div>

        <div className="hud-cluster score-cluster">
          <span className="hud-label">{t.score}</span>
          <strong>{Math.round(view.score).toLocaleString("en-US")}</strong>
        </div>

        <div className="hud-actions">
          <button type="button" onClick={toggleLanguage} aria-label={t.languageLabel} className="icon-button text-button">
            {t.language}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted || platformMuted ? t.unmute : t.mute}
            aria-pressed={muted || platformMuted}
            className="icon-button sound-button"
            disabled={platformMuted}
          >
            <UiIcon name={muted || platformMuted ? "sound-off" : "sound-on"} className="ui-icon" />
          </button>
          <button
            ref={pauseRef}
            type="button"
            onClick={togglePause}
            aria-label={t.pause}
            className="icon-button pause-button"
            disabled={!(["playing", "intermission", "paused"] as string[]).includes(view.phase)}
          >
            <UiIcon name={view.phase === "paused" ? "play" : "pause"} className="ui-icon" />
          </button>
        </div>
      </header>

      <main className="game-stage">
        <section className="network-field" aria-label={t.battlefield}>
          <div className="battlefield-mobile">
            <section className={`bf-front ${defenseForecast ? "has-threat" : ""}`} aria-label={t.frontline}>
              <div className="bf-front-heading">
                <span>{`${String(view.waveIndex + 1).padStart(2, "0")} // ${WAVES[view.waveIndex].title[language]}`}</span>
                <strong>
                  {tutorialStep === 0 && !tutorialAligned
                    ? <><span className="bf-heading-long">{t.firstEnemyWait}</span><span className="bf-heading-short">{t.firstEnemyWaitShort}</span></>
                    : defenseForecast
                      ? `${t.contact} ${Math.max(0, Math.ceil(defenseForecast.etaSeconds))}s`
                      : nextSpawnSeconds !== null
                        ? `${t.nextThreat} ${nextSpawnSeconds}s`
                        : t.scan}
                </strong>
              </div>

              <WorldStateOverlay
                className="bf-world-state"
                integrity={view.integrity}
                maxIntegrity={view.maxIntegrity}
                enemyCount={view.enemies.length}
                nearestProgress={nearestEnemy}
              />

              <div className="bf-city">
                <CityGate
                  integrity={view.integrity}
                  maxIntegrity={view.maxIntegrity}
                  damaged={isShaking}
                  label={`${t.core} ${view.integrity}/${view.maxIntegrity}`}
                />
              </div>

              <div className="bf-track" aria-hidden="true">
                <span className="bf-live-label">LIVE // {t.hostiles}</span>
                <i className="bf-track-line" />
                <i className="bf-track-danger" />
                {view.enemies.map((enemy) => {
                  const hpPercent = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
                  const enemyName = ENEMY_STATS[enemy.kind].name[language];
                  return (
                    <span
                      key={enemy.id}
                      className={`bf-enemy bf-enemy-${enemy.kind}`}
                      style={{
                        left: `${88 - enemy.progress * 72}%`,
                        top: `${24 + enemy.track * 20}%`,
                        "--enemy-health": `${hpPercent}%`,
                      } as CSSProperties}
                    >
                      <EnemyGlyph
                        kind={enemy.kind}
                        damaged={enemy.flashUntil > view.clock}
                        label={enemyName}
                      />
                      <small className="bf-enemy-tag" aria-hidden="true">{t.enemyShort[enemy.kind]}</small>
                      <i className="bf-enemy-health" />
                    </span>
                  );
                })}
                {view.shotEffect && (
                  <svg className="bf-shot-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <line
                      x1="8"
                      y1="78"
                      x2={88 - view.shotEffect.targetProgress * 72}
                      y2={24 + view.shotEffect.targetTrack * 20}
                      className={view.shotEffect.critical ? "is-critical" : ""}
                    />
                    {view.shotEffect.secondaryTargetProgress !== undefined && view.shotEffect.secondaryTargetTrack !== undefined && (
                      <line
                        x1="8"
                        y1="78"
                        x2={88 - view.shotEffect.secondaryTargetProgress * 72}
                        y2={24 + view.shotEffect.secondaryTargetTrack * 20}
                        className="is-secondary"
                      />
                    )}
                  </svg>
                )}
              </div>

              {defenseForecast && (
                <div className="bf-threat-readout">
                  <span>{language === "ja" ? "敵" : "ENEMY"} ×{defenseForecast.threatCount}</span>
                  <span>{language === "ja" ? "弾" : "AMMO"} {formatAmmoForecast(defenseForecast.ammoRequired)}</span>
                  <span>{language === "ja" ? "耐久" : "CORE"} −{defenseForecast.breachDamage}</span>
                </div>
              )}
              <span className="sr-only" role="status" aria-live="polite">
                {threatAnnouncement}
              </span>
            </section>

            <section className="bf-console" style={relayStyle}>
              {mobileNotice && mobileNoticeText && (
                <div
                  className="bf-event-strip"
                  data-tone={mobileNotice.tone}
                  key={mobileNotice.id}
                  aria-hidden="true"
                >
                  <UiIcon
                    name={mobileNotice.tone === "danger" || mobileNotice.tone === "warn" ? "warning" : "match"}
                    className="ui-icon"
                  />
                  <strong>{mobileNoticeText}</strong>
                </div>
              )}
              <svg className="bf-conduits" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {SECTORS.map((sector) => {
                  const point = PRODUCTION_ROUTE_POINTS[sector];
                  const transmitting = view.transits.some((pulse) => pulse.sector === sector);
                  return (
                    <g key={sector} className={`bf-branch bf-branch-${sector}`}>
                      <line
                        x1={PRODUCTION_RELAY_POINT.x}
                        y1={PRODUCTION_RELAY_POINT.y}
                        x2={point.x}
                        y2={point.y}
                        className={`bf-conduit bf-conduit-${sector} ${currentSector === sector ? "is-selected" : ""} ${transmitting ? "is-transmitting" : ""}`}
                      />
                      <circle className="bf-conduit-terminal" cx={point.x} cy={point.y} r="1.35" />
                    </g>
                  );
                })}
              </svg>
              <div className="bf-transit-layer" aria-hidden="true">
                {view.transits.map((pulse) => {
                  const destination = PRODUCTION_ROUTE_POINTS[pulse.sector];
                  const left = PRODUCTION_RELAY_POINT.x + (destination.x - PRODUCTION_RELAY_POINT.x) * pulse.progress;
                  const top = PRODUCTION_RELAY_POINT.y + (destination.y - PRODUCTION_RELAY_POINT.y) * pulse.progress;
                  return (
                    <i
                      key={pulse.id}
                      className={`bf-transit-dot is-${pulse.sector} ${pulse.matched ? "is-matched" : ""}`}
                      style={{ left: `${left}%`, top: `${top}%` }}
                    />
                  );
                })}
              </div>

              <div className="bf-machine-deck">
                {SECTORS.map((sector) => {
                  const sectorEffect = recentEffect?.sector === sector ? recentEffect : null;
                  const jam = getActiveJamState(view, sector);
                  const loadForecast = getCircuitLoadForecast(view, sector);
                  const transmitting = view.transits.some((pulse) => pulse.sector === sector);
                  const machineState: "idle" | "active" | "success" | "damaged" = jam === "active"
                    ? "damaged"
                    : sectorEffect?.success
                      ? "success"
                      : sectorEffect?.cause
                        ? "damaged"
                        : transmitting
                          ? "active"
                          : "idle";
                  const value = sector === "extract"
                    ? `${formatNumber(view.ore)}/${GAME_LIMITS.ore}`
                    : sector === "fabricate"
                      ? `${formatNumber(view.ammo)}/${GAME_LIMITS.ammo}`
                      : view.enemies.length
                        ? `×${view.enemies.length}`
                        : view.ammo < 0.5
                          ? t.defenseEmpty
                          : t.armedShort;
                  const installedForSector = view.upgrades.filter((id) => UPGRADES.find((upgrade) => upgrade.id === id)?.branch === sector);
                  return (
                    <article
                      key={sector}
                      className="bf-machine"
                      data-sector={sector}
                      data-active={currentSector === sector}
                      data-transmitting={transmitting}
                      data-recommended={recommendedSector === sector}
                      data-load={circuitLoadEnabled ? loadForecast.status : undefined}
                      data-next-load={circuitLoadEnabled ? loadForecast.projectedStatus : undefined}
                      data-jam={jam}
                      data-modules={installedForSector.length}
                      style={sectorStyle(sector)}
                    >
                      <span className="bf-machine-visual" aria-hidden="true">
                        <MachineGlyph
                          key={`${sector}-${sectorEffect?.id ?? "idle"}`}
                          sector={sector}
                          state={machineState}
                        />
                      </span>
                      <span className="bf-machine-copy">
                        <strong>{t.sector[sector]}</strong>
                        <small>{value}</small>
                        {circuitLoadEnabled && (
                          <span className="bf-load-readout" aria-label={`${t.circuitLoad} ${Math.round(loadForecast.heat)}%`}>
                            <span><i>{t.loadShort}</i><b>{Math.round(loadForecast.heat)}%</b></span>
                            <i className="bf-load-meter" aria-hidden="true">
                              <b style={{ width: `${loadForecast.heat}%` }} />
                            </i>
                          </span>
                        )}
                      </span>
                      {installedForSector.length > 0 && (
                        <span className="bf-module-rack" aria-label={`${t.installed} ${installedForSector.length}`}>
                          {installedForSector.map((id) => <i key={id} />)}
                        </span>
                      )}
                      {jam !== "none" && (
                        <span className={`bf-jam-badge is-${jam}`}>
                          <UiIcon name="jam" className="ui-icon" />
                          {jam === "warning" ? t.jamWarning : t.jammed}
                        </span>
                      )}
                      {sectorEffect && recentEffectText && (
                        <b className={`bf-effect ${sectorEffect.cause ? "is-failure" : ""}`} key={sectorEffect.id}>
                          {recentEffectText}
                        </b>
                      )}
                    </article>
                  );
                })}
              </div>

              <div className="bf-relay-deck">
                <div className="bf-guidance-stack">
                  <div id="mobile-relay-guidance" className={`bf-guidance ${actionFailure ? "is-failure" : ""}`}>
                    {actionFailure ? (
                      <strong><UiIcon name="warning" className="ui-icon" />{actionFailure}</strong>
                    ) : tutorialCopy ? (
                      <strong><b>{tutorialStep + 1}/3</b>{tutorialCopy}</strong>
                    ) : resonanceEnabled ? (
                      <span>
                        <b>{t.nextPulseShort}</b>
                        <i style={sectorStyle(nextAffinity)}><UiIcon name={nextAffinity} className="ui-icon" /> {t.sector[nextAffinity]}</i>
                        {nextAffinity === currentSector && <em>{t.matchBonus}</em>}
                      </span>
                    ) : (
                      <span><b>{t.flowResult}</b><i>{recentEffectText ?? t.waitingPulse}</i></span>
                    )}
                  </div>
                  {resonanceEnabled && (
                    <div className={`bf-resonance ${view.resonance === 3 ? "is-ready" : ""}`} aria-label={`${t.resonance} ${view.resonance}/3`}>
                      <span>{view.resonance === 3 ? t.overdriveReady : t.resonance}</span>
                      <i className={view.resonance >= 1 ? "is-live" : ""} />
                      <i className={view.resonance >= 2 ? "is-live" : ""} />
                      <i className={view.resonance >= 3 ? "is-live" : ""} />
                      <strong>{t.overdrive} ×{view.overdrives}</strong>
                    </div>
                  )}
                </div>

                <button
                  ref={mobileRelayRef}
                  type="button"
                  className="bf-relay-switch"
                  onClick={rotate}
                  aria-label={language === "ja"
                    ? `タップすると送電先が${t.sector[currentSector]}から${t.sector[nextSector]}へ切り替わります`
                    : `Tap to switch the power route from ${t.sector[currentSector]} to ${t.sector[nextSector]}`}
                  aria-describedby={circuitLoadEnabled
                    ? "mobile-relay-guidance mobile-relay-load"
                    : "mobile-relay-guidance"}
                  disabled={view.phase !== "playing" || (tutorialStep < 3 && view.transits.length > 0)}
                >
                  <RelayDial sector={currentSector} pulseProgress={pulseProgress} />
                  <span className="bf-relay-copy">
                    <small>{t.switchTap}</small>
                    <strong>{t.sector[currentSector]} <i>→</i> {t.sector[nextSector]}</strong>
                    <span className="bf-relay-status">
                      {expectedTutorialSector && !tutorialAligned
                        ? t.waitingInput
                        : view.transits.length
                          ? t.active
                          : `${t.pulseIn} ${pulseSeconds.toFixed(1)}s`}
                    </span>
                    {circuitLoadEnabled && (
                    <span id="mobile-relay-load" className={`bf-load-forecast is-${selectedLoadForecast.projectedStatus}`}>
                      <b>
                        {selectedLoadForecast.willOverload
                          ? t.overloadWarning
                          : selectedLoadForecast.urgent
                              && !selectedLoadForecast.matched
                              && !selectedLoadForecast.jammed
                            ? t.priorityRelief
                            : `${t.nextLoad} · ${t[selectedLoadForecast.projectedStatus]}`}
                      </b>
                      <i>{Math.round(selectedLoadForecast.heat)} → {Math.round(selectedLoadForecast.projectedHeat)}%</i>
                      <em>
                        {selectedLoadForecast.heatDelta < 0
                          ? t.cooling
                          : `${t.output} ${Math.round(selectedLoadForecast.outputMultiplier * 100)}%`}
                      </em>
                    </span>
                    )}
                  </span>
                </button>
              </div>

              <span className="sr-only" role="status" aria-live="polite">
                {mobileNoticeText ?? recentEffectText ?? ""}
              </span>
            </section>
          </div>

          <div className="desktop-network">
          <WorldStateOverlay
            className="desktop-world-state"
            integrity={view.integrity}
            maxIntegrity={view.maxIntegrity}
            enemyCount={view.enemies.length}
            nearestProgress={nearestEnemy}
          />
          <div className="enemy-lane" aria-label="Incoming hostiles">
            <div className="city-silhouette" aria-hidden="true">
              <i /><i /><i /><i /><i /><i />
            </div>
            <div className="lane-rail lane-rail-top" />
            <div className="lane-rail lane-rail-bottom" />
            <div className={`core-gate ${nearestEnemy > 0.76 ? "is-threatened" : ""}`}>
              <span className="gate-light" />
              <small>CORE</small>
            </div>
            <div className={`threat-summary ${defenseForecast ? "has-threat" : "is-scanning"}`}>
              <span>{t.cityStatus}</span>
              <strong>
                {defenseForecast
                  ? `${t.contact} ${Math.max(0, Math.ceil(defenseForecast.etaSeconds))}s`
                  : nextSpawnSeconds !== null
                    ? `${t.nextThreat} ${nextSpawnSeconds}s`
                    : t.scan}
              </strong>
              {defenseForecast && (
                <div>
                  <span className="threat-breach">{t.breach} −{defenseForecast.breachDamage} CORE</span>
                  <span className="threat-demand">×{defenseForecast.threatCount} / {t.attacks} {defenseForecast.defensePulsesRequired}{t.shot} / AMMO {formatAmmoForecast(defenseForecast.ammoRequired)}</span>
                  <span className="threat-demand-compact">{defenseForecast.defensePulsesRequired}{t.shot} / A{formatAmmoForecast(defenseForecast.ammoRequired)}</span>
                </div>
              )}
            </div>
            <span className="sr-only" role="status" aria-live="polite">{threatAnnouncement}</span>
            {view.enemies.map((enemy) => {
              const stats = ENEMY_STATS[enemy.kind];
              const left = 94 - enemy.progress * 86;
              const hpPercent = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
              return (
                <div
                  key={enemy.id}
                  className={`enemy enemy-${enemy.kind} ${enemy.flashUntil > view.clock ? "is-hit" : ""}`}
                  style={{
                    left: `${left}%`,
                    top: `${18 + enemy.track * 24}%`,
                    "--enemy-health": `${hpPercent}%`,
                  } as CSSProperties}
                  aria-label={`${stats.name[language]} ${Math.ceil(enemy.hp)}/${enemy.maxHp}`}
                >
                  <span className="enemy-icon" aria-hidden="true">{stats.icon}</span>
                  <span className="enemy-health"><i /></span>
                  {enemy.kind !== "rusher" && <span className="enemy-tag">{stats.name[language]}</span>}
                </div>
              );
            })}
          </div>

          <svg className="conduit-map" viewBox="0 0 1000 680" preserveAspectRatio="none" aria-hidden="true">
            <line x1="500" y1="380" x2="205" y2="555" className={`conduit-line extract ${currentSector === "extract" ? "is-live" : ""}`} />
            <line x1="500" y1="380" x2="795" y2="555" className={`conduit-line fabricate ${currentSector === "fabricate" ? "is-live" : ""}`} />
            <line x1="500" y1="380" x2="500" y2="160" className={`conduit-line defend ${currentSector === "defend" ? "is-live" : ""}`} />
            {view.transits.map((pulse) => {
              const destination = ROUTE_POINTS[pulse.sector];
              const cx = 500 + (destination.x - 500) * pulse.progress;
              const cy = 380 + (destination.y - 380) * pulse.progress;
              return (
                <g key={pulse.id} className={`transit transit-${pulse.sector} ${pulse.matched ? "is-matched" : ""}`}>
                  <circle cx={cx} cy={cy} r={pulse.matched ? 10 : 7} />
                  <circle cx={cx} cy={cy} r={pulse.matched ? 22 : 16} className="transit-halo" />
                </g>
              );
            })}
            {view.shotEffect && (
              <g key={view.shotEffect.id}>
                <line
                  x1="500"
                  y1="154"
                  x2={940 - view.shotEffect.targetProgress * 860}
                  y2={34 + view.shotEffect.targetTrack * 31}
                  className={`shot-beam ${view.shotEffect.critical ? "is-critical" : ""}`}
                />
                {view.shotEffect.secondaryTargetProgress !== undefined && view.shotEffect.secondaryTargetTrack !== undefined && (
                  <line
                    x1="500"
                    y1="154"
                    x2={940 - view.shotEffect.secondaryTargetProgress * 860}
                    y2={34 + view.shotEffect.secondaryTargetTrack * 31}
                    className="shot-beam is-secondary"
                  />
                )}
              </g>
            )}
          </svg>

          <article
            className={`${circuitClass(view, "defend", recommendedSector)} station station-cannon`}
            style={sectorStyle("defend")}
            aria-label={`${t.sector.defend}, ${defenseForecast ? `${t.contact} ${Math.ceil(defenseForecast.etaSeconds)}s` : t.noTarget}`}
          >
            <div className="machine-visual machine-cannon" aria-hidden="true">
              <span className="machine-body" /><span className="machine-tool" /><span className="machine-output" />
            </div>
            <div className="node-header">
              <span className="node-icon"><UiIcon name="defend" className="ui-icon" /></span>
              <div><small>03</small><strong>{t.sector.defend}</strong></div>
            </div>
            <div className="node-value">
              <span>{t.sectorShort.defend}</span>
              <strong>{defenseForecast ? `${Math.max(0, Math.ceil(defenseForecast.etaSeconds))}s` : t.noTarget}</strong>
            </div>
            <CircuitStatus state={view} sector="defend" language={language} />
          </article>

          <article
            className={`${circuitClass(view, "extract", recommendedSector)} station station-drill`}
            style={sectorStyle("extract")}
            aria-label={`${t.sector.extract}, ${t.sectorShort.extract} ${formatNumber(view.ore)} / ${GAME_LIMITS.ore}${currentSector === "extract" ? `, ${t.active}` : ""}`}
          >
            <div className="machine-visual machine-drill" aria-hidden="true">
              <span className="machine-body" /><span className="machine-tool" /><span className="machine-output" />
            </div>
            <div className="node-header">
              <span className="node-icon"><UiIcon name="extract" className="ui-icon" /></span>
              <div><small>01</small><strong>{t.sector.extract}</strong></div>
            </div>
            <div className="node-value">
              <span>{t.sectorShort.extract}</span>
              <strong>{formatNumber(view.ore)}<small> / {GAME_LIMITS.ore}</small></strong>
            </div>
            <CircuitStatus state={view} sector="extract" language={language} />
          </article>

          <article
            className={`${circuitClass(view, "fabricate", recommendedSector)} station station-press`}
            style={sectorStyle("fabricate")}
            aria-label={`${t.sector.fabricate}, ${t.sectorShort.fabricate} ${formatNumber(view.ammo)} / ${GAME_LIMITS.ammo}${currentSector === "fabricate" ? `, ${t.active}` : ""}`}
          >
            <div className="machine-visual machine-press" aria-hidden="true">
              <span className="machine-body" /><span className="machine-tool" /><span className="machine-output" />
            </div>
            <div className="node-header">
              <span className="node-icon"><UiIcon name="fabricate" className="ui-icon" /></span>
              <div><small>02</small><strong>{t.sector.fabricate}</strong></div>
            </div>
            <div className="node-value">
              <span>{t.sectorShort.fabricate}</span>
              <strong>{formatNumber(view.ammo)}<small> / {GAME_LIMITS.ammo}</small></strong>
            </div>
            <CircuitStatus state={view} sector="fabricate" language={language} />
          </article>

          <div className="relay-zone" style={relayStyle}>
            {resonanceEnabled && (
              <div id="desktop-pulse-preview" className="pulse-preview" aria-label={t.nextPulse}>
                <span className="preview-label">{t.nextPulse}</span>
                <span className={`frequency-chip frequency-${nextAffinity} ${nextAffinity === currentSector ? "is-matched" : ""}`}>
                  <UiIcon name={nextAffinity} className="ui-icon" />
                </span>
                <span className={`frequency-chip frequency-${nextAfter} is-next`}><UiIcon name={nextAfter} className="ui-icon" /></span>
              </div>
            )}
            <button
              ref={relayRef}
              type="button"
              className="relay-control"
              onClick={rotate}
              aria-label={`${t.rotate}. ${t.sector[currentSector]}`}
              aria-describedby={resonanceEnabled
                ? "desktop-relay-guidance desktop-pulse-preview"
                : "desktop-relay-guidance"}
              disabled={view.phase !== "playing" || (tutorialStep < 3 && view.transits.length > 0)}
            >
              <span className="relay-progress" aria-hidden="true" />
              <span className="relay-inner" aria-hidden="true">
                <span className="relay-bolts"><i /><i /><i /><i /><i /><i /></span>
                <span className="relay-rotor"><i /><i /><i /></span>
                <span className="relay-handle"><i /></span>
                <span className="relay-core-mark">{t.tap}</span>
                <span className="relay-touch-copy">{t.tapRelay}</span>
              </span>
              <span className="relay-sector-name">{t.sector[currentSector]}</span>
            </button>
            <span id="desktop-relay-guidance" className="relay-instruction" role="status" aria-live="polite">
              {actionFailure ? (
                <><b>!</b><strong>{actionFailure}</strong></>
              ) : tutorialCopy ? (
                <><b>{tutorialStep + 1} / 3</b><strong>{tutorialCopy}</strong></>
              ) : resonanceEnabled ? (
                <><b>{t.nextPulseShort}</b><strong>{t.sector[nextAffinity]}</strong></>
              ) : (
                <><b>{t.flowResult}</b><strong>{recentEffectText ?? t.waitingPulse}</strong></>
              )}
            </span>
          </div>

          <div className="notice-stack" role="status" aria-live="polite">
            {view.notices.map((notice) => {
              const upgradeModule = notice.upgradeId ? UPGRADES.find((upgrade) => upgrade.id === notice.upgradeId) : null;
              return (
                <span key={notice.id} className={`notice notice-${notice.tone}`}>
                  {upgradeModule ? `${upgradeModule.name[language]} // ${upgradeModule.value}` : notice.text}
                </span>
              );
            })}
          </div>
          </div>
        </section>

        <footer className="game-footer">
          <div className="footer-stat">
            <span>{t.valid}</span>
            <strong>{validRate}%</strong>
          </div>
          {resonanceEnabled ? <p>{t.affinityHelp}</p> : <p>{t.loopHint}</p>}
          <div className="module-strip" aria-label={t.installed}>
            {view.upgrades.length ? view.upgrades.map((id) => {
              const upgrade = UPGRADES.find((item) => item.id === id);
              return upgrade ? <span key={id} title={upgrade.name[language]}>{upgrade.icon}</span> : null;
            }) : <span className="module-empty">−</span>}
          </div>
        </footer>
      </main>
      </div>

      {view.phase === "ready" && (
        <div ref={modalRef} tabIndex={-1} className="game-overlay opening-overlay" role="dialog" aria-modal="true" aria-busy={!initialized} aria-labelledby="opening-title" aria-describedby="opening-description" onKeyDown={trapModalFocus}>
          <div className="opening-copy">
            <div className="overlay-tools">
              <button type="button" onClick={toggleLanguage} className="utility-button" aria-label={t.languageLabel}>{t.language}</button>
              <button type="button" onClick={toggleMute} className="utility-button" aria-label={muted || platformMuted ? t.unmute : t.mute} aria-pressed={muted || platformMuted} disabled={platformMuted}>{muted || platformMuted ? "SOUND OFF" : "SOUND ON"}</button>
            </div>
            <p className="eyebrow">{t.titleKicker}</p>
            <div className="title-lockup">
              <h1 id="opening-title">{t.title}</h1>
              <span>{t.subtitle}</span>
            </div>
            <p className="premise" id="opening-description">{t.premise}</p>
            <div className="opening-circuits" aria-hidden="true">
              {(["extract", "fabricate", "defend"] as Sector[]).map((sector, index) => (
                <span key={sector} style={sectorStyle(sector)}>
                  <i>{String(index + 1).padStart(2, "0")}</i>
                  <UiIcon name={sector} className="ui-icon" /> {t.sector[sector]}
                </span>
              ))}
            </div>
            <button type="button" className="primary-action" onClick={() => beginRun("opening")} disabled={!initialized}>
              <span>{profile.tutorialCompleted ? t.start : t.startGuided}</span><i aria-hidden="true">→</i>
            </button>
            {!profile.tutorialCompleted && (
              <button type="button" className="opening-skip" onClick={() => beginRun("opening", false)} disabled={!initialized}>
                {t.skipTutorial}
              </button>
            )}
            <div className="profile-line">
              <span>{t.best} <strong>{profile.bestScore.toLocaleString("en-US")}</strong></span>
              <span>{t.runs} <strong>{profile.runs}</strong></span>
              <span>{t.wins} <strong>{profile.wins}</strong></span>
            </div>
            <a className="privacy-link" href="/privacy" target="_blank" rel="noreferrer">
              {t.privacy}
            </a>
          </div>
        </div>
      )}

      {view.phase === "upgrade" && (
        <div ref={modalRef} tabIndex={-1} className="game-overlay upgrade-overlay" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" aria-describedby="upgrade-description" onKeyDown={trapModalFocus}>
          <div className="upgrade-heading">
            <span>WAVE {view.waveIndex + 1} CLEAR</span>
            <h2 id="upgrade-title">{t.upgrade}</h2>
            <p id="upgrade-description">{t.upgradeSub}</p>
          </div>
          <div className="upgrade-grid">
            {upgradeChoices.map((upgrade, index) => upgrade && (
              <button
                type="button"
                key={upgrade.id}
                className={`upgrade-card branch-${upgrade.branch}`}
                onClick={() => installUpgrade(upgrade.id)}
                style={sectorStyle(upgrade.branch)}
                autoFocus={index === 0}
                aria-keyshortcuts={String(index + 1)}
              >
                <span className="upgrade-number">0{index + 1}</span>
                <span className="upgrade-icon">{upgrade.icon}</span>
                <span className="upgrade-branch">{t.sector[upgrade.branch]}</span>
                <strong>{upgrade.name[language]}</strong>
                <p>{upgrade.description[language]}</p>
                <em>{upgrade.value}</em>
              </button>
            ))}
          </div>
        </div>
      )}

      {view.phase === "intermission" && (
        <div className="intermission-banner">
          <span className="sr-only" role="status">
            {latestUpgrade ? `${latestUpgrade.name[language]} ${latestUpgrade.value}. ` : ""}{t.intermission}
          </span>
          {latestUpgrade && (
            <span className="intermission-module" style={sectorStyle(latestUpgrade.branch)} aria-hidden="true">
              <i aria-hidden="true">{latestUpgrade.icon}</i>
              <b>{latestUpgrade.name[language]}</b>
              <small>{latestUpgrade.value}</small>
            </span>
          )}
          <span aria-hidden="true">{t.intermission}</span><strong aria-hidden="true">{Math.ceil(view.intermissionLeft)}</strong>
        </div>
      )}

      {view.phase === "paused" && (
        <div ref={modalRef} tabIndex={-1} className="game-overlay pause-overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title" aria-describedby="pause-description" onKeyDown={trapModalFocus}>
          <p className="eyebrow">SYSTEM HOLD</p>
          <h2 id="pause-title">{t.paused}</h2>
          <div className="pause-metrics">
            <span>{t.valid} <strong>{validRate}%</strong></span>
            <span>{t.score} <strong>{Math.round(view.score).toLocaleString("en-US")}</strong></span>
          </div>
          <p className="pause-help" aria-hidden="true">
            {resonanceEnabled ? t.affinityHelp : t.loopHint}
          </p>
          <span className="sr-only" id="pause-description">
            {resonanceEnabled ? t.affinityHelp : t.loopHint}
          </span>
          {view.upgrades.length > 0 && (
            <section className="pause-modules" aria-labelledby="pause-modules-title">
              <h3 className="pause-modules-label" id="pause-modules-title">{t.installed}</h3>
              {view.upgrades.map((id) => {
                const upgrade = UPGRADES.find((item) => item.id === id);
                return upgrade ? (
                  <div key={id} style={sectorStyle(upgrade.branch)}>
                    <i aria-hidden="true">{upgrade.icon}</i>
                    <span><strong>{upgrade.name[language]}</strong><small>{upgrade.description[language]}</small></span>
                  </div>
                ) : null;
              })}
            </section>
          )}
          <div className="overlay-tools pause-tools">
            <button type="button" onClick={toggleLanguage} className="utility-button" aria-label={t.languageLabel}>{t.language}</button>
            <button type="button" onClick={toggleMute} className="utility-button" aria-pressed={muted || platformMuted} disabled={platformMuted}>{muted || platformMuted ? t.unmute : t.mute}</button>
          </div>
          <button type="button" className="primary-action compact" onClick={togglePause} autoFocus>
            <span>{t.continue}</span><UiIcon name="play" className="ui-icon" />
          </button>
        </div>
      )}

      {(view.phase === "won" || view.phase === "lost") && (
        <div ref={modalRef} tabIndex={-1} className={`game-overlay result-overlay result-${view.phase}`} role="dialog" aria-modal="true" aria-labelledby="result-title" aria-describedby={visibleEvidence ? "result-summary result-evidence-summary" : "result-summary"} onKeyDown={trapModalFocus}>
          <p className="eyebrow">{view.phase === "won" ? "SHIFT COMPLETE" : "SHIFT TERMINATED"}</p>
          <h2 id="result-title">{view.phase === "won" ? t.victory : t.defeat}</h2>
          <div className="result-stats" id="result-summary">
            <span><small>{t.resultWave}</small><strong>{view.waveIndex + 1} / {WAVES.length}</strong></span>
            <span><small>{t.resultKills}</small><strong>{view.kills}</strong></span>
            <span><small>{t.resultScore}</small><strong>{Math.round(view.score).toLocaleString("en-US")}</strong></span>
          </div>
          {visibleEvidence && (
            <dl className="result-evidence" id="result-evidence-summary" aria-label={t.evidence}>
              <div><dt>{t.activeTime}</dt><dd>{visibleEvidence.activeSeconds.toFixed(1)}{t.seconds}</dd></div>
              <div><dt>{t.firstKillTime}</dt><dd>{visibleEvidence.firstKillSeconds === null ? t.noRecord : `${visibleEvidence.firstKillSeconds.toFixed(1)}${t.seconds}`}</dd></div>
              <div><dt>{t.rotationsPerSecond}</dt><dd>{visibleEvidence.rotationsPerSecond.toFixed(2)}</dd></div>
              <div><dt>{t.productiveRate}</dt><dd>{Math.round(visibleEvidence.productiveRate * 100)}%</dd></div>
            </dl>
          )}
          {debriefLines.length > 0 && (
            <section className="result-debrief" aria-labelledby="result-debrief-title">
              <h3 id="result-debrief-title">{t.debrief}</h3>
              <ul>{debriefLines.map((line) => <li key={line}>{line}</li>)}</ul>
            </section>
          )}
          {view.phase === "lost" && view.lossCause && (
            <p className="loss-cause"><strong>{ENEMY_STATS[view.lossCause.enemyKind].name[language]}</strong> {t.failureCause} (−{view.lossCause.breachDamage} CORE)</p>
          )}
          <button type="button" className="primary-action" onClick={() => beginRun("replay", false)}>
            <span>{t.replay}</span><i aria-hidden="true">↻</i>
          </button>
        </div>
      )}
    </div>
  );
}

function CircuitStatus({ state, sector, language }: { state: GameState; sector: Sector; language: Language }) {
  const jam = getActiveJamState(state, sector);
  const copy = TEXT[language];
  const effect = state.sectorEffect?.sector === sector ? state.sectorEffect : null;
  if (jam === "active") return <span className="node-status status-jammed">{copy.jammed}</span>;
  if (jam === "warning") return <span className="node-status status-warning">{copy.jamWarning}</span>;
  if (effect) {
    return (
      <span key={effect.id} className={`node-status status-effect ${effect.success ? "is-success" : "is-fail"}`}>
        {effect.success
          ? `${effect.amount > 0 ? "+" : ""}${formatNumber(effect.amount)}`
          : effect.cause
            ? FAILURE_TEXT[language][effect.cause]
            : "NO OUTPUT"}
      </span>
    );
  }
  if (isCircuitLoadEnabled(state)) {
    const load = getCircuitLoadForecast(state, sector);
    return <span className="node-status">{copy.loadShort} {Math.round(load.heat)}%</span>;
  }
  return <span className="node-status">STANDBY</span>;
}
