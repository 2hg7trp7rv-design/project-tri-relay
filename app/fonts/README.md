# Bundled interface fonts

The two WOFF2 files are the Latin variable subsets used by the interface:

- `geist-sans-latin-v01.woff2` — SHA-256 `9b6f5ff45b278c744b5f379a2c4ecbaf858a842b8eaf82ac8d21b699ca16c608`
- `geist-mono-latin-v01.woff2` — SHA-256 `5f3d6ad60f29d6cb708414ec6887163d63bf197377ef5417d2483ff31ace6c3b`

They are loaded with `next/font/local`, so a clean install and production build do not depend on a Google Fonts request or a machine-specific cache path. Japanese glyphs fall through to the platform sans-serif stack.

Geist is Copyright © 2023 Vercel, released under the SIL Open Font License 1.1. Preserve the license and attribution when redistributing the font files: <https://github.com/vercel/geist-font/blob/main/LICENSE.txt>.
