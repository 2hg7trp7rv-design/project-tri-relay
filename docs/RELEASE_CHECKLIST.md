# TRI RELAY release checklist

This checklist separates a technically deployable candidate from a commercial
release. A Vercel deployment being playable is not itself a release decision.

## Automated gate

- [ ] GitHub `verify` check is green on the exact release commit.
- [ ] `npm ci`, `npm run lint`, `npm test`, `npm run verify:vercel`,
      `npm run simulate`, and `npm run check:release` pass.
- [ ] The exhaustive route audit covers every fixed cycle of length 2–8 and
      the strongest full-run challenger remains materially below the adaptive policy.
- [ ] Pure affinity and affinity-first fallback remain below the thresholds
      enforced by `npm run simulate`; do not weaken those gates to make CI green.
- [ ] Runtime CSS references only the v03 gameplay plates; live enemies are
      rendered from simulation state rather than baked into those plates.
- [ ] Vercel Web Analytics and Speed Insights are enabled and receiving data.
- [ ] Vercel runtime logs receive a controlled `/api/client-error` test without
      cookies, query strings, free text, or device identifiers.
- [ ] Public payload remains below 20 MiB and 1,500 files.

## Human gate

- [ ] A named art director approves both committed world masters at phone size.
- [ ] A named legal/brand reviewer records approval in every `*.assetmeta.json`.
- [ ] `npm run check:commercial` passes after those records are updated.
- [ ] Ten first-time testers meet the five-second readability gate in
      `docs/PRODUCTION_ASSETS.md`.
- [ ] At least 8/10 first-time testers can explain extract → fabricate → defend
      without prompting after the opening sequence.
- [ ] At least 8/10 score their first kill within 25 seconds; at least 7/10
      remain active at 90 seconds.
- [ ] Voluntary second-run starts are recorded separately; do not count a
      prompted retry as replay intent.
- [ ] The real-device matrix below passes on the exact deployment commit.
- [ ] Product owner signs off the Basic Launch candidate; ads remain disabled.

## Real-device matrix

| Device path | Required checks |
|---|---|
| iPhone Safari | 390×844 class viewport; touch; mute; app switch; screen lock; BFCache back/forward; resume remains paused and sound returns only after tap |
| Small iPhone Safari | 320×568 class viewport; browser chrome open; relay, threat, resources, and modal buttons remain visible |
| Android Chrome | touch; tab switch; tab discard/reload; checkpoint restores within two seconds of last save |
| Desktop Chrome/Edge | mouse and keyboard; 1366×768 and 1920×1080; landscape art; pause/focus behavior |
| CrazyGames preview | SDK loads only on allowed host; gameplay start/stop; host `muteAudio` overrides game toggle; safe-area and iframe behavior |

For every device: no background simulation, duplicate gameplay events, missing
assets, console errors, accidental teaser download, or layout-obscuring browser
chrome. Record tester, device/OS/browser, commit SHA, result, and evidence link.
