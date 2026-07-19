import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Observability from "./Observability";
import "./globals.css";
import "./game/production.css";

const isVercelBuild = process.env.VERCEL === "1";
const sourceRevisionCandidate = process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown";
const sourceRevision = /^[0-9a-f]{40}$/i.test(sourceRevisionCandidate)
  ? sourceRevisionCandidate
  : "unknown";
const immutableDeployment = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "unknown";

const geistSans = localFont({
  src: "./fonts/geist-sans-latin-v01.woff2",
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin-v01.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});

function resolveMetadataBase(): URL {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const candidate =
    configuredOrigin ?? (vercelHost ? `https://${vercelHost}` : null);

  if (!candidate) return new URL("http://localhost:3000");

  try {
    return new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "TRI RELAY: LAST SHIFT",
  description:
    "Route one dying power grid through extraction, fabrication, and defense in a single-screen roguelite survival game.",
  openGraph: {
    title: "TRI RELAY: LAST SHIFT",
    description:
      "Route the last power through extraction, fabrication, and defense. Hold the city for six waves.",
    type: "website",
    locale: "ja_JP",
    images: [
      {
        url: "/game/marketing/promo-og-l-v02.webp",
        width: 1200,
        height: 630,
        alt: "TRI RELAY: LAST SHIFT — industrial last-city key art",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TRI RELAY: LAST SHIFT",
    description:
      "Extract ore, fabricate ammunition, and defend the last city with one rotating relay.",
    images: ["/game/marketing/promo-og-l-v02.webp"],
  },
  other: isVercelBuild ? {} : { "codex-preview": "development" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/game/icons/apple-touch-icon-180-v03.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#05070a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <meta name="tri-relay-release" content="0.4.1" />
        <meta name="tri-relay-source-revision" content={sourceRevision} />
        <meta name="tri-relay-immutable-deployment" content={immutableDeployment} />
        <meta name="tri-relay-deployment-environment" content={process.env.VERCEL_ENV ?? (isVercelBuild ? "unknown" : "local")} />
        {isVercelBuild && (
          <meta name="tri-relay-observability" content="vercel" />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        {isVercelBuild && <Observability />}
      </body>
    </html>
  );
}
