# TRI RELAY release checklist

This checklist separates a technically deployable candidate from a commercial
release. A Vercel deployment being playable is not itself a release decision.

## Automated gate

- [ ] GitHub `verify` check is green on the exact release commit.
- [ ] `npm ci`, `npm run lint`, `npm test`, `npm run verify:vercel`,
      `npm run simulate`, and `npm run check:release` pass.
- [ ] The phase-normalized route audit covers all 1,318 primitive fixed cycles
      of length 1–8 and
      the strongest full-run challenger remains materially below the adaptive policy.
- [ ] Pure affinity and affinity-first fallback remain below the thresholds
      enforced by `npm run simulate`; do not weaken those gates to make CI green.
- [ ] Runtime CSS references only the v03 gameplay plates; live enemies are
      rendered from simulation state rather than baked into those plates.
- [ ] Vercel Web Analytics and Speed Insights are enabled and receiving data.
- [ ] Vercel runtime logs receive a controlled `/api/client-error` test without
      cookies, query strings, free text, or device identifiers.
- [ ] Public payload remains below 20 MiB and 1,500 files.
- [ ] All automated tests pass on the exact commit; both Sites and native
      Vercel builds and type checks pass.
- [ ] Active Run v4 rejects malformed, duplicate, expired, and future-dated
      data before it reaches the engine; retired v2/v3 runs are removed.
- [ ] CrazyGames delayed initialization cannot start gameplay after the game
      has already paused, and duplicate start/stop notifications are suppressed.

## Human gate

- [ ] A named art director approves both committed world masters at phone size.
- [ ] A legal/brand reviewer records `human_approval: approved`, their real
      `approver_name`, `approver_role`, and ISO `approval_date` in every
      production `*.assetmeta.json`.
- [ ] `npm run check:commercial` passes after those records are updated.
- [ ] Ten first-time testers meet the five-second readability gate in
      `docs/PRODUCTION_ASSETS.md`.
- [ ] At least 8/10 first-time testers can explain extract → fabricate → defend
      without prompting after the opening sequence.
- [ ] At least 8/10 score their first kill within 25 seconds; at least 7/10
      remain active at 90 seconds.
- [ ] Voluntary second-run starts are recorded separately; do not count a
      prompted retry or a start after 30.000 seconds as replay intent.
- [ ] At least 8/10 explain the wave-two frequency/resonance rule; W2 non-arrival
      remains a failure rather than disappearing from the denominator.
- [ ] The T01–T10 session follows `docs/V04_PLAYTEST_PROTOCOL.md`; observer
      wall time and foreground/unpaused active time are stored separately.
- [ ] The ten local JSON records share one exact commit and immutable
      deployment; `npm run playtest:summary` returns GO and its input SHA-256 is
      attached to the decision without committing interview text.
- [ ] Before T01, the trusted observer roster/order, immutable deployment,
      language, retention date, and access-control method are fixed in a
      separate restricted record. Local JSON and its hash are unsigned and do
      not by themselves prove absence of fabrication, editing, or selection.
- [ ] Threat, city, current route, next route, ore, ammo, all three facilities,
      and all four post-run enemy silhouettes are recorded separately rather
      than collapsed into one observer checkbox.
- [ ] The real-device matrix below passes on the exact deployment commit.
- [ ] Product owner signs off the Basic Launch candidate; ads remain disabled.
- [ ] A named legal reviewer supplies and approves the real operator identity,
      contact route, retention period, analytics processor identity, and
      processor-policy links in the bilingual privacy notice. Do not invent or
      infer any missing organization detail.

## Major unpassed checks for v0.4.1

- [ ] 320×568 layout manually verified.
- [ ] 390×844 layout manually verified.
- [ ] Landscape phone layout manually verified.
- [ ] iPhone Safari touch, app-switch, screen-lock, BFCache, pause, and audio resume verified.
- [ ] Android Chrome touch, tab switch, tab discard, reload, and checkpoint recovery verified.
- [ ] CrazyGames mobile iframe and Developer Portal preview verified on the exact commit.
- [ ] Deployment Protection and the restricted pre-registered T01–T10 roster are in place.
- [ ] Analytics reception and a controlled privacy-safe client-error event are verified in Vercel.
- [ ] Named product-owner and privacy/legal reviews are complete.
- [ ] Nine pending art/legal metadata approvals resolved with reviewer name,
      role, and date, and `npm run check:commercial` passes.
- [ ] New-player comprehension, first-kill, active-90-second, and voluntary-replay gates pass.

Desktop browser verification does not satisfy the phone checks above. An
automated test, responsive CSS rule, or resized screenshot is not an iPhone
Safari result.

The v0.4 baseline previously passed automated Chromium at 320×568, 390×844,
800×450, and 1366×768, including the 320×568 result dialog. The v0.4.1 observer
console was rechecked locally at 320×568 and 390×844 for overflow, controls,
Session Storage isolation, interrupted-run capture, and console/request errors.
That v0.4.1 check does not re-certify the normal game at 800×450 or 1366×768,
and none of this automated evidence closes a real-device checkbox above.

## Real-device matrix

| Device path | Required checks |
|---|---|
| iPhone Safari | 390×844 class viewport; touch; mute; app switch; screen lock; BFCache back/forward; resume remains paused and sound returns only after tap |
| Small iPhone Safari | 320×568 class viewport; browser chrome open; relay, threat, resources, and modal buttons remain visible |
| Android Chrome | touch; tab switch; tab discard/reload; checkpoint restores within two seconds of last save |
| CrazyGames mobile iframe | 800×450 at devicePixelRatio 1; all decision text and controls remain legible; no custom fullscreen button |
| Desktop Chrome/Edge | mouse and keyboard; 1366×768 and 1920×1080; landscape art; pause/focus behavior |
| CrazyGames preview | SDK loads only on allowed host; gameplay start/stop; host `muteAudio` overrides game toggle; safe-area and iframe behavior |

For every device: no background simulation, duplicate gameplay events, missing
assets, console errors, accidental teaser download, or layout-obscuring browser
chrome. Record tester, device/OS/browser, commit SHA, result, and evidence link.
