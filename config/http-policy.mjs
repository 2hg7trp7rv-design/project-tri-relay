export const securityHeaders = Object.freeze([
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
]);

export function cacheControlForPath(pathname) {
  if (pathname.startsWith("/game/") || pathname.startsWith("/_next/static/")) {
    return "public, max-age=31536000, immutable";
  }
  return null;
}

export function applyHttpPolicy(response, pathname) {
  const headers = new Headers(response.headers);
  for (const { key, value } of securityHeaders) headers.set(key, value);
  const cacheControl = cacheControlForPath(pathname);
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  else if ((headers.get("content-type") ?? "").includes("text/html")) {
    headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
