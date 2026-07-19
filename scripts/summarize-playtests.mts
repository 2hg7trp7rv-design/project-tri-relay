import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizePlaytests } from "../app/game/playtest-summary.ts";
import { parsePlaytestSession } from "../app/game/playtest-session.ts";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function summarizePlaytestFiles(values: unknown[]) {
  const sessions = values
    .map((value) => parsePlaytestSession(value))
    .filter((value) => value !== null)
    .sort((left, right) => left.testerId.localeCompare(right.testerId));
  const inputSha256 = createHash("sha256").update(canonical(sessions)).digest("hex");
  return { ...summarizePlaytests(values), inputSha256 };
}

export function readPlaytestFiles(paths: string[]) {
  return Promise.all(paths.map(async (path) => {
    try {
      return JSON.parse(await readFile(resolve(path), "utf8"));
    } catch {
      // Never surface JSON.parse diagnostics: Node can include the source line,
      // which may contain private interview wording.
      return null;
    }
  }));
}

async function main() {
  const paths = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
  if (!paths.length) {
    console.error("Usage: npm run playtest:summary -- playtests/private/T01.json ... T10.json");
    process.exitCode = 1;
    return;
  }
  const values = await readPlaytestFiles(paths);
  const summary = summarizePlaytestFiles(values);
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.status === "GO" ? 0 : summary.status === "NO-GO" ? 2 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}
