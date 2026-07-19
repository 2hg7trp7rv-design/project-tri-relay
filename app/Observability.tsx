"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { useEffect, useState } from "react";

function isLocalPlaytestContext() {
  return window.location.pathname === "/playtest"
    || /^#playtest=[a-zA-Z0-9-]{16,80}$/.test(window.location.hash)
    || document.documentElement.dataset.playtestSession === "active";
}

export default function Observability() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const update = () => setEnabled(!isLocalPlaytestContext());
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  if (!enabled) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
