import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

test("Vercel uses a native Next build without a custom output directory", async () => {
  const vercel = await readJson("vercel.json");
  assert.equal(vercel.framework, "nextjs");
  assert.equal(vercel.buildCommand, "npm run build:vercel");
  assert.ok(!Object.hasOwn(vercel, "outputDirectory"));

  const pkg = await readJson("package.json");
  assert.equal(pkg.engines.node, "22.x");
  assert.equal(pkg.scripts["build:vercel"], "next build");
  assert.equal(pkg.scripts["build:sites"], "bash scripts/build-verified.sh");
});

test("Next type-checking is isolated from Cloudflare-only entry points", async () => {
  const nextTsconfig = await readJson("tsconfig.next.json");
  assert.ok(nextTsconfig.include.includes("app/**/*.tsx"));
  for (const cloudflarePath of ["db", "worker", "build"]) {
    assert.ok(nextTsconfig.exclude.includes(cloudflarePath));
  }

  const nextConfig = await readFile(path.join(root, "next.config.ts"), "utf8");
  assert.match(nextConfig, /tsconfigPath:\s*["']tsconfig\.next\.json["']/);
  assert.ok(!nextConfig.includes("ignoreBuildErrors"));
});

test("Vercel production includes first-party performance and product telemetry", async () => {
  const layout = await readFile(path.join(root, "app/layout.tsx"), "utf8");
  const telemetry = await readFile(path.join(root, "app/game/telemetry.ts"), "utf8");
  const game = await readFile(path.join(root, "app/game/Game.tsx"), "utf8");

  assert.match(layout, /@vercel\/analytics\/next/);
  assert.match(layout, /@vercel\/speed-insights\/next/);
  assert.match(layout, /process\.env\.VERCEL === ["']1["']/);
  assert.match(telemetry, /tri-relay-observability/);
  for (const event of ["run_started", "tutorial_completed", "upgrade_selected", "checkpoint_restored", "overdrive_used", "wave_cleared", "run_completed"]) {
    assert.match(game, new RegExp(event));
  }
});

test("repository ships a locked CI quality gate", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
  for (const command of ["npm ci", "npm run lint", "npm test", "npm run verify:vercel", "npm run check:release", "npm run simulate"]) {
    assert.ok(workflow.includes(command), command);
  }
});

test("client failures are bounded and reported without personal payloads", async () => {
  const route = await readFile(path.join(root, "app/api/client-error/route.ts"), "utf8");
  const globalError = await readFile(path.join(root, "app/global-error.tsx"), "utf8");
  assert.match(route, /MAX_BODY_BYTES = 4_096/);
  assert.match(route, /sec-fetch-site/);
  assert.ok(!route.includes("userAgent"));
  assert.ok(!route.includes("request.headers.get(\"cookie\")"));
  assert.match(globalError, /reportClientError/);
});

test("CrazyGames host mute setting overrides the in-game audio toggle", async () => {
  const platform = await readFile(path.join(root, "app/game/platform.ts"), "utf8");
  const game = await readFile(path.join(root, "app/game/Game.tsx"), "utf8");
  assert.match(platform, /settings\?: \{ muteAudio\?: boolean/);
  assert.match(platform, /addSettingsChangeListener/);
  assert.match(platform, /removeSettingsChangeListener/);
  assert.match(game, /muted \|\| platformMuted/);
  assert.match(game, /disabled=\{platformMuted\}/);
});

test("large host gutters are limited to the ChatGPT container", async () => {
  const game = await readFile(path.join(root, "app/game/Game.tsx"), "utf8");
  const productionCss = await readFile(path.join(root, "app/game/production.css"), "utf8");
  const globalCss = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(game, /embedded\s*\?\s*["']embedded["']/);
  assert.match(productionCss, /html\[data-game-host=["']chatgpt["']\] \.game-shell/);
  assert.match(globalCss, /html\[data-game-host=["']chatgpt["']\] \.game-shell/);
  assert.doesNotMatch(productionCss, /data-game-host=["']embedded["'][^{]*\{[^}]*46px/s);
  assert.doesNotMatch(globalCss, /data-game-host=["']embedded["'][^{]*\{[^}]*46px/s);
});


test("v0.3 retires incompatible v0.2 active runs without deleting the profile", async () => {
  const game = await readFile(path.join(root, "app/game/Game.tsx"), "utf8");
  assert.match(game, /ACTIVE_RUN_KEY = ["']tri-relay-active-run-v3["']/);
  assert.match(game, /LEGACY_ACTIVE_RUN_KEY = ["']tri-relay-active-run-v2["']/);
  assert.match(game, /parsed\.version !== 3/);
  assert.match(game, /JSON\.stringify\(\{ version: 3,/);
  assert.match(game, /removeItem\(LEGACY_ACTIVE_RUN_KEY\)/);
  assert.match(game, /PROFILE_KEY = ["']tri-relay-profile-v1["']/);
});

test("v0.3 battlefield keeps live state readable across compact and landscape layouts", async () => {
  const game = await readFile(path.join(root, "app/game/Game.tsx"), "utf8");
  const visuals = await readFile(path.join(root, "app/game/production-visuals.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/game/production.css"), "utf8");

  assert.match(game, /Math\.max\(nearest, enemy\.progress\)/);
  assert.ok((game.match(/<WorldStateOverlay/g) ?? []).length >= 2);
  assert.match(visuals, /useId\(\)\.replace/);
  assert.match(visuals, /length: segmentCount/);
  assert.match(css, /\.bf-enemy-rusher \.enemy-glyph\s*\{[^}]*clip-path/s);
  assert.match(css, /max-width: 350px[\s\S]*data-sector=["']fabricate["'][^}]*right: 1\.5%/);
  assert.match(css, /\.desktop-world-state\s*\{/);
});
