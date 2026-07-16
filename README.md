# TRI RELAY: LAST SHIFT

A single-screen browser roguelite about routing one failing power grid through three circuits:

- **EXTRACT** creates ore.
- **FABRICATE** converts ore into ammunition.
- **DEFEND** spends ammunition against the incoming wave.

Every pulse has a circuit affinity. Matching it charges Resonance; at three charges, the player chooses which next valid machine receives an Overdrive. Sappers steal stockpiles, Jammers suppress the most-used circuit, and the Grid Warden punishes predictable route history.

## Current playable scope

- Six-wave run with three enemy types and one boss
- Twelve one-run upgrades across three branches
- Three-charge Resonance Overdrive with different extraction, fabrication, and defense payoffs
- Visible per-circuit load: the next pulse forecasts cooling, strain, or overload before the player commits
- Visible priority relief lets urgent resource or threat demand override affinity without a hidden penalty
- Deterministic seeded pulse stream with no more than three identical affinities in a row
- Mouse, touch, keyboard, pause, and page-background handling
- English and Japanese UI
- Synthesized sound and local best-score profile
- CrazyGames SDK v3 adapter that activates only in the CrazyGames environment
- CrazyGames host mute override for future Full Launch compliance
- Responsive portrait, landscape, and desktop layouts
- Production portrait diorama that physically connects drill, press, cannon, city, enemies, and relay
- First-run-only guided sequence; later runs begin immediately
- Crash-safe local active-run checkpoint restored into pause
- Home-screen-ready fullscreen manifest/icon set and shared Vercel/Sites security/cache headers
- Project-specific v03 portrait and landscape WebP world plates with no state-faking fixed enemies
- v2 Open Graph, square-icon, portrait-promo, and six-second H.264 teaser assets

## Bundled media

This repository is self-contained: the production UI does not fetch images or video from a third-party host. Git and GitHub can store WebP, PNG, JPEG, MP4, audio, and other binary files; SVG is not the only supported format.

- Production portrait/landscape world plates: `public/game/world/`
- Social and promotional images: `public/game/marketing/`
- Marketing-only teaser video: `public/game/video/`
- Lossless, generated-for-project source masters: `art-source/tri-relay/`
- Code-owned home-screen icons: `public/game/icons/`
- Self-contained Latin UI fonts: `app/fonts/`
- Dimensions, checksums, usage, and rights status: `docs/MEDIA_MANIFEST.md`

The MP4 is deliberately not loaded during gameplay. It is a repository-contained promotional export, so mobile players do not pay its network or decode cost.

## Controls

- Tap or click the central relay: rotate clockwise 120 degrees
- Space or Enter: rotate
- P or Escape: pause or resume
- 1, 2, 3: choose an upgrade card

## Run locally

Node.js 22 is required. The default development command uses the Sites/Vinext
preview because the repository retains its original Sites project identity.

```bash
npm ci
npm run dev
```

For the native Next.js/Vercel development server:

```bash
npm run dev:vercel
```

## Deployment targets

The repository supports two independent production targets:

- Vercel: `npm run build:vercel` → native Next.js `.next/`
- ChatGPT Sites: `npm run build:sites` → Vinext/Cloudflare `dist/`

Root `vercel.json` explicitly selects the Vercel build. Do not set Vercel's
Output Directory to `dist`; leave it blank/default so the Next.js preset owns
`.next`. The Vercel Root Directory must be the repository root. If the Vercel
dashboard has an old Build Command override, remove it or set it to
`npm run build:vercel`. See `docs/VERCEL_DEPLOYMENT.md` for the complete
settings and troubleshooting checklist.

## Verification

```bash
npm run lint
npm test
npm run verify:vercel
npm run simulate
npm run check:release
```

The automated suite checks input locking, large-frame clamping, pause behavior,
30 Hz vs 144 Hz timing, the opening resource loop, circuit-load forecasting,
upgrade idempotency, and game-over idempotency. The simulation exhaustively
screens every fixed route cycle of length two through eight, then challenges the
strongest survivors in the real six-wave run. It also rejects builds where
pure affinity-following or affinity-first fallback comes too close to the
adaptive resource-and-threat policy.

The media test also rejects missing binaries, invalid WebP/MP4 signatures, wrong dimensions, stale references to the old mood-plate URL, and accidental runtime loading of the marketing video.

`npm run check:release` verifies the technical candidate. `npm run check:commercial`
is intentionally stricter and fails until every production asset carries a named
organization art/legal/brand approval. CI runs the technical gate on every pull
request and main-branch push; configure the `verify` job as a required GitHub
branch-protection check.

## CrazyGames release path

The current build is a v0.3 core-revalidation build for closed playtesting. It
is not yet a Basic Launch candidate: first-time human comprehension, voluntary
replay, real-device QA, and organization art/legal approval remain release
gates. Basic Launch ads are intentionally not requested. The included platform
bridge initializes SDK v3 on a CrazyGames host; the query-parameter preview
switch is restricted to localhost so a public Vercel URL cannot be induced to
load a third-party SDK.

Midgame ads, CrazyGames cloud data, and production monetization should be enabled only after the core metrics justify Full Launch work.
