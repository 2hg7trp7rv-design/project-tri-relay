import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const commercial = process.argv.includes("--commercial");
const failures = [];
const warnings = [];

async function walk(relativeDirectory) {
  const directory = path.join(root, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(relativePath)));
    else if (entry.isFile()) results.push(relativePath);
  }
  return results;
}

const publicFiles = await walk("public");
const publicSizes = await Promise.all(publicFiles.map(async (file) => (await stat(path.join(root, file))).size));
const publicBytes = publicSizes.reduce((sum, value) => sum + value, 0);

if (publicFiles.length >= 1_500) failures.push(`public file count is ${publicFiles.length}; limit is 1,499`);
if (publicBytes >= 20 * 1024 * 1024) failures.push(`public payload is ${publicBytes} bytes; limit is under 20 MiB`);

const forbiddenPublic = publicFiles.filter((file) =>
  /(?:^|\/)(?:source|masters?|working)(?:\/|$)/i.test(file) || /-master\.(?:png|jpe?g|webp)$/i.test(file),
);
if (forbiddenPublic.length) failures.push(`source/working files found in public: ${forbiddenPublic.join(", ")}`);

const sourceFiles = await walk("app");
const configFiles = ["README.md", "app/manifest.ts", "app/layout.tsx", ...sourceFiles.filter((file) => /\.(?:css|ts|tsx)$/.test(file))];
for (const relativePath of new Set(configFiles)) {
  const source = await readFile(path.join(root, relativePath), "utf8");
  const stale = ["/game/bg/", "city-grid-v2", "promo-og-l-v01", "teaser-p-v01", "icon-512-v02"].find((marker) => source.includes(marker));
  if (stale) failures.push(`${relativePath} contains retired marker ${stale}`);
}

const metadataFiles = publicFiles.filter((file) => file.endsWith(".assetmeta.json"));
const metadataText = await Promise.all(metadataFiles.map((file) => readFile(path.join(root, file), "utf8")));
const blockedMarkers = /\b(?:unverified|unknown)\b|commercial_release["'\s:]+blocked/i;
metadataText.forEach((text, index) => {
  if (blockedMarkers.test(text)) failures.push(`${metadataFiles[index]} contains blocked or unknown provenance`);
});

const expectedMetadata = [
  "public/game/world/world-city-p-v02.assetmeta.json",
  "public/game/world/world-city-l-v02.assetmeta.json",
  "public/game/world/world-city-p-v03.assetmeta.json",
  "public/game/world/world-city-l-v03.assetmeta.json",
  "public/game/marketing/promo-icon-sq-v02.assetmeta.json",
  "public/game/marketing/promo-og-l-v02.assetmeta.json",
  "public/game/marketing/promo-portrait-p-v02.assetmeta.json",
  "public/game/video/tri-relay-ambient-teaser-p-v02.assetmeta.json",
  "public/game/icons/icons-v03.assetmeta.json",
];
for (const relativePath of expectedMetadata) {
  try {
    const metadata = JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
    assert.ok(metadata.rights_status, "rights_status is required");
    if (metadata.human_approval !== "approved") {
      const message = `${relativePath} awaits organization art/legal approval`;
      if (commercial) failures.push(message);
      else warnings.push(message);
    }
  } catch (error) {
    failures.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

console.log(JSON.stringify({
  mode: commercial ? "commercial" : "technical-candidate",
  publicFiles: publicFiles.length,
  publicBytes,
  provenanceRecords: metadataFiles.length,
  warnings,
  failures,
}, null, 2));

if (failures.length) process.exitCode = 1;
