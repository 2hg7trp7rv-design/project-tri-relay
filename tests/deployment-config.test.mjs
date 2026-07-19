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
  const observability = await readFile(path.join(root, "app/Observability.tsx"), "utf8");
  const telemetry = await readFile(path.join(root, "app/game/telemetry.ts"), "utf8");
  const game = await readFile(path.join(root, "app/game/Game.tsx"), "utf8");
  const metrics = await readFile(path.join(root, "app/game/playtest-metrics.ts"), "utf8");

  assert.match(observability, /@vercel\/analytics\/next/);
  assert.match(observability, /@vercel\/speed-insights\/next/);
  assert.match(observability, /window\.location\.pathname === ["']\/playtest["']/);
  assert.match(observability, /#playtest=/);
  assert.match(observability, /dataset\.playtestSession === ["']active["']/);
  assert.match(layout, /<Observability \/>/);
  assert.match(layout, /process\.env\.VERCEL === ["']1["']/);
  assert.match(telemetry, /tri-relay-observability/);
  assert.match(game, /dataset\.playtestSession = ["']active["']/);
  for (const event of ["run_started", "upgrade_selected", "checkpoint_restored", "overdrive_used", "wave_cleared"]) {
    assert.match(game, new RegExp(event));
  }
  for (const event of ["tutorial_completed", "first_kill", "active_90s_reached", "run_completed"]) {
    assert.match(metrics, new RegExp(event));
  }
  assert.doesNotMatch(metrics, /\b(seed|email|userAgent|deviceId)\s*:/);
});

test("repository ships a locked CI quality gate", async () => {
  const workflow = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const readiness = await readFile(path.join(root, "scripts/check-release-readiness.mjs"), "utf8");
  for (const command of ["npm ci", "npm run lint", "npm test", "npm run verify:vercel", "npm run check:release", "npm run simulate"]) {
    assert.ok(workflow.includes(command), command);
  }
  assert.match(workflow, /SIMULATION_RUNS:\s*["']500["']/);
  for (const field of ["approver_name", "approver_role", "approval_date"]) {
    assert.match(readiness, new RegExp(field));
  }
  assert.match(readiness, /commercial-asset-approval/);
  assert.match(readiness, /artifact-policy/);
});

test("client failures are bounded and reported without personal payloads", async () => {
  const route = await readFile(path.join(root, "app/api/client-error/route.ts"), "utf8");
  const globalError = await readFile(path.join(root, "app/global-error.tsx"), "utf8");
  assert.match(route, /MAX_BODY_BYTES = 4_096/);
  assert.match(route, /sec-fetch-site/);
  assert.ok(!route.includes("userAgent"));
  assert.ok(!route.includes("request.headers.get(\"cookie\")"));
  assert.match(globalError, /reportClientError/);
  const telemetry = await readFile(path.join(root, "app/game/telemetry.ts"), "utf8");
  assert.match(telemetry, /credentials:\s*["']omit["']/);
  assert.match(telemetry, /EVENT_FIELDS/);
  assert.doesNotMatch(telemetry, /tester.?id|observer.?code|user.?agent/i);
});

test("v0.4.1 playtest operations stay local and require exact release identity", async () => {
  const consoleSource = await readFile(path.join(root, "app/playtest/PlaytestConsole.tsx"), "utf8");
  const sessionSource = await readFile(path.join(root, "app/game/playtest-session.ts"), "utf8");
  const pageSource = await readFile(path.join(root, "app/playtest/page.tsx"), "utf8");
  const layoutSource = await readFile(path.join(root, "app/layout.tsx"), "utf8");
  const schema = await readJson("schemas/v04-playtest-session.schema.json");

  assert.match(consoleSource, /window\.sessionStorage/);
  assert.match(consoleSource, /JSONを保存/);
  assert.match(consoleSource, /pagehide/);
  assert.match(consoleSource, /<MachineGlyph/);
  assert.match(consoleSource, /<EnemyGlyph/);
  assert.match(consoleSource, /session\.sourceRevision/);
  assert.match(consoleSource, /not-reached/);
  assert.doesNotMatch(consoleSource, /navigator\.userAgent/);
  assert.match(sessionSource, /PLAYTEST_TESTER_IDS/);
  assert.match(sessionSource, /PLAYTEST_RELEASE = ["']0\.4\.1["']/);
  assert.match(sessionSource, /\^\[0-9a-f\]\{40\}\$/i);
  assert.match(sessionSource, /\^#playtest=/);
  assert.match(sessionSource, /deploymentEnvironment !== ["']production["']/);
  assert.match(sessionSource, /\.vercel\.app/);
  assert.match(sessionSource, /beginPlaytestRun/);
  assert.match(sessionSource, /if \(!session\.currentRunStartedAt\) return null/);
  assert.match(sessionSource, /duplicate session ID|currentRunStartedAt/);
  assert.doesNotMatch(sessionSource, /trackGameEvent|@vercel\/analytics/);
  const game = await readFile(path.join(root, "app/game/Game.tsx"), "utf8");
  assert.match(game, /stateRef\.current\.phase === ["']upgrade["']/);
  assert.match(game, /recordPlaytestRun/);
  assert.match(game, /tri-relay-source-revision/);
  assert.match(game, /window\.location\.origin === deploymentOrigin/);
  assert.match(game, /!officialPlaytest/);
  assert.match(game, /checkpointable/);
  assert.match(game, /recordPlaytestProtocolDeviation/);
  assert.match(layoutSource, /tri-relay-deployment-environment/);
  assert.match(pageSource, /index:\s*false/);
  assert.equal(schema.properties.release.const, "0.4.1");
  assert.equal(schema.properties.testerId.enum.length, 10);
  assert.ok(schema.$defs.observation.required.includes("firstLookedAt"));
  assert.ok(schema.$defs.observation.required.includes("behaviorNotes"));
  assert.ok(schema.$defs.observation.properties.wallTimings.required.includes("ninetySecondMark"));
});

test("CrazyGames host mute setting overrides the in-game audio toggle", async () => {
  const platform = await readFile(path.join(root, "app/game/platform.ts"), "utf8");
  const game = await readFile(path.join(root, "app/game/Game.tsx"), "utf8");
  assert.match(platform, /muteAudio\?: boolean/);
  assert.match(platform, /settings\?: CrazyGamesSettings/);
  assert.match(platform, /addSettingsChangeListener/);
  assert.match(platform, /removeSettingsChangeListener/);
  assert.match(game, /muted \|\| platformMuted/);
  assert.equal(
    (game.match(/aria-pressed=\{muted \|\| platformMuted\}/g) ?? []).length,
    3,
    "HUD, opening, and pause controls must all expose the effective mute state",
  );
  assert.equal(
    (game.match(/disabled=\{platformMuted\}/g) ?? []).length,
    3,
    "the host mute override must disable every in-game mute control",
  );
});

test("CrazyGames bridge is recreated for each React mount-effect setup", async () => {
  const game = await readFile(path.join(root, "app/game/Game.tsx"), "utf8");

  assert.match(game, /const platformRef = useRef<PlatformBridge \| null>\(null\)/);
  assert.match(game, /const platform = new PlatformBridge\(\)/);
  assert.match(game, /platformRef\.current = platform/);
  assert.match(game, /platform\.dispose\(\)/);
  assert.doesNotMatch(game, /useRef<PlatformBridge>\(new PlatformBridge\(\)\)/);
  assert.match(game, /initializationCompleteRef\.current = true/);
  assert.match(game, /disabled=\{!initialized\}/);
  assert.match(
    game,
    /const suspendAndCheckpoint = \(\) => \{\s*\/\/[\s\S]*?if \(!initializationCompleteRef\.current\) return;/,
  );
  assert.match(
    game,
    /const resyncWithoutResuming = \(\) => \{\s*if \(!initializationCompleteRef\.current\) return;/,
  );
  assert.doesNotMatch(
    game,
    /onClick=\{\(\) => beginRun\(["']replay["'], false\)\} autoFocus/,
  );
  assert.match(game, /modal\.focus\(\{ preventScroll: true \}\)/);
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


test("v0.4 validates the complete checkpoint schema and migrates the profile only", async () => {
  const persistence = await readFile(path.join(root, "app/game/persistence.ts"), "utf8");
  const game = await readFile(path.join(root, "app/game/Game.tsx"), "utf8");

  assert.match(persistence, /PROFILE_KEY = ["']tri-relay-profile-v2["']/);
  assert.match(persistence, /LEGACY_PROFILE_KEY = ["']tri-relay-profile-v1["']/);
  assert.match(persistence, /ACTIVE_RUN_KEY = ["']tri-relay-active-run-v4["']/);
  assert.match(persistence, /tri-relay-active-run-v3/);
  assert.match(persistence, /tri-relay-active-run-v2/);
  assert.match(persistence, /ACTIVE_RUN_VERSION = 4/);
  assert.match(persistence, /export function isValidGameState/);
  assert.match(persistence, /candidate\.length > maximum/);
  assert.match(persistence, /ids\.has/);
  assert.match(game, /const evidence = evidenceRef\.current\?\.snapshot\(\) \?\? null/);
  assert.match(game, /safeWriteActiveRun\(\s*snapshot,\s*evidence,/s);
});

test("v0.4 battlefield keeps live state readable without solving the route", async () => {
  const game = await readFile(path.join(root, "app/game/Game.tsx"), "utf8");
  const visuals = await readFile(path.join(root, "app/game/production-visuals.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/game/production.css"), "utf8");

  assert.match(game, /Math\.max\(nearest, enemy\.progress\)/);
  assert.match(game, /battlefield: ["']BATTLEFIELD["']/);
  assert.match(game, /aria-label=\{t\.battlefield\}/);
  assert.match(game, /const recommendedSector: Sector \| null = tutorialStep < tutorialSequence\.length/);
  assert.doesNotMatch(game, /etaSeconds <= 4\.5/);
  assert.doesNotMatch(game, /view\.ammo < 4/);
  assert.doesNotMatch(game, /view\.ore < 8/);
  assert.match(game, /isResonanceEnabled\(view\)/);
  assert.match(game, /isCircuitLoadEnabled\(view\)/);
  assert.ok(
    (game.match(/resonanceEnabled \? t\.affinityHelp : t\.loopHint/g) ?? []).length >= 2,
    "wave-one footer and pause help must both stay on the basic resource loop",
  );
  assert.match(game, /formatAmmoForecast\(defenseForecast\.ammoRequired\)/);
  assert.match(game, /language === ["']ja["'] \? ["']敵["'] : ["']ENEMY["']/);
  assert.match(game, /language === ["']ja["'] \? ["']耐久["'] : ["']CORE["']/);
  assert.ok((game.match(/<WorldStateOverlay/g) ?? []).length >= 2);
  assert.match(visuals, /useId\(\)\.replace/);
  assert.match(visuals, /length: segmentCount/);
  assert.match(css, /\.bf-enemy-rusher \.enemy-glyph\s*\{[^}]*clip-path/s);
  assert.match(css, /max-width: 350px[\s\S]*data-sector=["']fabricate["'][^}]*right: 1\.5%/);
  assert.match(css, /max-width: 350px[\s\S]*\.bf-machine-copy strong\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /max-width: 350px[\s\S]*max-height: 650px[\s\S]*\.bf-event-strip\s*\{\s*display:\s*none/s);
  assert.match(css, /\.desktop-world-state\s*\{/);
});

test("v0.4 privacy disclosure is bilingual, selectable, and scrollable", async () => {
  const privacy = await readFile(path.join(root, "app/privacy/page.tsx"), "utf8");
  const css = await readFile(path.join(root, "app/globals.css"), "utf8");

  assert.match(privacy, /計測とプライバシー/);
  assert.match(privacy, /Data and privacy/);
  assert.match(privacy, /チュートリアル完了状態/);
  assert.match(privacy, /tutorial completion/);
  assert.match(privacy, /広告識別子/);
  assert.match(privacy, /advertising ID/);
  assert.match(privacy, /random seed/);
  assert.match(privacy, /CrazyGames/);
  assert.match(css, /\.privacy-screen\s*\{[^}]*overflow-y:\s*auto[^}]*user-select:\s*text/s);
  assert.match(css, /\.privacy-screen a\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.privacy-link\s*\{[^}]*min-height:\s*44px/s);
});
