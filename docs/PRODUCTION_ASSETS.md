# TRI RELAY: LAST SHIFT — production asset contract

Status: v0.3 core-revalidation world plates implemented for portrait and landscape

Owner: art direction + game design + frontend

Target: portrait mobile first; landscape and desktop supported

Last updated: 2026-07-15

This document is the production contract for raster art, code-native visuals, motion, marketing exports, provenance, and acceptance. A visually attractive file is not release-ready unless it explains the game state at play speed, survives small mobile rendering, stays within budget, and has an auditable source.

## 1. Locked visual decision

The game is one living industrial-city diorama, not a stack of generic dashboard cards.

1. The upper field contains the city defense line and the enemy approach.
2. The world contains three physically distinct facilities: amber drill, violet press, and cyan cannon.
3. The triangular power relay is the one primary input; live routing graphics make its current and next destination explicit.
4. Extract, Fabricate, and Defend are distinguished by shape, physical location, motion, label, and colour. Colour is reinforcement, never the only signal.
5. Raster art establishes material, scale, atmosphere, and facility silhouettes. Every changing enemy, number, warning, route, hit, resource, and control remains SVG/CSS/HTML driven.

The production world files are:

- `public/game/world/world-city-p-v03.webp` for portrait.
- `public/game/world/world-city-l-v03.webp` for landscape.

Their lossless masters are committed in `art-source/tri-relay/`. Exact checksums and provenance are in `docs/MEDIA_MANIFEST.md` and the adjacent `*.assetmeta.json` files.

## 2. Production inventory

| Asset | Priority | Delivery | Source/method | Runtime rule |
|---|:---:|---|---|---|
| `world-city-p-v03.webp` | P0 | 1080 × 1920 WebP, 150,734 B | Targeted built-in image edit from the project-owned v02 portrait master; v03 master committed | Portrait title/gameplay world; no baked live enemies |
| `world-city-l-v03.webp` | P0 | 1920 × 1080 WebP, 149,036 B | Targeted built-in image edit from the project-owned v02 landscape master; v03 master committed | Landscape title/gameplay world; no baked live enemies |
| `promo-og-l-v02.webp` | P2 | 1200 × 630 WebP, 112,388 B | Crop/resize from owned landscape master | Metadata request only |
| `promo-portrait-p-v02.webp` | P2 | 1080 × 1350 WebP, 181,226 B | Crop/resize from owned portrait master | Editorial export; not gameplay |
| `promo-icon-sq-v02.webp` | P2 | 512 × 512 WebP, 59,778 B | Rasterized from project-owned `favicon.svg` | Promotional mark only |
| v03 launcher icons | P0 | 180/192/512 px PNG | Rasterized from project-owned `favicon.svg` | Manifest / Apple metadata only |
| `tri-relay-ambient-teaser-p-v02.mp4` | P2 | 720 × 1280, 6 s H.264, 1,024,866 B | Slow camera move from owned portrait master | Never requested by gameplay |

Priority rules:

- P0: required to understand and complete the six-wave run; must pass before public launch.
- P1: identity, boss, upgrade, and event polish; must pass before editorial/store submission.
- P2: marketing/ambience; must never delay gameplay validation or inflate runtime payload.

## 3. Palette and contrast

| Token | Hex | Meaning |
|---|---|---|
| Background | `#05070a` | deepest void |
| Panel | `#0c1218` | live console surfaces |
| Primary text | `#eff6f8` | player-critical copy |
| Muted text | `#91a0ac` | secondary copy |
| Pulse/focus | `#f4fdff` | energy core and focus |
| Warning | `#ffb347` | recoverable shortage/problem |
| Danger | `#ff5c6c` | incoming or actual loss |
| Extract | `#ffc857` | ore/drill route |
| Fabricate | `#b99aff` | ammo/press route |
| Defend | `#4adff3` | city/cannon route |

Normal text must meet WCAG AA 4.5:1; large text and graphical controls must meet 3:1. The world images must not create high-saturation red/gold/violet/cyan focal points behind live warnings or labels. Every essential state must remain understandable in grayscale and under common colour-vision simulations.

## 4. Code-native visual objects

The following stay in React SVG/CSS so they remain responsive, localized, accessible, and synchronized with engine state:

| Object | Minimum size | Required readable states |
|---|---:|---|
| City gate/core | 72 × 54 px | current four integrity levels, damage, breach, destroyed |
| Rusher | 30 px | advance, warning, hit, destroyed, breach |
| Sapper | 32 px | advance, stockpile threat, hit, destroyed, breach |
| Jammer | 34 px | warning, affected sector, active jam, cleared |
| Grid Warden | 44 px | armor, special warning, hit, destroyed, breach |
| Extract drill | 64 × 52 px | standby, powered, success, jammed |
| Fabrication press | 64 × 52 px | standby, powered, success, jammed |
| Defense cannon | 64 × 52 px | standby, armed, tracking, firing, no target, jammed |
| Relay dial | 96 px | all three positions, transit, matched pulse, overdrive, focus |

One-shot effects may confirm an event but may not be the only state indicator. A player who misses an animation must still see the settled HP, integrity, route, resource, or status.

