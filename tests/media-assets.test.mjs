import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const webpAssets = [
  ["public/game/world/world-city-p-v03.webp", 1080, 1920],
  ["public/game/world/world-city-l-v03.webp", 1920, 1080],
  ["public/game/marketing/promo-icon-sq-v02.webp", 512, 512],
  ["public/game/marketing/promo-og-l-v02.webp", 1200, 630],
  ["public/game/marketing/promo-portrait-p-v02.webp", 1080, 1350],
];

const pngAssets = [
  ["public/game/icons/icon-192-v03.png", 192, 192],
  ["public/game/icons/icon-512-v03.png", 512, 512],
  ["public/game/icons/icon-maskable-512-v03.png", 512, 512],
  ["public/game/icons/apple-touch-icon-180-v03.png", 180, 180],
];

function readWebPSize(buffer) {
  assert.equal(buffer.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(buffer.subarray(8, 12).toString("ascii"), "WEBP");

  const chunk = buffer.subarray(12, 16).toString("ascii");
  if (chunk === "VP8 ") {
    assert.deepEqual([...buffer.subarray(23, 26)], [0x9d, 0x01, 0x2a]);
    return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
  }
  if (chunk === "VP8X") {
    return [buffer.readUIntLE(24, 3) + 1, buffer.readUIntLE(27, 3) + 1];
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  assert.fail(`Unsupported WebP chunk ${JSON.stringify(chunk)}`);
}

test("bundled WebP files have valid signatures and locked dimensions", async () => {
  for (const [relativePath, width, height] of webpAssets) {
    const file = path.join(root, relativePath);
    const info = await stat(file);
    assert.ok(info.size > 4_000, `${relativePath} is unexpectedly small`);
    const buffer = await readFile(file);
    assert.deepEqual(readWebPSize(buffer), [width, height], relativePath);
  }
});

test("home-screen PNG icons have valid signatures and locked dimensions", async () => {
  for (const [relativePath, width, height] of pngAssets) {
    const buffer = await readFile(path.join(root, relativePath));
    assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], relativePath);
    assert.equal(buffer.readUInt32BE(16), width, relativePath);
    assert.equal(buffer.readUInt32BE(20), height, relativePath);
  }
});

test("marketing teaser is a local, fast-start MP4 and is not a runtime dependency", async () => {
  const relativePath = "public/game/video/tri-relay-ambient-teaser-p-v02.mp4";
  const buffer = await readFile(path.join(root, relativePath));
  assert.equal(buffer.subarray(4, 8).toString("ascii"), "ftyp");
  assert.ok(buffer.indexOf(Buffer.from("moov")) < buffer.indexOf(Buffer.from("mdat")));
  assert.ok(buffer.length > 100_000 && buffer.length < 2_000_000);

  const runtimeFiles = ["app/globals.css", "app/game/production.css", "app/game/Game.tsx"];
  for (const runtimeFile of runtimeFiles) {
    const source = await readFile(path.join(root, runtimeFile), "utf8");
    assert.ok(!source.includes("tri-relay-ambient-teaser"), runtimeFile);
  }
});

test("runtime CSS uses orientation-specific background files", async () => {
  const globals = await readFile(path.join(root, "app/globals.css"), "utf8");
  const production = await readFile(path.join(root, "app/game/production.css"), "utf8");
  const css = `${globals}\n${production}`;

  for (const file of webpAssets.slice(0, 2).map(([file]) => path.basename(file))) {
    assert.match(css, new RegExp(file.replaceAll(".", "\\.")));
  }
  for (const legacyReference of ["/game/bg/", "city-grid-v2", "-v01.webp"]) {
    assert.ok(!css.includes(legacyReference), legacyReference);
  }
  for (const retiredRuntimeWorld of ["world-city-p-v02.webp", "world-city-l-v02.webp"]) {
    assert.ok(!css.includes(retiredRuntimeWorld), retiredRuntimeWorld);
  }
});

test("all production images have adjacent project provenance metadata", async () => {
  const metadataFiles = [
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
  for (const relativePath of metadataFiles) {
    const metadata = JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
    assert.match(JSON.stringify(metadata), /generated|project-owned|project mark/i, relativePath);
    assert.match(metadata.rights_status, /generated specifically|organization .*review|project-owned/i, relativePath);
  }
});

test("v03 world plates have no baked live-enemy contract and exact checksums", async () => {
  for (const orientation of ["p", "l"]) {
    const metadataPath = `public/game/world/world-city-${orientation}-v03.assetmeta.json`;
    const metadata = JSON.parse(await readFile(path.join(root, metadataPath), "utf8"));
    const runtimePath = path.join(root, "public/game/world", metadata.asset);
    const masterPath = path.join(root, metadata.source_master);
    const runtime = await readFile(runtimePath);
    const master = await readFile(masterPath);

    assert.match(metadata.purpose, /no baked live enemies/i, metadataPath);
    assert.equal(runtime.length, metadata.bytes, metadataPath);
    assert.equal(master.length, metadata.source_bytes, metadataPath);
    assert.equal(createHash("sha256").update(runtime).digest("hex"), metadata.sha256, metadataPath);
    assert.equal(createHash("sha256").update(master).digest("hex"), metadata.sha256_source_png, metadataPath);
  }
});

test("source masters are committed and all legacy demo raster assets are absent", async () => {
  const masters = [
    ["art-source/tri-relay/world-city-p-v02-master.png", 941, 1672],
    ["art-source/tri-relay/world-city-l-v02-master.png", 1920, 1080],
    ["art-source/tri-relay/world-city-p-v03-master.png", 941, 1672],
    ["art-source/tri-relay/world-city-l-v03-master.png", 1920, 1080],
  ];
  for (const [relativePath, width, height] of masters) {
    const buffer = await readFile(path.join(root, relativePath));
    assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], relativePath);
    assert.equal(buffer.readUInt32BE(16), width, relativePath);
    assert.equal(buffer.readUInt32BE(20), height, relativePath);
  }

  const retiredPaths = [
    "public/game/bg",
    "public/game/source",
    "public/game/marketing/promo-og-l-v01.webp",
    "public/game/video/tri-relay-ambient-teaser-p-v01.mp4",
    "public/game/icons/icon-512-v02.png",
  ];
  for (const relativePath of retiredPaths) {
    await assert.rejects(access(path.join(root, relativePath)), undefined, relativePath);
  }
});

test("interface fonts are local WOFF2 files with no Google font dependency", async () => {
  const fontFiles = [
    "app/fonts/geist-sans-latin-v01.woff2",
    "app/fonts/geist-mono-latin-v01.woff2",
  ];
  for (const fontFile of fontFiles) {
    const buffer = await readFile(path.join(root, fontFile));
    assert.equal(buffer.subarray(0, 4).toString("ascii"), "wOF2", fontFile);
    assert.ok(buffer.length > 20_000, `${fontFile} is unexpectedly small`);
  }

  const layout = await readFile(path.join(root, "app/layout.tsx"), "utf8");
  assert.match(layout, /next\/font\/local/);
  assert.ok(!layout.includes("next/font/google"));
});
