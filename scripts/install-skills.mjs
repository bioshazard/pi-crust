import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "crust-skills.json"), "utf8"));
const checkout = resolve(root, ".crust/dependencies/mattpocock-skills");
rmSync(checkout, { recursive: true, force: true });
mkdirSync(checkout, { recursive: true });
execFileSync("git", ["init", "--quiet"], { cwd: checkout, stdio: "inherit" });
execFileSync("git", ["remote", "add", "origin", manifest.source], { cwd: checkout, stdio: "inherit" });
execFileSync("git", ["fetch", "--quiet", "--depth=1", "origin", manifest.revision], { cwd: checkout, stdio: "inherit" });
execFileSync("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], { cwd: checkout, stdio: "inherit" });
const cli = resolve(root, "node_modules/.bin/skills");
execFileSync(cli, ["add", checkout, "--agent", "pi", "--skill", ...manifest.skills, "--copy", "--yes"], { cwd: root, stdio: "inherit" });
const lockPath = resolve(root, "skills-lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
for (const skill of Object.values(lock.skills)) {
  skill.source = `${manifest.source}#${manifest.revision}`;
  skill.sourceType = "git";
}
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
