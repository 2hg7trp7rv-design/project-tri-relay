type TelemetryValue = string | number | boolean;

const EVENT_FIELDS: Record<string, ReadonlySet<string>> = {
  run_started: new Set(["guided", "source"]),
  upgrade_selected: new Set(["wave", "branch"]),
  checkpoint_restored: new Set(["wave", "phase"]),
  overdrive_used: new Set(["wave", "sector"]),
  wave_cleared: new Set(["wave", "integrity"]),
  tutorial_completed: new Set(["source", "run_ordinal", "wave", "active_seconds", "wall_seconds", "pulses", "rotations"]),
  first_kill: new Set(["source", "run_ordinal", "wave", "active_seconds", "wall_seconds", "rotations"]),
  active_90s_reached: new Set(["source", "run_ordinal", "wave", "active_seconds", "wall_seconds", "rotations", "productive_rate"]),
  run_completed: new Set([
    "outcome", "wave", "source", "run_ordinal", "guided", "active_seconds", "wall_seconds",
    "rotations", "rotations_per_second", "first_kill_seconds", "first_kill_recorded",
    "tutorial_completed", "active_90_reached", "productive_rate", "overloads", "overdrives", "build",
  ]),
  runtime_error: new Set(["digest_present"]),
};

const ENUM_VALUES: Record<string, ReadonlySet<string>> = {
  source: new Set(["opening", "start", "replay", "checkpoint"]),
  branch: new Set(["extract", "fabricate", "defend", "unknown"]),
  sector: new Set(["extract", "fabricate", "defend"]),
  build: new Set(["extract", "fabricate", "defend", "mixed"]),
  phase: new Set(["playing", "intermission", "upgrade", "paused"]),
  outcome: new Set(["won", "lost", "incomplete"]),
};

function sanitizeProperties(name: string, properties: Record<string, TelemetryValue>) {
  const allowed = EVENT_FIELDS[name];
  if (!allowed) return null;
  const safe: Record<string, TelemetryValue> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!allowed.has(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) safe[key] = value;
    else if (typeof value === "boolean") safe[key] = value;
    else if (typeof value === "string" && ENUM_VALUES[key]?.has(value)) safe[key] = value;
  }
  return safe;
}

function isPlaytestContext() {
  return typeof window !== "undefined"
    && (window.location.pathname === "/playtest"
      || /^#playtest=[a-zA-Z0-9-]{16,80}$/.test(window.location.hash)
      || document.documentElement.dataset.playtestSession === "active");
}

/**
 * Sends coarse, non-identifying product events only when the Vercel build has
 * installed its observability marker. The game remains fully offline-capable
 * and never delays play while analytics loads.
 */
export function trackGameEvent(
  name: string,
  properties: Record<string, TelemetryValue> = {},
) {
  if (typeof document === "undefined") return;
  if (isPlaytestContext()) return;
  if (!document.querySelector('meta[name="tri-relay-observability"][content="vercel"]')) return;
  const safeProperties = sanitizeProperties(name, properties);
  if (!safeProperties) return;

  void import("@vercel/analytics")
    .then(({ track }) => track(name, safeProperties))
    .catch(() => {
      // Telemetry is deliberately best-effort and must never interrupt play.
    });
}

export function reportClientError(details: {
  boundary: "route" | "global";
  name: string;
  digestPresent: boolean;
}) {
  if (typeof window === "undefined") return;
  if (isPlaytestContext()) return;
  const payload = JSON.stringify({
    boundary: details.boundary,
    name: details.name.slice(0, 80),
    digest_present: details.digestPresent,
    path: window.location.pathname.slice(0, 160),
  });
  if (payload.length > 1_024) return;
  void fetch("/api/client-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true,
    credentials: "omit",
  }).catch(() => {
    // Error reporting is best-effort; recovery must remain available offline.
  });
}
