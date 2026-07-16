import { spawnSync } from "node:child_process";

const explicitTarget = process.env.BUILD_TARGET?.trim().toLowerCase();
const isVercel =
  process.env.VERCEL === "1" || process.env.VERCEL === "true";
const target = explicitTarget || (isVercel ? "vercel" : "sites");

if (target !== "vercel" && target !== "sites") {
  console.error(
    `Unsupported BUILD_TARGET ${JSON.stringify(target)}. Use "vercel" or "sites".`,
  );
  process.exit(64);
}

console.log(`Building TRI RELAY for ${target}...`);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npm, ["run", `build:${target}`], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
