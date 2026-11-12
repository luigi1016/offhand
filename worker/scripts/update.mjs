// Brings a copy of offhand up to date. Run by the "Update offhand" action in a copy:
//   node latest/worker/scripts/update.mjs <the copy> <the latest worker directory>
// It replaces the copy's code with the latest, keeps the Worker name and KV id Cloudflare
// wrote at install, and pushes. Cloudflare redeploys the Worker when it sees the push.
// It never touches .github: the action's token is not allowed to change actions.

import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { carryPackage, carryWrangler } from "./carry-over.mjs";

const [copy, latest] = process.argv.slice(2).map((p) => resolve(p));
if (!copy || !latest) throw new Error("usage: update.mjs <the copy> <the latest worker directory>");

const KEEP = new Set([".git", ".github", "node_modules"]);
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const text = (dir, file) => readFileSync(join(dir, file), "utf8");

// Worked out before anything is touched, so a failure here leaves the copy as it was.
const wrangler = carryWrangler(text(latest, "wrangler.jsonc"), text(copy, "wrangler.jsonc"));
const pkg = carryPackage(text(latest, "package.json"), text(copy, "package.json"));

for (const entry of readdirSync(copy)) if (!KEEP.has(entry)) rmSync(join(copy, entry), { recursive: true, force: true });
for (const entry of readdirSync(latest)) if (!KEEP.has(entry)) cpSync(join(latest, entry), join(copy, entry), { recursive: true });
writeFileSync(join(copy, "wrangler.jsonc"), wrangler);
writeFileSync(join(copy, "package.json"), pkg);

git(copy, "add", "-A");
if (!git(copy, "status", "--porcelain")) {
  console.log("Already up to date. Nothing changed.");
  process.exit(0);
}

const version = git(latest, "rev-parse", "--short", "HEAD");
const branch = git(copy, "rev-parse", "--abbrev-ref", "HEAD");
git(
  copy,
  "-c", "user.name=github-actions[bot]",
  "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
  "commit", "-m", `Update offhand to ${version}`,
);
git(copy, "push", "origin", `HEAD:${branch}`);
console.log(`Updated to ${version}. Cloudflare redeploys your Worker in about a minute.`);
