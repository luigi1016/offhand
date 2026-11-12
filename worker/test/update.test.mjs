// The update a copy of offhand runs on itself: what it keeps, what it replaces, and that
// a second run changes nothing. The end-to-end test uses real git against a local remote.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carryPackage, carryWrangler, stripComments } from "../scripts/carry-over.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(here, "..", "scripts", "update.mjs");

const LATEST = `{
  // The Worker's address: "name" and // marks in a comment change nothing.
  "name": "offhand",
  "compatibility_date": "2027-01-01",
  "kv_namespaces": [{ "binding": "OFFHAND_KV", "id": "offhand_kv_placeholder" }]
}
`;
const MINE = `{
  "name": "my-offhand",
  "compatibility_date": "2026-10-01",
  "kv_namespaces": [{ "binding": "OFFHAND_KV", "id": "abc123" }]
}
`;

describe("what a copy keeps", () => {
  it("keeps its Worker name and KV id, and takes the rest from the latest", () => {
    const out = carryWrangler(LATEST, MINE);
    const config = JSON.parse(stripComments(out));
    expect(config.name).toBe("my-offhand");
    expect(config.kv_namespaces[0].id).toBe("abc123");
    expect(config.compatibility_date).toBe("2027-01-01");
    expect(out).toContain("// The Worker's address");
  });

  it("carries over the real wrangler.jsonc", () => {
    const real = readFileSync(join(here, "..", "wrangler.jsonc"), "utf8");
    const config = JSON.parse(stripComments(carryWrangler(real, MINE)));
    expect(config.name).toBe("my-offhand");
    expect(config.kv_namespaces[0].id).toBe("abc123");
    expect(config.keep_vars).toBe(true);
  });

  it("stops when the copy has no KV id, or the latest has no place for one", () => {
    expect(() => carryWrangler(LATEST, `{ "name": "x" }`)).toThrow(/no Worker name or no OFFHAND_KV id/);
    expect(() => carryWrangler(`{ "name": "offhand" }`, MINE)).toThrow(/no place/);
  });

  it("keeps the copy's package name", () => {
    const out = carryPackage(`{\n  "name": "offhand-worker",\n  "version": "0.2.0"\n}\n`, `{ "name": "my-offhand", "version": "0.1.0" }`);
    expect(JSON.parse(out)).toEqual({ name: "my-offhand", version: "0.2.0" });
  });
});

describe("the update, end to end", () => {
  const git = (cwd, ...args) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" }).trim();
  const put = (dir, file, text) => {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  };
  const run = (copy, latest) => execFileSync("node", [SCRIPT, copy, latest], { encoding: "utf8" });

  it("replaces the code, keeps the action and the two values, pushes, then has nothing left to do", () => {
    const root = mkdtempSync(join(tmpdir(), "offhand-update-"));
    const remote = join(root, "remote.git");
    const copy = join(root, "copy");
    const latestRepo = join(root, "latest");
    const latest = join(latestRepo, "worker");

    git(root, "init", "-q", "--bare", "-b", "main", remote);
    git(root, "clone", "-q", remote, copy);
    git(copy, "checkout", "-q", "-b", "main");
    put(copy, "wrangler.jsonc", MINE);
    put(copy, "package.json", `{ "name": "my-offhand", "version": "0.1.0" }\n`);
    put(copy, "src/old.ts", "old\n");
    put(copy, ".github/workflows/update.yml", "name: Update offhand\n");
    git(copy, "add", "-A");
    git(copy, "commit", "-q", "-m", "source repo import");
    git(copy, "push", "-q", "origin", "main");

    git(root, "init", "-q", "-b", "main", latestRepo);
    put(latest, "wrangler.jsonc", LATEST);
    put(latest, "package.json", `{\n  "name": "offhand-worker",\n  "version": "0.2.0"\n}\n`);
    put(latest, "src/new.ts", "new\n");
    git(latestRepo, "add", "-A");
    git(latestRepo, "commit", "-q", "-m", "latest");

    expect(run(copy, latest)).toMatch(/Updated to [0-9a-f]+/);

    const pushed = join(root, "pushed");
    git(root, "clone", "-q", remote, pushed);
    expect(existsSync(join(pushed, "src/new.ts"))).toBe(true);
    expect(existsSync(join(pushed, "src/old.ts"))).toBe(false);
    expect(existsSync(join(pushed, ".github/workflows/update.yml"))).toBe(true);
    const config = JSON.parse(stripComments(readFileSync(join(pushed, "wrangler.jsonc"), "utf8")));
    expect(config).toMatchObject({ name: "my-offhand", compatibility_date: "2027-01-01" });
    expect(config.kv_namespaces[0].id).toBe("abc123");
    expect(JSON.parse(readFileSync(join(pushed, "package.json"), "utf8")).name).toBe("my-offhand");

    expect(run(copy, latest)).toMatch(/Already up to date/);
    expect(git(pushed, "rev-list", "--count", "HEAD")).toBe("2");
  });

  it("leaves the copy untouched when it cannot work out what to keep", () => {
    const root = mkdtempSync(join(tmpdir(), "offhand-update-"));
    const copy = join(root, "copy");
    const latest = join(root, "latest");
    put(copy, "wrangler.jsonc", `{ "name": "x" }`);
    put(copy, "package.json", `{ "name": "x" }`);
    put(copy, "src/old.ts", "old\n");
    put(latest, "wrangler.jsonc", LATEST);
    put(latest, "package.json", `{ "name": "offhand-worker" }`);
    expect(() => execFileSync("node", [SCRIPT, copy, latest], { stdio: "pipe" })).toThrow();
    expect(existsSync(join(copy, "src/old.ts"))).toBe(true);
  });
});
