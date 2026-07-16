import { useId, type CSSProperties } from "react";
import { SECTOR_COLORS, type EnemyKind, type Sector } from "./model";

export type VisualState = "idle" | "active" | "success" | "damaged";

interface VisualProps {
  className?: string;
  label?: string;
}

function classes(...values: Array<string | false | undefined>) {
  return values.filter(Boolean).join(" ");
}

function accessibility(label?: string) {
  return label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
}

export interface CityGateProps extends VisualProps {
  integrity: number;
  maxIntegrity?: number;
  damaged?: boolean;
}

export interface WorldStateOverlayProps extends VisualProps {
  integrity: number;
  maxIntegrity: number;
  enemyCount: number;
  nearestProgress: number;
}

/**
 * Keeps the static city plate honest: city light and invasion pressure are
 * derived from the live simulation, while individual enemies remain glyphs.
 */
export function WorldStateOverlay({
  integrity,
  maxIntegrity,
  enemyCount,
  nearestProgress,
  className,
  label,
}: WorldStateOverlayProps) {
  const id = useId().replace(/:/g, "");
  const cityDimmerId = `${id}-world-city-dimmer`;
  const threatFogId = `${id}-world-threat-fog`;
  const integrityRatio = Math.max(0, Math.min(1, integrity / Math.max(1, maxIntegrity)));
  const lightCount = Math.max(1, Math.min(8, Math.round(maxIntegrity)));
  const liveSegments = Math.max(
    0,
    Math.min(lightCount, Math.ceil(integrityRatio * lightCount)),
  );
  const cityState = integrityRatio <= 0.16
    ? "dark"
    : integrityRatio <= 0.42
      ? "critical"
      : integrityRatio <= 0.7
        ? "strained"
        : "stable";
  const pressureState = enemyCount === 0
    ? "none"
    : nearestProgress >= 0.75
      ? "critical"
      : nearestProgress >= 0.45
        ? "warning"
        : "approach";

  return (
    <svg
      className={classes(
        "production-visual world-state-overlay",
        `is-${cityState}`,
        `pressure-${pressureState}`,
        className,
      )}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      focusable="false"
      data-city-state={cityState}
      data-pressure-state={pressureState}
      data-live-segments={liveSegments}
      {...accessibility(label)}
    >
      <defs>
        <linearGradient id={cityDimmerId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#02070b" stopOpacity=".9" />
          <stop offset=".44" stopColor="#02070b" stopOpacity=".1" />
          <stop offset="1" stopColor="#02070b" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={threatFogId} cx="100%" cy="0" r="85%">
          <stop offset="0" stopColor="#ff334f" stopOpacity=".62" />
          <stop offset=".52" stopColor="#7b1525" stopOpacity=".24" />
          <stop offset="1" stopColor="#25060c" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect className="world-state-overlay__city-dimmer" x="0" y="0" width="48" height="100" fill={`url(#${cityDimmerId})`} />
      <path className="world-state-overlay__threat-fog" d="M58 0h42v58c-12-3-22-10-28-18C66 31 62 19 58 0Z" fill={`url(#${threatFogId})`} />
      <path className="world-state-overlay__danger-line" d="M64 18c12 2 22 9 34 23" fill="none" stroke="currentColor" strokeWidth=".45" strokeDasharray="2.5 2" />

      <g className="world-state-overlay__city-lights" aria-hidden="true">
        {Array.from({ length: lightCount }, (_, index) => (
          <circle
            key={index}
            className={classes(
              "world-state-overlay__city-light",
              index < liveSegments ? "is-live" : "is-lost",
            )}
            cx={8 + index * 4.2}
            cy={22 + (index % 2) * 4.5}
            r=".75"
          />
        ))}
      </g>

      <g className="world-state-overlay__warning-lights" aria-hidden="true">
        <circle cx="79" cy="18" r=".65" />
        <circle cx="86" cy="23" r=".65" />
        <circle cx="93" cy="28" r=".65" />
      </g>
    </svg>
  );
}

/** City gate whose integrity lamps match the current maximum integrity. */
export function CityGate({
  integrity,
  maxIntegrity = 6,
  damaged = false,
  className,
  label,
}: CityGateProps) {
  const segmentCount = Math.max(1, Math.min(12, Math.round(maxIntegrity)));
  const liveSegments = Math.max(
    0,
    Math.min(segmentCount, Math.ceil((integrity / Math.max(1, maxIntegrity)) * segmentCount)),
  );
  const segmentWidth = 9;
  const segmentGap = 4;
  const segmentStart = (160 - (segmentCount * segmentWidth + (segmentCount - 1) * segmentGap)) / 2;

  return (
    <svg
      className={classes("production-visual city-gate", damaged && "is-damaged", className)}
      viewBox="0 0 160 120"
      fill="none"
      focusable="false"
      data-integrity={liveSegments}
      {...accessibility(label)}
    >
      <g className="city-gate__silhouette" stroke="currentColor" strokeWidth="3">
        <path className="city-gate__wall" d="M8 103V49h18V34h22V19h64v15h22v15h18v54" />
        <path className="city-gate__base" d="M4 103h152" />
        <path className="city-gate__buttress city-gate__buttress--left" d="M15 103 29 69h15v34" />
        <path className="city-gate__buttress city-gate__buttress--right" d="m145 103-14-34h-15v34" />
      </g>

      <g className="city-gate__core">
        <path
          className="city-gate__core-frame"
          d="M55 103V51l25-18 25 18v52"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path
          className="city-gate__core-light"
          d="m80 48 12 9v30L80 96 68 87V57Z"
          fill="currentColor"
          opacity=".22"
        />
        <path className="city-gate__core-pulse" d="M80 53v37" stroke="currentColor" strokeWidth="6" />
      </g>

      <g className="city-gate__integrity">
        {Array.from({ length: segmentCount }, (_, index) => {
          const live = index < liveSegments;
          return (
            <rect
              key={index}
              className={classes(
                "city-gate__integrity-segment",
                live ? "is-live" : "is-lost",
              )}
              x={segmentStart + index * (segmentWidth + segmentGap)}
              y="8"
              width="9"
              height="5"
              rx="1.5"
              fill={live ? "currentColor" : "#172229"}
              opacity={live ? 1 : 0.55}
            />
          );
        })}
      </g>
    </svg>
  );
}

export interface EnemyGlyphProps extends VisualProps {
  kind: EnemyKind;
  damaged?: boolean;
  active?: boolean;
}

/** Enemy silhouettes remain distinct without relying on colour. */
export function EnemyGlyph({
  kind,
  damaged = false,
  active = true,
  className,
  label,
}: EnemyGlyphProps) {
  return (
    <svg
      className={classes(
        "production-visual enemy-glyph",
        `enemy-glyph--${kind}`,
        active && "is-active",
        damaged && "is-damaged",
        className,
      )}
      viewBox="0 0 120 120"
      fill="none"
      focusable="false"
      data-enemy={kind}
      {...accessibility(label)}
    >
      {kind === "rusher" && (
        <g className="enemy-glyph__body enemy-glyph__body--rusher">
          <path className="enemy-glyph__trail" d="M10 60h26M19 45l20 8M19 75l20-8" stroke="currentColor" strokeWidth="3" />
          <path className="enemy-glyph__shell" d="m36 60 22-28 46 28-46 28Z" stroke="currentColor" strokeWidth="4" />
          <path className="enemy-glyph__blade" d="m62 43 35 17-35 17 10-17Z" fill="currentColor" opacity=".3" />
          <circle className="enemy-glyph__core" cx="57" cy="60" r="7" fill="currentColor" />
        </g>
      )}

      {kind === "sapper" && (
        <g className="enemy-glyph__body enemy-glyph__body--sapper" stroke="currentColor">
          <path className="enemy-glyph__legs" d="m26 34 14 14M94 34 80 48M22 77l18-8M98 77l-18-8" strokeWidth="5" />
          <path className="enemy-glyph__shell" d="m37 29 45 4 19 28-22 31-44-4-16-31Z" strokeWidth="4" />
          <circle className="enemy-glyph__charge" cx="59" cy="61" r="20" strokeWidth="3" />
          <path className="enemy-glyph__fuse" d="m59 41 8 20-8 20-8-20Z" fill="currentColor" strokeWidth="2" />
        </g>
      )}

      {kind === "jammer" && (
        <g className="enemy-glyph__body enemy-glyph__body--jammer" stroke="currentColor">
          <path className="enemy-glyph__antennae" d="M60 8v22M18 26l20 15M102 26 82 41M10 67h23M110 67H87M27 105l16-20M93 105 77 85" strokeWidth="3" />
          <path className="enemy-glyph__signal enemy-glyph__signal--outer" d="M35 34a37 37 0 0 0 0 53M85 34a37 37 0 0 1 0 53" strokeWidth="3" />
          <path className="enemy-glyph__signal enemy-glyph__signal--inner" d="M44 43a25 25 0 0 0 0 35M76 43a25 25 0 0 1 0 35" strokeWidth="4" />
          <path className="enemy-glyph__core" d="m60 35 10 20 20 10-20 10-10 20-10-20-20-10 20-10Z" fill="currentColor" strokeWidth="2" />
        </g>
      )}

      {kind === "warden" && (
        <g className="enemy-glyph__body enemy-glyph__body--warden" stroke="currentColor">
          <circle className="enemy-glyph__ring enemy-glyph__ring--outer" cx="60" cy="60" r="50" strokeWidth="6" strokeDasharray="24 8" />
          <circle className="enemy-glyph__ring enemy-glyph__ring--inner" cx="60" cy="60" r="34" strokeWidth="3" />
          <path className="enemy-glyph__plates" d="M21 60 39 42h42l18 18-18 18H39Z" fill="currentColor" opacity=".2" strokeWidth="4" />
          <path className="enemy-glyph__eye" d="M36 60s10-15 24-15 24 15 24 15-10 15-24 15-24-15-24-15Z" strokeWidth="4" />
          <circle className="enemy-glyph__core" cx="60" cy="60" r="9" fill="currentColor" />
        </g>
      )}
    </svg>
  );
}

export interface MachineGlyphProps extends VisualProps {
  sector: Sector;
  state?: VisualState;
}

/** A single typed entry point for the three production machines. */
export function MachineGlyph({
  sector,
  state = "idle",
  className,
  label,
}: MachineGlyphProps) {
  const style = { color: SECTOR_COLORS[sector] } as CSSProperties;

  return (
    <svg
      className={classes(
        "production-visual machine-glyph",
        `machine-glyph--${sector}`,
        `is-${state}`,
        className,
      )}
      viewBox="0 0 160 130"
      fill="none"
      focusable="false"
      data-sector={sector}
      data-state={state}
      style={style}
      {...accessibility(label)}
    >
      {sector === "extract" && (
        <g className="machine-glyph__body machine-glyph__body--extract" stroke="currentColor">
          <path className="machine-glyph__frame" d="m29 27 35-20h42l35 20v66l-35 20H64L29 93Z" strokeWidth="4" />
          <path className="machine-glyph__housing" d="M43 43h53v39H43Z" fill="currentColor" opacity=".14" strokeWidth="3" />
          <g className="machine-glyph__moving machine-glyph__drill">
            <path className="machine-glyph__drill-shaft" d="M79 62h45" strokeWidth="10" />
            <path className="machine-glyph__drill-bit" d="m117 42 34 20-34 20 9-20Z" fill="currentColor" strokeWidth="3" />
            <path className="machine-glyph__drill-flute" d="m118 49 22 13-22 13M126 53l-7 19" stroke="#081014" strokeWidth="3" />
          </g>
          <path className="machine-glyph__ore-chute" d="M48 83v21h25" strokeWidth="5" />
        </g>
      )}

      {sector === "fabricate" && (
        <g className="machine-glyph__body machine-glyph__body--fabricate" stroke="currentColor">
          <path className="machine-glyph__frame" d="M23 113V17h114v96M23 104h114" strokeWidth="5" />
          <path className="machine-glyph__rail" d="M43 30v63M117 30v63" strokeWidth="3" />
          <g className="machine-glyph__moving machine-glyph__press-head">
            <rect className="machine-glyph__press-cap" x="49" y="23" width="62" height="19" rx="3" fill="currentColor" opacity=".3" strokeWidth="3" />
            <path className="machine-glyph__piston" d="M80 42v25" strokeWidth="13" />
            <path className="machine-glyph__press-plate" d="M48 67h64v15H48Z" fill="currentColor" strokeWidth="3" />
          </g>
          <path className="machine-glyph__material" d="M57 88h46v16H57Z" fill="currentColor" opacity=".18" strokeWidth="3" />
          <path className="machine-glyph__layers" d="M53 112h54M60 119h40" strokeWidth="3" />
        </g>
      )}

      {sector === "defend" && (
        <g className="machine-glyph__body machine-glyph__body--defend" stroke="currentColor">
          <path className="machine-glyph__shield" d="M23 27 67 12l44 15v34c0 26-18 45-44 57C41 106 23 87 23 61Z" fill="currentColor" opacity=".12" strokeWidth="4" />
          <g className="machine-glyph__moving machine-glyph__cannon">
            <circle className="machine-glyph__cannon-pivot" cx="69" cy="64" r="19" fill="currentColor" opacity=".24" strokeWidth="4" />
            <path className="machine-glyph__cannon-barrel" d="m80 54 48-25 8 15-49 26Z" fill="currentColor" strokeWidth="3" />
            <path className="machine-glyph__cannon-rail" d="m93 51 33-17" stroke="#081014" strokeWidth="3" />
          </g>
          <path className="machine-glyph__mount" d="M52 83h34l12 30H40Z" strokeWidth="5" />
        </g>
      )}
    </svg>
  );
}

type SpecificMachineProps = Omit<MachineGlyphProps, "sector">;

export function ExtractMachineGlyph(props: SpecificMachineProps) {
  return <MachineGlyph {...props} sector="extract" />;
}

export function FabricateMachineGlyph(props: SpecificMachineProps) {
  return <MachineGlyph {...props} sector="fabricate" />;
}

export function DefendMachineGlyph(props: SpecificMachineProps) {
  return <MachineGlyph {...props} sector="defend" />;
}

export interface RelayDialProps extends VisualProps {
  sector: Sector;
  active?: boolean;
  pulseProgress?: number;
}

const RELAY_ANGLE: Record<Sector, number> = {
  extract: 0,
  fabricate: 120,
  defend: 240,
};

/** Three-position relay presentation. Wrap it in a semantic button for input. */
export function RelayDial({
  sector,
  active = true,
  pulseProgress = 0,
  className,
  label,
}: RelayDialProps) {
  const progress = Math.max(0, Math.min(1, pulseProgress));
  const circumference = 289;

  return (
    <svg
      className={classes("production-visual relay-dial", active && "is-active", className)}
      viewBox="0 0 120 120"
      fill="none"
      focusable="false"
      data-sector={sector}
      style={{ color: SECTOR_COLORS[sector] }}
      {...accessibility(label)}
    >
      <circle className="relay-dial__bezel" cx="60" cy="60" r="53" stroke="currentColor" strokeWidth="3" opacity=".45" />
      <circle className="relay-dial__track" cx="60" cy="60" r="46" stroke="#243039" strokeWidth="4" />
      <circle
        className="relay-dial__pulse"
        cx="60"
        cy="60"
        r="46"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - progress)}
        transform="rotate(-90 60 60)"
      />

      <g className="relay-dial__conduits" stroke="#53616a" strokeWidth="3">
        <path d="M60 60V18" />
        <path d="m60 60 36 21" />
        <path d="m60 60-36 21" />
      </g>

      <g className={classes("relay-dial__terminal", sector === "extract" && "is-active")} data-sector="extract">
        <path d="m60 8 8 5v10l-8 5-8-5V13Z" fill={sector === "extract" ? "#ffc857" : "#263138"} />
      </g>
      <g className={classes("relay-dial__terminal", sector === "fabricate" && "is-active")} data-sector="fabricate">
        <rect x="91" y="75" width="18" height="16" rx="2" fill={sector === "fabricate" ? "#b99aff" : "#263138"} />
        <path d="M94 79h12M94 83h12M94 87h12" stroke="#081014" strokeWidth="1.5" />
      </g>
      <g className={classes("relay-dial__terminal", sector === "defend" && "is-active")} data-sector="defend">
        <path d="M11 75 25 71l14 4v10c0 8-6 13-14 17-8-4-14-9-14-17Z" fill={sector === "defend" ? "#4adff3" : "#263138"} />
      </g>

      <g
        className="relay-dial__moving relay-dial__pointer"
        transform={`rotate(${RELAY_ANGLE[sector]} 60 60)`}
      >
        <path className="relay-dial__pointer-arm" d="M60 60V22" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
        <path className="relay-dial__pointer-highlight" d="M60 57V26" stroke="#eaffff" strokeWidth="3" strokeLinecap="round" opacity=".75" />
      </g>
      <circle className="relay-dial__hub" cx="60" cy="60" r="15" fill="#071017" stroke="currentColor" strokeWidth="3" />
      <path className="relay-dial__hub-mark" d="m60 51 8 14H52Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
