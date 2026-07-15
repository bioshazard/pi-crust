#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const example = resolve(root, "src/eg/pwbot");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write("Usage: npm run pwbot -- [--env-file path]\nDefaults to src/eg/pwbot/.env.dev when present.\n");
  process.exit(0);
}

let envFile;
for (let index = 0; index < args.length; index++) {
  const value = args[index];
  if (value?.startsWith("--env-file=")) envFile = value.slice("--env-file=".length);
  else if (value === "--env-file") envFile = args[++index];
  else throw new Error(`Unknown pwbot option: ${value}`);
}
const selected = envFile ? resolve(process.cwd(), envFile) : resolve(example, ".env.dev");
if (envFile && !existsSync(selected)) throw new Error(`Environment file not found: ${selected}`);
if (existsSync(selected)) process.loadEnvFile(selected);

const result = spawnSync(process.execPath, ["--import", "tsx", resolve(example, "slack.ts")], {
  cwd: example,
  env: process.env,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? (result.signal === "SIGINT" ? 130 : 1);
