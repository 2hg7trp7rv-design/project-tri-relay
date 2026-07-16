# Vercel deployment

This repository keeps both a native Next.js target for Vercel and a Vinext target for ChatGPT Sites.

## Required Vercel settings

| Setting | Value |
|---|---|
| Framework Preset | Next.js |
| Root Directory | Repository root |
| Build Command | `npm run build:vercel` or use the checked-in `vercel.json` |
| Output Directory | Blank / default |
| Node.js | 22.x (from `package.json`) |

Do not set the Output Directory to `dist` or `dist/client`. Those are part of the Cloudflare/Sites build and are not a standalone Vercel artifact.

## Expected build path

```text
npm run build:vercel
└─ next build
   ├─ compile
   ├─ TypeScript using tsconfig.next.json
   ├─ prerender /
   └─ emit .next/
```

`tsconfig.next.json` intentionally checks the active Next application while excluding Cloudflare-only worker, D1, and Sites build entry points. It does not suppress application type errors.

## Optional canonical URL

Vercel's system URL is used automatically for Open Graph and Twitter image URLs. To force a custom production domain, add this environment variable in Vercel:

```text
NEXT_PUBLIC_SITE_URL=https://your-domain.example
```

## Enable production observability

The repository includes `@vercel/analytics` and `@vercel/speed-insights`, but
the corresponding products must also be enabled in the Vercel project dashboard.
After the first production deployment:

1. Open the project in Vercel and enable **Web Analytics**.
2. Enable **Speed Insights**.
3. Redeploy the current `main` commit.
4. Confirm page views and Core Web Vitals arrive.
5. On a plan that supports custom events, confirm `run_started`,
   `tutorial_completed`, `upgrade_selected`, `checkpoint_restored`,
   `wave_cleared`, `overdrive_used`, and `run_completed` appear after a test run.

The components are rendered only when `VERCEL=1`. Sites/Vinext builds do not
load Vercel telemetry. Client error reports contain only the release prefix,
boundary, normalized error name, digest presence, and query-free route path.
The player-facing disclosure is available at `/privacy`.

## GitHub quality gate

`.github/workflows/ci.yml` verifies the locked install, lint, Sites build and
tests, native Vercel build, asset/release policy, and bounded strategy simulation.
In GitHub branch protection, make the `verify` job required for `main` and
disable direct pushes for production maintainers.

The automated gate does not impersonate human art/legal approval or real-device
QA. Run `npm run check:commercial`; it must be green before a paid launch.

## If Vercel still runs the wrong command

The checked-in `vercel.json` should take effect on the next commit. If the build log still says only `bash scripts/build-verified.sh` or `vinext build`, remove the old Build Command override in Project Settings or set it to `npm run build:vercel`, then redeploy the latest commit.
