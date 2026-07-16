"use client";

import { useEffect } from "react";
import { reportClientError } from "./game/telemetry";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("TRI RELAY global failure", error);
    reportClientError({ boundary: "global", name: error.name, digestPresent: Boolean(error.digest) });
  }, [error]);

  return (
    <html lang="ja">
      <body>
        <main className="fatal-screen">
          <p>SYSTEM RECOVERY</p>
          <h1>ゲームを再起動してください</h1>
          <button type="button" onClick={reset}>再起動</button>
        </main>
      </body>
    </html>
  );
}
