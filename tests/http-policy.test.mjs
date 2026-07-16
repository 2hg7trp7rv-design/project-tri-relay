import assert from "node:assert/strict";
import test from "node:test";
import { applyHttpPolicy, cacheControlForPath, securityHeaders } from "../config/http-policy.mjs";

test("versioned runtime assets receive immutable cache policy", () => {
  assert.equal(cacheControlForPath("/game/world/world-city-p-v03.webp"), "public, max-age=31536000, immutable");
  assert.equal(cacheControlForPath("/_next/static/chunks/app.js"), "public, max-age=31536000, immutable");
  assert.equal(cacheControlForPath("/"), null);
  assert.equal(cacheControlForPath("/manifest.webmanifest"), null);
});

test("Sites response wrapper applies shared security headers without caching HTML", async () => {
  const response = applyHttpPolicy(
    new Response("<html></html>", { headers: { "content-type": "text/html; charset=utf-8" } }),
    "/",
  );
  for (const { key, value } of securityHeaders) assert.equal(response.headers.get(key), value);
  assert.equal(response.headers.get("cache-control"), "private, no-cache, no-store, must-revalidate");
  assert.equal(await response.text(), "<html></html>");
});

test("Sites response wrapper preserves status and gives game files immutable caching", () => {
  const response = applyHttpPolicy(new Response("asset", { status: 206 }), "/game/video/teaser.mp4");
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
});
