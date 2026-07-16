# Repository handoff

This archive is intentionally direct-root: `package.json`, `app/`, `public/`, and the other project files sit at the ZIP root. It contains source and owned project binaries, but not Git history, installed dependencies, build output, or machine caches.

## Upload to a new GitHub repository

1. Extract this ZIP into an empty directory.
2. Create an empty repository on GitHub without adding a README or `.gitignore` there.
3. From the extracted directory, run:

```bash
git init -b main
git add .
git commit -m "Initial TRI RELAY repository"
git remote add origin <your-repository-url>
git push -u origin main
```

GitHub supports the bundled WebP, WOFF2, and MP4 files. They do not need to be converted to SVG.

## First local verification

```bash
npm ci
npm run lint
npm test
npm run verify:vercel
npm run simulate
npm run check:release
```

Node.js 22 is required. For Vercel, keep Framework Preset on Next.js, Root Directory on the repository root, and Output Directory blank. The included `vercel.json` selects `npm run build:vercel`; remove any stale dashboard Build Command override or set it to the same command.

The complete binary inventory, checksums, runtime usage, v02-to-v03 provenance,
and remaining art-approval blockers are in `docs/MEDIA_MANIFEST.md`.

After the first Vercel deployment, enable Web Analytics and Speed Insights in
the project dashboard. Make the GitHub Actions `verify` job a required check on
`main`. Before paid distribution, complete `docs/RELEASE_CHECKLIST.md`, record
named art/legal/brand approval in every media metadata file, and require
`npm run check:commercial` to pass.

This archive is the v0.3 core-revalidation build, not a Basic Launch candidate.
Complete the first-time human-test gates in `docs/RELEASE_CHECKLIST.md` before
expanding the run or submitting it to a distribution portal.
