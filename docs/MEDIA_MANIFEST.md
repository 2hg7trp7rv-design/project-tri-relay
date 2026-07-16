# TRI RELAY bundled media manifest

Generated for repository handoff: 2026-07-15 (Asia/Tokyo)

This is the checksum inventory for the current v03 runtime and v02 marketing media set. Every delivery file is a physical binary committed under `public/`; lossless world masters are committed under `art-source/tri-relay/`. No runtime image or video depends on a remote host or a base64 placeholder.

## Delivery inventory

| File | Dimensions / duration | Bytes | SHA-256 | Usage |
|---|---:|---:|---|---|
| `public/game/world/world-city-p-v03.webp` | 1080 × 1920 | 150,734 | `b5910c9af2ca588ea7300a768f0f5692b38bd94c427891416aeeab4787aa1959` | Portrait gameplay and opening world; fixed enemy figures removed |
| `public/game/world/world-city-l-v03.webp` | 1920 × 1080 | 149,036 | `c2b6818045d3dbed52597bba9e8461e9d4c5e2428e09a11f155106608a8713d5` | Landscape gameplay and opening world; fixed enemy figures removed |
| `public/game/world/world-city-p-v02.webp` | 1080 × 1920 | 248,566 | `0a4cfe28835ad216b457aea797a47d0e032017304c016ba2c478e3c2f36799b1` | Superseded war key art; retained for provenance, not imported by runtime |
| `public/game/world/world-city-l-v02.webp` | 1920 × 1080 | 242,990 | `6672516ecb9597dc361c7d6ae34fa30a7fdc39546654656dd22c2cf17a541309` | Superseded war key art; retained for provenance, not imported by runtime |
| `public/game/marketing/promo-og-l-v02.webp` | 1200 × 630 | 112,388 | `e4ece0b96d614bcfaf752a45109fda3c784c2379224e7b8b063dbbde93caebfe` | Open Graph / Twitter card |
| `public/game/marketing/promo-portrait-p-v02.webp` | 1080 × 1350 | 181,226 | `cf9f1dcf414ba7b72d0c30fd4782ecc1a7b85e5e500a57dc676e133b77fd49e1` | Social/editorial portrait art |
| `public/game/marketing/promo-icon-sq-v02.webp` | 512 × 512 | 59,778 | `b84c82dc5181028dc5f959c1d8c226eca8323785b70c3d02da273429832583bb` | Square promotional mark |
| `public/game/icons/icon-192-v03.png` | 192 × 192 | 22,199 | `33b17d173ce259e2273e29f13d2a3b5766828f35ee049c30d8da46442f64a5c6` | Home-screen icon |
| `public/game/icons/icon-512-v03.png` | 512 × 512 | 130,898 | `39b73212c5af25e33c2b469d48be22c8d63f9cf674bb110f652ae65a6dffb396` | Large home-screen icon |
| `public/game/icons/icon-maskable-512-v03.png` | 512 × 512 | 84,585 | `d49882e4f5d9146645e5730fbb0e31abbb636c9115a597daf543f3d7e64904b8` | Maskable launcher icon |
| `public/game/icons/apple-touch-icon-180-v03.png` | 180 × 180 | 19,523 | `6c0f3465e464d25046e92b621f8c424c7460b21ff6ec2aacb5310bdd96d4340c` | Apple touch icon |
| `public/game/video/tri-relay-ambient-teaser-p-v02.mp4` | 720 × 1280, 6.0 s, 30 fps | 1,024,866 | `e735b6101df98c376c37c3c4f340495f8eb55568df672f55d44d0ad3acb64f6e` | Marketing-only H.264 teaser; no audio |

## Source-master inventory

| File | Dimensions | Bytes | SHA-256 | Relationship |
|---|---:|---:|---|---|
| `art-source/tri-relay/world-city-p-v02-master.png` | 941 × 1672 | 2,367,389 | `500d06b798cb5bcf75478600ca3269f07b528faac13a3b1fc8abdbb0947352cd` | Source for portrait promo, teaser, and the v03 portrait edit |
| `art-source/tri-relay/world-city-l-v02-master.png` | 1920 × 1080 | 2,818,158 | `339849dbf13be08e0cb1c0bd22259b50aabc609e6cc8145ef1c9bdfe37343007` | Source for landscape marketing art and the v03 landscape edit |
| `art-source/tri-relay/world-city-p-v03-master.png` | 941 × 1672 | 2,300,751 | `873c2ccdd32f1ec9af2729986bd07494d807123780751a6f6dadea4dd5cb96f2` | Current portrait gameplay plate; fixed enemy figures replaced with an empty bridge and atmospheric threat |
| `art-source/tri-relay/world-city-l-v03-master.png` | 1920 × 1080 | 2,695,273 | `ab880881d4981986cf0b02b78eeadcdb361efd2ef3ba5182b013449b2fb238b1` | Current landscape gameplay plate; fixed enemy figures replaced with an empty bridge and atmospheric threat |

## Loading contract

- CSS selects one v03 world image for the active orientation. The active image is the physical city, drill, press, cannon, empty invasion approach, and relay setting.
- Live labels, enemies, route state, city integrity, resources, warnings, input, and feedback remain synchronized DOM/SVG/CSS—not pixels baked into the world image.
- The v02 war plates are not referenced by gameplay CSS. They remain only as auditable sources for existing marketing derivatives.
- The Open Graph image and icons are requested only by metadata/launcher clients.
- The portrait promo and MP4 are repository deliverables and are never imported by gameplay. Mobile players therefore do not download or decode the teaser.
- Latin Geist and Geist Mono subsets are self-hosted under `app/fonts/`; Japanese glyphs use the declared platform sans fallback.

## Provenance and release status

The v02 world masters were generated specifically for TRI RELAY on 2026-07-13 with the OpenAI built-in image-generation workflow. On 2026-07-15, the v03 gameplay plates were edited from those project-owned sources to remove every fixed enemy figure. Only an empty industrial bridge, warning lights, smoke, embers, and non-figurative red fog remain on the invasion side; live hostiles are rendered from simulation state. No third-party image reference was used. Exact prompt summaries, source checksums, export checksums, and processing notes are recorded in adjacent `*.assetmeta.json` files.

The social images and teaser are deterministic derivatives of those committed masters. The v03 launcher icons and square promotional mark are raster exports of the project-owned, hand-authored `public/favicon.svg`; they do not inherit raster-art provenance.

The current files are approved for repository integration and closed testing. Paid commercial distribution remains subject to a named organization art/legal/brand approval. That is a release-process gate, not missing-source uncertainty: the lossless masters and generation records are included in this repository.

## Regeneration policy

Do not overwrite a released asset version. Create the next numbered export, add its adjacent metadata, update runtime/metadata references, run the complete test/build gate, and remove an older version only in an explicit review commit. Record actual bytes and SHA-256 after the final export, never before it.
