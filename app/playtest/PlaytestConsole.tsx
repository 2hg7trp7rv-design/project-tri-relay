"use client";

import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVE_RUN_KEY,
  LEGACY_ACTIVE_RUN_KEYS,
  LEGACY_PROFILE_KEY,
  PROFILE_KEY,
  safeReadActiveRun,
  safeWriteActiveRun,
} from "../game/persistence";
import { getStoredRunEvidenceResult } from "../game/playtest-metrics";
import { EnemyGlyph, MachineGlyph } from "../game/production-visuals";
import {
  PLAYTEST_RELEASE,
  PLAYTEST_TESTER_IDS,
  DEFAULT_PLAYTEST_OBSERVATION,
  clearPlaytestSession,
  closeUnrecoverablePlaytestRun,
  completePlaytestSession,
  createPlaytestSession,
  getPlaytestCompletionIssues,
  getPlaytestReplayDelaySeconds,
  isImmutableVercelDeploymentUrl,
  recordPlaytestRun,
  safeReadPlaytestSession,
  savePlaytestObservation,
  serializePlaytestSession,
  type PlaytestDatasetKind,
  type PlaytestObservation,
  type ObservedTiming,
  type PlaytestSession,
  type PlaytestTesterId,
  type RecordedChoice,
} from "../game/playtest-session";

const QUESTION_LABELS = [
  "このゲームで何をしていましたか？",
  "採掘、製造、防衛はどうつながっていますか？",
  "中央の装置を回した理由は何ですか？",
  "2ウェーブ目から増えたルールは何でしたか？",
  "危険な状態を画面のどこで判断しましたか？",
  "もう一度、自分から遊びたいですか？理由は何ですか？",
] as const;

const TIMING_LABELS: Array<[keyof PlaytestObservation["wallTimings"], string]> = [
  ["firstInput", "最初の入力"],
  ["firstExtract", "最初の採掘"],
  ["firstFabricate", "最初の製造"],
  ["firstAmmo", "最初の弾薬生成"],
  ["firstDefend", "最初の防衛"],
  ["firstKill", "最初の撃破"],
  ["tutorialComplete", "チュートリアル完了"],
  ["ninetySecondMark", "壁時計90秒地点"],
];

const READABILITY_LABELS: Array<[keyof PlaytestObservation["readabilityChecks"], string]> = [
  ["threat", "脅威"], ["city", "都市"], ["currentRoute", "現在の送電先"],
  ["nextRoute", "次の送電先"], ["ore", "鉱石"], ["ammo", "弾薬"],
];

const FACILITY_LABELS: Array<[keyof PlaytestObservation["facilitySilhouettes"], string]> = [
  ["extract", "採掘設備"], ["fabricate", "製造設備"], ["defend", "防衛設備"],
];

const ENEMY_LABELS: Array<[keyof PlaytestObservation["enemySilhouettes"], string]> = [
  ["rusher", "ラッシャー"], ["sapper", "サッパー"],
  ["jammer", "ジャマー"], ["warden", "ウォーデン"],
];

const EMPTY_PREFLIGHT = {
  observerCode: "",
  consentConfirmed: "not-recorded" as RecordedChoice,
  firstTimeConfirmed: "not-recorded" as RecordedChoice,
  externalTesterConfirmed: "not-recorded" as RecordedChoice,
  assistanceProvided: "not-recorded" as RecordedChoice,
  device: "",
  os: "",
  browser: "",
  inputMethod: "",
  audioMode: "",
};

function readMeta(name: string) {
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? "unknown";
}

function normalizeDeploymentEnvironment(value: string): PlaytestSession["deploymentEnvironment"] {
  if (value === "production" || value === "preview" || value === "development" || value === "local") return value;
  return "unknown";
}

function isOfficialPortraitViewport(width: number, height: number) {
  return width >= 320 && width <= 430 && height >= 568 && height <= 932 && width < height;
}

function choiceLabel(value: RecordedChoice) {
  if (value === "yes") return "はい";
  if (value === "no") return "いいえ";
  return "未記録";
}

function ChoiceField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: RecordedChoice;
  onChange: (value: RecordedChoice) => void;
  disabled: boolean;
}) {
  return (
    <label className="playtest-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as RecordedChoice)} disabled={disabled}>
        {(["not-recorded", "yes", "no"] as const).map((choice) => (
          <option key={choice} value={choice}>{choiceLabel(choice)}</option>
        ))}
      </select>
    </label>
  );
}