## 5. What must not be baked into raster art

Do not export the following as a generated PNG/WebP/JPEG/GIF or a fake gameplay screenshot:

- Full UI screens, HUD, cards, buttons, labels, timers, HP bars, counters, tutorials, pause/results, or generated lettering.
- Relay pointer, pulse ring, terminals, conduits, focus rings, and route state.
- Live enemies, enemy HP, warnings, destruction, city integrity, and target lines.
- Machine state, output numbers, shots, impacts, breach flashes, jam arcs, semantic glows, or screen shake.
- Sector/resource/upgrade/pause/sound/language/warning icons.

Static architecture and distant non-interactive silhouettes may exist in a world plate. The visual must not suggest that a decorative object is tappable.

## 6. Image-generation and derivative workflow

The built-in image-generation workflow is used only for original environment/key-art masters.

1. Lock portrait/landscape safe zones and real UI geometry before generation.
2. Describe material, lighting, camera, negative space, and semantic facility locations. Do not name an artist, franchise, film, game, or studio as a style target.
3. Request no text, logos, watermarks, recognizable characters, or third-party intellectual property.
4. Select by gameplay function at 320 × 568 and 390 × 844 before selecting by atmosphere.
5. Inspect for accidental symbols, lettering, duplicated structures, impossible joints, noisy detail, and objects that imply interaction.
6. Export sRGB WebP for runtime. Marketing images and video are derived from the committed owned masters.
7. Record prompt summary, tool, date, references, seed if exposed, post-processing, dimensions, bytes, source/export SHA-256, rights state, and human approval in `*.assetmeta.json`.

For the v02 set, the portrait master was generated first and the landscape master used it as the sole continuity reference. For v03, each matching v02 master was the only edit target. Fixed enemy figures and their battle-ground light were replaced with an empty industrial approach, weak warning light, smoke, and non-figurative fog. The edited region was feather-composited over the original master so the friendly facilities and world geometry outside that region remain unchanged. No third-party image reference was used.

## 7. Performance contract

- Exactly one orientation-appropriate world WebP should be required by the live screen.
- Portrait world ≤ 320 KB; landscape world ≤ 450 KB. Current files pass.
- No GIF, base64 image payload, externally hosted runtime art, or autoplay video.
- The teaser stays marketing-only and is not referenced from app runtime source.
- Full-screen CSS filters are forbidden; remove ambient particles and nonessential glow first if a mid-range mobile misses 60 fps.
- Touch controls remain at least 48 px and safe-area aware after art integration.
- `prefers-reduced-motion` removes repeating drift, shake, and mechanical travel without hiding state.

## 8. Rights and provenance

1. Ship only project-owned work, public-domain material, or material with written commercial-game and modification rights.
2. Do not imitate a named artist or reproduce protected characters, machinery, logos, UI layouts, or distinctive trade dress. Proven mechanics may be studied; protected expression may not be copied.
3. Reject results containing recognizable characters, logos, watermarks, signatures, accidental text, or suspiciously specific third-party designs.
4. Keep the lossless master, generation record, derivative process, and checksum for every AI-assisted raster.
5. A generated-for-project source record removes the legacy-source uncertainty; it does not replace organization art/legal/brand approval for paid distribution.
6. Launcher icons and the square mark derive from the hand-authored `public/favicon.svg`, with their own v03 metadata record.
7. Store/editorial screenshots must be captures of the real production build without browser chrome, debug UI, or misleading state.

## 9. Acceptance gates

### Five-second readability

At 320 × 568, a first-time tester can point to the threat, city, current route, next route, ore, ammo, and the one tappable relay within five seconds. Eight of ten testers must distinguish all three facilities and all four enemy silhouettes without relying on colour alone.

### Composition and responsive behavior

- Test 320 × 568, 390 × 844, 430 × 932, 844 × 390, 1366 × 768, and 1920 × 1080.
- Test safe-area insets and the 46 px hosted side gutter.
- No raster focal object may collide with critical live text or look like a second primary button.
- Portrait must not download the landscape master and landscape must not download the portrait master in the normal loading path.

### Causality and motion

- Tap feedback starts within one rendered frame and route rotation settles within 180 ms.
- Pulse arrival, facility action, resource change, shot/hit, and HP change occur in a visually causal order.
- Armed-without-target is neutral; insufficient resource is warning; city damage is danger.
- Reduced-motion mode is fully playable.

### Technical and release

- No missing assets, 404s, runtime video requests, console errors, or layout shift caused by art.
- Asset dimensions, byte limits, checksums, and runtime references match `MEDIA_MANIFEST.md`.
- Lint, automated tests, both production builds, and real-device portrait QA pass.
- Every shipped raster has adjacent provenance metadata and a named human approval before paid commercial release.

## 10. Delivery policy

Do not overwrite an established asset. Use monotonically increasing filenames (`v02`, `v03`, and so on), create/update adjacent metadata, change references atomically, then run the full quality gate. A previous version may be removed only in an explicit reviewed change after all runtime/tests/docs references have moved.

The next visual investment should be state readability, impact timing, upgrade/boss identity, and real-device validation—not another layer of decorative background art.
