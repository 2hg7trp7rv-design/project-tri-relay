import type { NextConfig } from "next";
import { securityHeaders } from "./config/http-policy.mjs";

const nextConfig: NextConfig = {
  // Native Next builds must not type-check the Cloudflare Worker/Sites entry
  // points. Those remain covered by the separate Vinext build.
  typescript: {
    tsconfigPath: "tsconfig.next.json",
  },
  async headers() {
    return [
      { source: "/:path*", headers: [...securityHeaders] },
      {
        source: "/game/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
