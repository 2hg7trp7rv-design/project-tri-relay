import type { Metadata } from "next";
import PlaytestConsole from "./PlaytestConsole";

export const metadata: Metadata = {
  title: "TRI RELAY | Playtest Console",
  robots: { index: false, follow: false, nocache: true },
};

export default function PlaytestPage() {
  return <PlaytestConsole />;
}
