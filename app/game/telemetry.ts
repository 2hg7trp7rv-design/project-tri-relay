type TelemetryValue = string | number | boolean;

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
  if (!document.querySelector('meta[name="tri-relay-observability"][content="vercel"]')) return;

  void import("@vercel/analytics")
    .then(({ track }) => track(name, properties))
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
    credentials: "same-origin",
  }).catch(() => {
    // Error reporting is best-effort; recovery must remain available offline.
  });
}
