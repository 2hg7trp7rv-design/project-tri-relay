import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TRI RELAY: LAST SHIFT",
    short_name: "TRI RELAY",
    description: "Route the last power grid through extraction, fabrication, and defense.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "fullscreen",
    orientation: "portrait-primary",
    background_color: "#020507",
    theme_color: "#05070a",
    icons: [
      {
        src: "/game/icons/icon-192-v03.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/game/icons/icon-512-v03.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/game/icons/icon-maskable-512-v03.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
