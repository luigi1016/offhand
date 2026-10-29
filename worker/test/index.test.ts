// The router: the token is made once and shown once, a deploy-time token wins, and the
// setup page and oauth routes are gated.

import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";
import { FakeKV } from "./fakes";

function env(over: Partial<Env> = {}): Env {
  return { OFFHAND_KV: new FakeKV(), DEFAULT_LIST: "tasks", TIME_ZONE: "UTC", ...over };
}

const get = (path: string) => new Request(`https://offhand.test${path}`);

describe("the token", () => {
  it("is made on the first visit to /, shown once, and kept in KV", async () => {
    const e = env();
    const first = await worker.fetch(get("/"), e);
    expect(first.status).toBe(200);
    const page = await first.text();
    const stored = (e.OFFHAND_KV as FakeKV).data.get("offhand.token");
    expect(stored).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(page).toContain(stored);

    const second = await worker.fetch(get("/"), e);
    expect(await second.text()).not.toContain(stored);
  });

  it("is the deploy-time secret when one is set, and nothing is written to KV", async () => {
    const e = env({ OFFHAND_TOKEN: "chosen" });
    const page = await (await worker.fetch(get("/"), e)).text();
    expect(page).not.toContain("chosen");
    expect((e.OFFHAND_KV as FakeKV).data.size).toBe(0);
    expect((await worker.fetch(get("/setup?t=chosen"), e)).status).toBe(200);
  });

  it("gates /mcp, /say and /setup until it exists", async () => {
    const e = env();
    const post = (path: string) => new Request(`https://offhand.test${path}`, { method: "POST", body: "{}" });
    expect((await worker.fetch(post("/mcp"), e)).status).toBe(503);
    expect((await worker.fetch(post("/say"), e)).status).toBe(503);
    expect((await worker.fetch(get("/setup"), e)).status).toBe(503);
  });

  it("can be rotated from the setup page, but not when set at deploy time", async () => {
    const e = env();
    await worker.fetch(get("/"), e);
    const kv = e.OFFHAND_KV as FakeKV;
    const old = kv.data.get("offhand.token") as string;
    const form = new URLSearchParams({ action: "rotate" });
    const res = await worker.fetch(
      new Request(`https://offhand.test/setup?t=${old}`, { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } }),
      e,
    );
    expect(res.status).toBe(303);
    const next = kv.data.get("offhand.token") as string;
    expect(next).not.toBe(old);
    expect(res.headers.get("location")).toContain(next);

    const fixed = env({ OFFHAND_TOKEN: "chosen" });
    const refused = await worker.fetch(
      new Request("https://offhand.test/setup?t=chosen", { method: "POST", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } }),
      fixed,
    );
    expect(refused.status).toBe(200);
    expect(await refused.text()).toContain("set at deploy time");
  });
});

describe("the setup page", () => {
  it("needs the token", async () => {
    const e = env({ OFFHAND_TOKEN: "chosen" });
    const page = await (await worker.fetch(get("/setup?t=wrong"), e)).text();
    expect(page).not.toContain("Bearer chosen");
    expect(page).toContain("Open this page with your token");
  });

  it("shows the paste values and a Connect Roma button when no key is set", async () => {
    const e = env({ OFFHAND_TOKEN: "chosen" });
    const page = await (await worker.fetch(get("/setup?t=chosen"), e)).text();
    expect(page).toContain("https://offhand.test/mcp");
    expect(page).toContain("Bearer chosen");
    expect(page).toContain("/oauth/start?t=chosen");
  });

  it("says the store is connected with a key when ROMA_API_KEY is set, and never prints it", async () => {
    const e = env({ OFFHAND_TOKEN: "chosen", ROMA_API_KEY: "roma_secret" });
    const page = await (await worker.fetch(get("/setup?t=chosen"), e)).text();
    expect(page).toContain("API key set at deploy time");
    expect(page).not.toContain("roma_secret");
    expect(page).not.toContain("/oauth/start");
  });
});

describe("oauth routes", () => {
  it("/oauth/start needs the token", async () => {
    const e = env({ OFFHAND_TOKEN: "chosen" });
    const res = await worker.fetch(get("/oauth/start?t=wrong"), e);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Open this page with your token");
  });

  it("/oauth/callback with no pending state does not store anything", async () => {
    const e = env({ OFFHAND_TOKEN: "chosen" });
    const res = await worker.fetch(get("/oauth/callback?code=x&state=y"), e);
    expect(res.status).toBe(502);
    expect((e.OFFHAND_KV as FakeKV).data.has("roma.tokens")).toBe(false);
  });
});

describe("without KV", () => {
  it("works when both secrets are set", async () => {
    const e: Env = { OFFHAND_TOKEN: "chosen", ROMA_API_KEY: "roma_x", DEFAULT_LIST: "tasks", TIME_ZONE: "UTC" };
    expect((await worker.fetch(get("/"), e)).status).toBe(200);
  });

  it("explains what to do otherwise", async () => {
    const e: Env = { OFFHAND_TOKEN: "chosen", DEFAULT_LIST: "tasks", TIME_ZONE: "UTC" };
    const res = await worker.fetch(get("/"), e);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("OFFHAND_KV");
  });
});
