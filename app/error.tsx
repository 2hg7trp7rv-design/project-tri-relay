"use client";

import { useEffect } from "react";
import { reportClientError, trackGameEvent } from "./game/telemetry";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("TRI RELAY runtime failure", error);
    trackGameEvent("runtime_error", { digest_present: Boolean(error.digest) });
    reportClientError({ boundary: "route", name: error.name, digestPresent: Boolean(error.digest) });
  }, [error]);

  return (
    <main className="fatal-screen">
      <p className="eyebrow">GRID RECOVERY</p>
      <h1>送電系統を再起動します</h1>
      <p>進行中のシフトは端末内のチェックポイントから復元されます。</p>
      <button type="button" className="primary-action compact" onClick={reset}>
        再起動
      </button>
    </main>
  );
}