function TimingField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: ObservedTiming;
  onChange: (value: ObservedTiming) => void;
  disabled: boolean;
}) {
  const notReached = value === "not-reached";
  return (
    <div className="playtest-timing-field">
      <label className="playtest-field">
        <span>{label}</span>
        <input
          type="number"
          min="0"
          max="43200"
          step="0.1"
          value={typeof value === "number" ? value : ""}
          onChange={(event) => onChange(event.target.value === ""
            ? null
            : Math.max(0, Math.min(43_200, Number(event.target.value))))}
          disabled={disabled || notReached}
        />
      </label>
      <label className="playtest-not-reached">
        <input
          type="checkbox"
          checked={notReached}
          onChange={(event) => onChange(event.target.checked ? "not-reached" : null)}
          disabled={disabled}
        />
        未到達（未記録とは別）
      </label>
    </div>
  );
}

function safeSessionStorage() {
  try { return window.sessionStorage; } catch { return null; }
}

function refreshSession() {
  return safeReadPlaytestSession(safeSessionStorage());
}

export default function PlaytestConsole() {
  const [testerId, setTesterId] = useState<PlaytestTesterId>("T01");
  const [datasetKind, setDatasetKind] = useState<PlaytestDatasetKind>("pilot");
  const [session, setSession] = useState<PlaytestSession | null>(null);
  const [observation, setObservation] = useState<PlaytestObservation | null>(null);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [exactRevision, setExactRevision] = useState(false);
  const [immutableConsoleUrl, setImmutableConsoleUrl] = useState<string | null>(null);
  const [preflight, setPreflight] = useState(EMPTY_PREFLIGHT);
  const [silhouetteScoringVisible, setSilhouetteScoringVisible] = useState(false);
  const dirtyRef = useRef(false);
  const sessionRef = useRef<PlaytestSession | null>(null);
  const observationRef = useRef<PlaytestObservation | null>(null);

  const reload = useCallback(() => {
    const current = refreshSession();
    const previousSessionId = sessionRef.current?.sessionId ?? null;
    const reportStorage = safeSessionStorage();
    const active = safeReadActiveRun(reportStorage);
    if (current && !current.currentRunStartedAt && active?.playtestSessionId === current.sessionId) {
      safeWriteActiveRun(null, null, reportStorage);
      setMessage("セッション記録に対応しない古い途中保存を隔離しました。");
    }
    if (!current || current.sessionId !== previousSessionId) {
      setPreflight(EMPTY_PREFLIGHT);
      setSilhouetteScoringVisible(false);
    }
    sessionRef.current = current;
    setSession(current);
    setObservation((draft) => {
      if (dirtyRef.current && draft && current?.status === "active" && current.sessionId === previousSessionId) return draft;
      dirtyRef.current = false;
      const next = current?.observation ?? null;
      observationRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    sessionRef.current = session;
    observationRef.current = observation;
  }, [session, observation]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const revision = readMeta("tri-relay-source-revision");
      const immutableDeployment = readMeta("tri-relay-immutable-deployment");
      const environment = readMeta("tri-relay-deployment-environment");
      let immutableOrigin = "";
      try { immutableOrigin = new URL(immutableDeployment).origin; } catch { /* invalid below */ }
      const exact = /^[0-9a-f]{40}$/i.test(revision)
        && environment === "production"
        && isImmutableVercelDeploymentUrl(immutableDeployment)
        && window.location.origin === immutableOrigin;
      setExactRevision(exact);
      setImmutableConsoleUrl(
        !exact && /^[0-9a-f]{40}$/i.test(revision)
          && environment === "production"
          && isImmutableVercelDeploymentUrl(immutableDeployment)
          ? `${immutableOrigin}/playtest`
          : null,
      );
      setDatasetKind(exact ? "official" : "pilot");
      reload();
      setReady(true);
    });
    const handlePageShow = () => reload();
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handlePageShow);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handlePageShow);
    };
  }, [reload]);

  useEffect(() => {
    if (!dirtyRef.current || !session || !observation || session.status !== "active") return;
    const timer = window.setTimeout(() => {
      const saved = savePlaytestObservation(session.sessionId, observation, safeSessionStorage());
      if (!saved) return;
      dirtyRef.current = false;
      sessionRef.current = saved;
      observationRef.current = saved.observation;
      setSession(saved);
      if (saved.observation.protocolDeviation !== observation.protocolDeviation) {
        setObservation(saved.observation);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [observation, session]);

  useEffect(() => {
    const flushDraft = () => {
      const currentSession = sessionRef.current;
      const currentObservation = observationRef.current;
      if (!dirtyRef.current || !currentSession || !currentObservation || currentSession.status !== "active") return;
      const saved = savePlaytestObservation(currentSession.sessionId, currentObservation, safeSessionStorage());
      if (saved) dirtyRef.current = false;
    };
    window.addEventListener("pagehide", flushDraft);
    return () => window.removeEventListener("pagehide", flushDraft);
  }, []);

  const startSession = () => {
    const reportStorage = safeSessionStorage();
    if (!reportStorage) {
      setMessage("ブラウザ保存領域を使用できないため、テストを開始できません。");
      return;
    }
    if (!preflight.observerCode.trim() || preflight.consentConfirmed !== "yes") {
      setMessage("開始前に観察者コードと参加同意の「はい」を記録してください。");
      return;
    }
    if (preflight.firstTimeConfirmed === "not-recorded"
      || preflight.externalTesterConfirmed === "not-recorded"
      || preflight.assistanceProvided === "not-recorded") {
      setMessage("開始前に初見・外部テスター・操作補助の状態を記録してください。");
      return;
    }
    if (datasetKind === "official" && (preflight.firstTimeConfirmed !== "yes"
      || preflight.externalTesterConfirmed !== "yes"
      || preflight.assistanceProvided !== "no")) {
      setMessage("正式ゲートは初見の外部テスターかつ操作補助なしに限ります。パイロットへ切り替えてください。");
      return;
    }
    if (session && !window.confirm("現在の端末内セッションを置き換えます。JSON保存済みですか？")) return;
    const revision = readMeta("tri-relay-source-revision");
    const immutableDeployment = readMeta("tri-relay-immutable-deployment");
    const deploymentEnvironment = readMeta("tri-relay-deployment-environment");
    if (datasetKind === "official" && !exactRevision) {
      setMessage("正式テストは、記録する不変Vercel本番配備の/playtest上でだけ開始できます。");
      return;
    }
    if (datasetKind === "official" && !isOfficialPortraitViewport(window.innerWidth, window.innerHeight)) {
      setMessage("正式ゲートは幅320〜430・高さ568〜932の縦画面で開始してください。");
      return;
    }
    for (const key of [PROFILE_KEY, LEGACY_PROFILE_KEY, ACTIVE_RUN_KEY, ...LEGACY_ACTIVE_RUN_KEYS]) {
      reportStorage.removeItem(key);
    }
    const initialObservation: PlaytestObservation = {
      ...structuredClone(DEFAULT_PLAYTEST_OBSERVATION),
      ...preflight,
    };
    const created = createPlaytestSession({
      datasetKind,
      testerId,
      deploymentUrl: immutableDeployment === "unknown" ? `${window.location.origin}/` : immutableDeployment,
      deploymentEnvironment: normalizeDeploymentEnvironment(deploymentEnvironment),
      sourceRevision: revision,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
      },
      language: navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en",
      initialObservation,
      storage: reportStorage,
    });
    if (!created) {
      setMessage("セッション記録を作成できませんでした。");
      return;
    }
    dirtyRef.current = false;
    setPreflight(EMPTY_PREFLIGHT);
    setMessage("");
    window.location.assign(`/#playtest=${created.sessionId}`);
  };

  const updateObservation = <K extends keyof PlaytestObservation>(
    key: K,
    value: PlaytestObservation[K],
  ) => {
    dirtyRef.current = true;
    setObservation((current) => current ? { ...current, [key]: value } : current);
  };

  const updateChoiceGroup = <K extends "readabilityChecks" | "facilitySilhouettes" | "enemySilhouettes">(
    group: K,
    key: keyof PlaytestObservation[K],
    value: RecordedChoice,
  ) => {
    dirtyRef.current = true;
    setObservation((current) => current ? {
      ...current,
      [group]: { ...current[group], [key]: value },
    } : current);
  };

  const persistObservation = () => {
    if (!session || !observation) return null;
    const saved = savePlaytestObservation(session.sessionId, observation, safeSessionStorage());
    if (!saved) {
      setMessage("観察記録を保存できませんでした。入力長または保存領域を確認してください。");
      return null;
    }
    dirtyRef.current = false;
    sessionRef.current = saved;
    observationRef.current = saved.observation;
    setSession(saved);
    setObservation(saved.observation);
    setMessage("観察記録を端末内へ保存しました。外部送信はしていません。");
    return saved;
  };

  const goToGame = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!session) {
      window.location.assign("/");
      return;
    }
    if (session.status === "active" && !persistObservation()) {
      setMessage("観察記録を保存できなかったため、ゲームへ移動しませんでした。");
      return;
    }
    window.location.assign(session.status === "active" ? `/#playtest=${session.sessionId}` : "/");
  };

  const captureInterruptedRun = () => {
    if (!session || !observation) return;
    const reportStorage = safeSessionStorage();
    const observationSaved = savePlaytestObservation(session.sessionId, observation, reportStorage);
    if (!observationSaved) {
      setMessage("観察記録を先に保存できなかったため、中断ランを取得しませんでした。");
      return;
    }
    dirtyRef.current = false;
    const active = safeReadActiveRun(reportStorage);
    if (!active?.evidence) {
      setMessage("保存済みの進行中ランが見つかりません。");
      return;
    }
    if (active.playtestSessionId !== session.sessionId) {
      setMessage("別セッションの途中保存は取り込みませんでした。");
      return;
    }
    const evidence = getStoredRunEvidenceResult(active.state, active.evidence);
    const saved = recordPlaytestRun(session.sessionId, evidence, active.state, reportStorage);
    if (!saved) {
      setMessage("中断ランを記録できませんでした。");
      return;
    }
    safeWriteActiveRun(null, null, reportStorage);
    sessionRef.current = saved;
    observationRef.current = saved.observation;
    setSession(saved);
    setObservation(saved.observation);
    setMessage("進行中ランを未完了として記録しました。成績から除外されません。");
  };

  const closeTechnicalIncident = () => {
    if (!session || !observation) return;
    if (!observation.crashOrProgressBlockers || observation.crashOrProgressBlockers < 1) {
      setMessage("先にクラッシュ／進行不能件数を1件以上で保存してください。");
      return;
    }
    const startupIncident = !session.gameReadyAt && !session.currentRunStartedAt;
    if (!window.confirm(startupIncident
      ? "ゲーム表示前の技術事故として閉じます。復帰できないことを確認しましたか？"
      : "途中保存のない進行中ランを技術事故として閉じます。復帰できないことを確認しましたか？")) return;
    const reportStorage = safeSessionStorage();
    const observationSaved = savePlaytestObservation(session.sessionId, observation, reportStorage);
    if (!observationSaved) {
      setMessage("観察記録を保存できなかったため、ランを閉じませんでした。");
      return;
    }
    const saved = closeUnrecoverablePlaytestRun(session.sessionId, reportStorage);
    if (!saved || saved.currentRunStartedAt) {
      setMessage("進行中ランを技術事故として確定できませんでした。");
      return;
    }
    const active = safeReadActiveRun(reportStorage);
    if (active?.playtestSessionId === session.sessionId) safeWriteActiveRun(null, null, reportStorage);
    dirtyRef.current = false;
    sessionRef.current = saved;
    observationRef.current = saved.observation;
    setSession(saved);
    setObservation(saved.observation);
    setMessage("復元不能ランを技術事故として閉じました。この事故はNO-GO件数に残ります。");
  };

  const finishSession = () => {
    const saved = persistObservation();
    if (!saved) return;
    const issues = getPlaytestCompletionIssues(saved);
    if (issues.length) {
      setMessage(`未記録の必須項目があります: ${issues.slice(0, 6).join("、")}${issues.length > 6 ? ` ほか${issues.length - 6}件` : ""}`);
      return;
    }
    const completed = completePlaytestSession(saved.sessionId, safeSessionStorage());
    if (!completed) {
      setMessage("セッションを確定できませんでした。");
      return;
    }
    sessionRef.current = completed;
    observationRef.current = completed.observation;
    setSession(completed);
    setObservation(completed.observation);
    setMessage("セッションを確定しました。JSONを保存してから次のテスターへ進んでください。");
  };

  const copyJson = async () => {
    if (!session) return;
    const latest = session.status === "active" ? persistObservation() : session;
    if (!latest) return;
    const serialized = serializePlaytestSession(latest);
    if (!serialized) return;
    if (!window.confirm("回答原文を含むJSONをシステムのクリップボードへコピーします。共有・同期先を確認しましたか？")) return;
    try {
      await navigator.clipboard.writeText(serialized);
      setMessage("JSONをコピーしました。");
    } catch {
      setMessage("自動コピーに失敗しました。JSON保存を使用してください。");
    }
  };

  const downloadJson = () => {
    if (!session) return;
    const latest = session.status === "active" ? persistObservation() : session;
    if (!latest) return;
    const serialized = serializePlaytestSession(latest);
    if (!serialized) return;
    const blob = new Blob([serialized], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tri-relay-${latest.release}-${latest.testerId}-${latest.sessionId.slice(0, 8)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage("JSONファイルを保存しました。");
  };

  const discard = () => {
    if (!window.confirm("現在の端末内プレイテスト記録を削除します。元に戻せません。")) return;
    const reportStorage = safeSessionStorage();
    if (!clearPlaytestSession(reportStorage)) {
      setMessage("保存領域から記録を削除できませんでした。ブラウザ設定を確認してください。");
      return;
    }
    const active = safeReadActiveRun(reportStorage);
    if (active?.playtestSessionId === session?.sessionId) safeWriteActiveRun(null, null, reportStorage);
    dirtyRef.current = false;
    sessionRef.current = null;
    observationRef.current = null;
    setSession(null);
    setObservation(null);
    setPreflight(EMPTY_PREFLIGHT);
    setMessage("端末内の現在セッションを削除しました。");
  };

  const disabled = session?.status === "complete";

  return (
    <main className="playtest-console">
      <header className="playtest-console-header">
        <p>TRI RELAY // LOCAL QA</p>
        <h1>プレイテスト観察者コンソール</h1>
        <p>記録はこのタブのSession Storageだけに保存されます。自由回答、T-ID、観察者コードはAnalyticsへ送信されません。</p>
      </header>

      <section className="playtest-panel" aria-labelledby="playtest-start-title">
        <h2 id="playtest-start-title">新しいテスト</h2>
        <div className="playtest-grid compact">
          <label className="playtest-field">
            <span>テスターID</span>
            <select value={testerId} onChange={(event) => setTesterId(event.target.value as PlaytestTesterId)}>
              {PLAYTEST_TESTER_IDS.map((id) => <option key={id}>{id}</option>)}
            </select>
          </label>
          <label className="playtest-field">
            <span>データ種別</span>
            <select value={datasetKind} onChange={(event) => setDatasetKind(event.target.value as PlaytestDatasetKind)}>
              <option value="official" disabled={!exactRevision}>正式ゲート</option>
              <option value="pilot">練習・パイロット</option>
            </select>
          </label>
        </div>
        {immutableConsoleUrl && (
          <p className="playtest-note">正式記録を始める前に、<a href={immutableConsoleUrl}>このコミットの不変配備コンソールへ移動</a>してください。origin移動前にはセッションを作成しません。</p>
        )}
        <h3>開始前確認</h3>
        <div className="playtest-grid">
          <label className="playtest-field"><span>観察者コード</span><input maxLength={80} value={preflight.observerCode} onChange={(event) => setPreflight((current) => ({ ...current, observerCode: event.target.value }))} /></label>
          <ChoiceField label="参加同意を確認" value={preflight.consentConfirmed} onChange={(value) => setPreflight((current) => ({ ...current, consentConfirmed: value }))} disabled={false} />
          <ChoiceField label="本作を初めて見る" value={preflight.firstTimeConfirmed} onChange={(value) => setPreflight((current) => ({ ...current, firstTimeConfirmed: value }))} disabled={false} />
          <ChoiceField label="開発関係者ではない" value={preflight.externalTesterConfirmed} onChange={(value) => setPreflight((current) => ({ ...current, externalTesterConfirmed: value }))} disabled={false} />
          <ChoiceField label="操作補助を行う予定" value={preflight.assistanceProvided} onChange={(value) => setPreflight((current) => ({ ...current, assistanceProvided: value }))} disabled={false} />
          <label className="playtest-field"><span>端末</span><input maxLength={120} value={preflight.device} onChange={(event) => setPreflight((current) => ({ ...current, device: event.target.value }))} /></label>
          <label className="playtest-field"><span>OS</span><input maxLength={120} value={preflight.os} onChange={(event) => setPreflight((current) => ({ ...current, os: event.target.value }))} /></label>
          <label className="playtest-field"><span>ブラウザ</span><input maxLength={120} value={preflight.browser} onChange={(event) => setPreflight((current) => ({ ...current, browser: event.target.value }))} /></label>
          <label className="playtest-field"><span>入力方法</span><input maxLength={120} value={preflight.inputMethod} onChange={(event) => setPreflight((current) => ({ ...current, inputMethod: event.target.value }))} /></label>
          <label className="playtest-field"><span>音声状態</span><input maxLength={120} value={preflight.audioMode} onChange={(event) => setPreflight((current) => ({ ...current, audioMode: event.target.value }))} /></label>
        </div>
        <p className="playtest-note">同意確認後にだけ記録を作成します。ゲーム用プロフィールと途中保存はこのタブ専用のSession Storageを使い、通常プレイのLocal Storageは変更しません。正式ゲートでは初回チュートリアルをスキップできません。</p>
        <button type="button" className="playtest-primary" onClick={startSession} disabled={!ready}>初見テストを開始</button>
      </section>

      {session && observation && (
        <>
          <section className="playtest-panel" aria-labelledby="playtest-current-title">
            <h2 id="playtest-current-title">現在のセッション</h2>
            <dl className="playtest-summary">
              <div><dt>ID</dt><dd>{session.testerId}</dd></div>
              <div><dt>版</dt><dd>v{PLAYTEST_RELEASE}</dd></div>
              <div><dt>種別</dt><dd>{session.datasetKind}</dd></div>
              <div><dt>状態</dt><dd>{session.status}</dd></div>
              <div><dt>ラン</dt><dd>{session.runs.length}</dd></div>
              <div><dt>SHA</dt><dd>{session.sourceRevision.slice(0, 12)}</dd></div>
              <div><dt>画面</dt><dd>{session.viewport.width}×{session.viewport.height}</dd></div>
              <div><dt>言語</dt><dd>{session.language}</dd></div>
            </dl>
            {session.runs.map((run) => (
              <article className="playtest-run" key={`${run.evidence.runOrdinal}-${run.recordedAt}`}>
                <strong>RUN {run.evidence.runOrdinal}{" // "}{run.evidence.outcome.toUpperCase()}</strong>
                <span>初撃破 {run.evidence.firstKillSeconds ?? "—"}秒</span>
                <span>能動 {run.evidence.activeSeconds}秒</span>
                <span>90秒 {run.evidence.active90Reached ? "到達" : "未到達"}</span>
                <span>結果から再挑戦 {getPlaytestReplayDelaySeconds(run) === null ? "なし" : `${getPlaytestReplayDelaySeconds(run)?.toFixed(3)}秒`}</span>
              </article>
            ))}
            <div className="playtest-actions">
              {session.status === "active" && <a className="playtest-link-button" href={`/#playtest=${session.sessionId}`} onClick={goToGame}>ゲームへ戻る</a>}
              {session.status === "active" && session.currentRunStartedAt && <button type="button" onClick={captureInterruptedRun}>中断ランを未完了で記録</button>}
              {session.status === "active" && (!session.gameReadyAt || session.currentRunStartedAt) && <button type="button" onClick={closeTechnicalIncident}>{session.gameReadyAt ? "復元不能ランを技術事故として閉じる" : "表示前の技術事故として閉じる"}</button>}
              <button type="button" onClick={copyJson}>JSONをコピー</button>
              <button type="button" onClick={downloadJson}>JSONを保存</button>
            </div>
          </section>

          <section className="playtest-panel" aria-labelledby="playtest-environment-title">
            <h2 id="playtest-environment-title">実施条件</h2>
            <div className="playtest-grid">
              <label className="playtest-field"><span>観察者コード</span><input maxLength={80} value={observation.observerCode} onChange={(event) => updateObservation("observerCode", event.target.value)} disabled={disabled} /></label>
              <ChoiceField label="同意確認" value={observation.consentConfirmed} onChange={(value) => updateObservation("consentConfirmed", value)} disabled={disabled} />
              <ChoiceField label="本作を初めて見る" value={observation.firstTimeConfirmed} onChange={(value) => updateObservation("firstTimeConfirmed", value)} disabled={disabled} />
              <ChoiceField label="開発関係者ではない" value={observation.externalTesterConfirmed} onChange={(value) => updateObservation("externalTesterConfirmed", value)} disabled={disabled} />
              <ChoiceField label="操作補助を行った" value={observation.assistanceProvided} onChange={(value) => updateObservation("assistanceProvided", value)} disabled={disabled} />
              <label className="playtest-field"><span>端末</span><input maxLength={120} value={observation.device} onChange={(event) => updateObservation("device", event.target.value)} disabled={disabled} /></label>
              <label className="playtest-field"><span>OS</span><input maxLength={120} value={observation.os} onChange={(event) => updateObservation("os", event.target.value)} disabled={disabled} /></label>
              <label className="playtest-field"><span>ブラウザ</span><input maxLength={120} value={observation.browser} onChange={(event) => updateObservation("browser", event.target.value)} disabled={disabled} /></label>
              <label className="playtest-field"><span>入力方法</span><input maxLength={120} value={observation.inputMethod} onChange={(event) => updateObservation("inputMethod", event.target.value)} disabled={disabled} /></label>
              <label className="playtest-field"><span>音声状態</span><input maxLength={120} value={observation.audioMode} onChange={(event) => updateObservation("audioMode", event.target.value)} disabled={disabled} /></label>
            </div>
            <label className="playtest-field wide"><span>類似ゲーム経験</span><textarea maxLength={1000} placeholder="なし／不明も明記" value={observation.similarGameExperience} onChange={(event) => updateObservation("similarGameExperience", event.target.value)} disabled={disabled} /></label>
          </section>

          <section className="playtest-panel" aria-labelledby="playtest-observation-title">
            <h2 id="playtest-observation-title">無言観察</h2>
            <label className="playtest-field wide"><span>最初に見た場所</span><textarea maxLength={1000} placeholder="画面上の位置・要素を事実として記録" value={observation.firstLookedAt} onChange={(event) => updateObservation("firstLookedAt", event.target.value)} disabled={disabled} /></label>
            <label className="playtest-field wide"><span>迷い・連打・説明文の長時間読解</span><textarea maxLength={1000} placeholder="なければ「なし」" value={observation.behaviorNotes} onChange={(event) => updateObservation("behaviorNotes", event.target.value)} disabled={disabled} /></label>
            <div className="playtest-grid">
              <ChoiceField label="5秒以内にリレーを特定" value={observation.fiveSecondRelayFound} onChange={(value) => updateObservation("fiveSecondRelayFound", value)} disabled={disabled} />
              <ChoiceField label="基本連鎖を説明できた" value={observation.chainExplained} onChange={(value) => updateObservation("chainExplained", value)} disabled={disabled} />
              <ChoiceField label="W2共鳴を説明できた" value={observation.resonanceExplained} onChange={(value) => updateObservation("resonanceExplained", value)} disabled={disabled} />
              <ChoiceField label="再挑戦前に促した" value={observation.replayWasPrompted} onChange={(value) => updateObservation("replayWasPrompted", value)} disabled={disabled} />
              <ChoiceField label="重要UI妨害あり" value={observation.criticalUiIssue} onChange={(value) => updateObservation("criticalUiIssue", value)} disabled={disabled} />
              <ChoiceField label="バックグラウンド進行あり" value={observation.backgroundProgressIssue} onChange={(value) => updateObservation("backgroundProgressIssue", value)} disabled={disabled} />
              <label className="playtest-field"><span>クラッシュ／進行不能件数</span><input type="number" min="0" max="100" step="1" value={observation.crashOrProgressBlockers ?? ""} onChange={(event) => updateObservation("crashOrProgressBlockers", event.target.value === "" ? null : Math.max(0, Math.min(100, Math.floor(Number(event.target.value) || 0))))} disabled={disabled} /></label>
            </div>
            <h3>重要情報の個別識別</h3>
            <div className="playtest-grid">
              {READABILITY_LABELS.map(([key, label]) => (
                <ChoiceField key={key} label={label} value={observation.readabilityChecks[key]} onChange={(value) => updateChoiceGroup("readabilityChecks", key, value)} disabled={disabled} />
              ))}
            </div>
            {session.runs.length > 0 && !silhouetteScoringVisible && (
              <div className="playtest-silhouette-check">
                <p>終了後、名前や色を見せずにこの無彩色カードだけをテスターへ提示します。回答後に下の項目を観察者が採点します。</p>
                <div className="playtest-silhouette-board" aria-hidden="true">
                  {(["extract", "fabricate", "defend"] as const).map((sector, index) => (
                    <figure key={sector}>
                      <MachineGlyph sector={sector} state="idle" />
                      <figcaption>{String.fromCharCode(65 + index)}</figcaption>
                    </figure>
                  ))}
                </div>
                <div className="playtest-silhouette-board enemies" aria-hidden="true">
                  {(["rusher", "sapper", "jammer", "warden"] as const).map((kind, index) => (
                    <figure key={kind}>
                      <EnemyGlyph kind={kind} />
                      <figcaption>{index + 1}</figcaption>
                    </figure>
                  ))}
                </div>
                <button
                  type="button"
                  className="playtest-reveal-scoring"
                  onClick={() => {
                    if (window.confirm("テスターの回答が終わり、画面を観察者へ戻しましたか？ 正解名を表示するとカードへは戻せません。")) {
                      setSilhouetteScoringVisible(true);
                    }
                  }}
                >回答を確定して採点欄を表示</button>
              </div>
            )}
            {(session.runs.length === 0 || silhouetteScoringVisible) && (
              <div className="playtest-silhouette-scoring">
                {session.runs.length > 0 && <p className="playtest-note">テスター提示カードは閉じました。ここからは観察者だけが採点します。</p>}
                <h3>設備シルエット（A〜Cの回答を採点）</h3>
                <div className="playtest-grid">
                  {FACILITY_LABELS.map(([key, label]) => (
                    <ChoiceField key={key} label={label} value={observation.facilitySilhouettes[key]} onChange={(value) => updateChoiceGroup("facilitySilhouettes", key, value)} disabled={disabled} />
                  ))}
                </div>
                <h3>終了後の敵シルエット（1〜4の回答を採点）</h3>
                <div className="playtest-grid">
                  {ENEMY_LABELS.map(([key, label]) => (
                    <ChoiceField key={key} label={label} value={observation.enemySilhouettes[key]} onChange={(value) => updateChoiceGroup("enemySilhouettes", key, value)} disabled={disabled} />
                  ))}
                </div>
              </div>
            )}
            <label className="playtest-field wide"><span>誤って操作した対象</span><textarea maxLength={1000} placeholder="誤操作なしの場合は「なし」" value={observation.wrongTarget} onChange={(event) => updateObservation("wrongTarget", event.target.value)} disabled={disabled} /></label>
            <label className="playtest-field wide">
              <span>手順逸脱・補助内容（逸脱なしは空欄）</span>
              <textarea
                maxLength={1000}
                placeholder="「なし」は入力しないでください。一度保存した内容はこのセッションから削除できません。"
                value={observation.protocolDeviation}
                onChange={(event) => updateObservation("protocolDeviation", event.target.value)}
                disabled={disabled}
              />
            </label>
          </section>

          <section className="playtest-panel" aria-labelledby="playtest-timing-title">
            <h2 id="playtest-timing-title">観察者の壁時計（開始からの秒）</h2>
            <p className="playtest-note">各項目は秒数、または実際に発生しなかった場合の「未到達」を必ず記録します。空欄は観察漏れとして正式集計を止めます。</p>
            <div className="playtest-grid compact">
              {TIMING_LABELS.map(([key, label]) => (
                <TimingField
                  key={key}
                  label={label}
                  value={observation.wallTimings[key]}
                  onChange={(value) => {
                    dirtyRef.current = true;
                    setObservation((current) => current ? {
                      ...current,
                      wallTimings: { ...current.wallTimings, [key]: value },
                    } : current);
                  }}
                  disabled={disabled}
                />
              ))}
            </div>
          </section>

          <section className="playtest-panel" aria-labelledby="playtest-interview-title">
            <h2 id="playtest-interview-title">終了後の回答原文</h2>
            {QUESTION_LABELS.map((label, index) => (
              <label className="playtest-field wide" key={label}>
                <span>{index + 1}. {label}</span>
                <textarea
                  maxLength={2000}
                  value={observation.answers[index]}
                  onChange={(event) => {
                    dirtyRef.current = true;
                    setObservation((current) => {
                      if (!current) return current;
                      const answers = [...current.answers] as PlaytestObservation["answers"];
                      answers[index] = event.target.value;
                      return { ...current, answers };
                    });
                  }}
                  disabled={disabled}
                />
              </label>
            ))}
            <label className="playtest-field wide"><span>その他の記録</span><textarea maxLength={2000} value={observation.notes} onChange={(event) => updateObservation("notes", event.target.value)} disabled={disabled} /></label>
            <div className="playtest-actions">
              {session.status === "active" && <button type="button" onClick={persistObservation}>観察記録を保存</button>}
              {session.status === "active" && <button type="button" className="playtest-primary" onClick={finishSession}>セッションを確定</button>}
              <button type="button" className="playtest-danger" onClick={discard}>端末内の現在セッションを削除</button>
            </div>
          </section>
        </>
      )}

      <p className="playtest-status" role="status" aria-live="polite">{message}</p>
      <footer className="playtest-console-footer">
        <a href={session?.status === "active" ? `/#playtest=${session.sessionId}` : "/"} onClick={goToGame}>ゲームへ</a>
        <a href="/privacy" target="_blank" rel="noreferrer">計測とプライバシー</a>
        <a href={`https://github.com/2hg7trp7rv-design/project-tri-relay/blob/${session?.datasetKind === "official" ? session.sourceRevision : "main"}/docs/V04_PLAYTEST_PROTOCOL.md`} target="_blank" rel="noreferrer">実施手順</a>
      </footer>
    </main>
  );
}
