// The router: the token is made when Roma sign-in finishes and never handed to a visitor,
// a deploy-time token wins, and the setup page and oauth routes are gated.

import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import { FakeKV } from "./fakes";

function env(over: Partial<Env> = {}): Env {
  return { OFFHAND_KV: new FakeKV(), ...over };
}

const get = (path: string) => new Request(`https://offhand.test${path}`);

// Just enough of Roma for a sign-in to start and finish.
function stubRoma() {
  const AS = "https://auth.roma.test";
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/.well-known/oauth-protected-resource")) return json({ authorization_servers: [AS] });
      if (url.endsWith("/.well-known/oauth-authorization-server"))
        return json({ authorization_endpoint: `${AS}/authorize`, token_endpoint: `${AS}/token`, registration_endpoint: `${AS}/register` });
      if (url === `${AS}/register`) return json({ client_id: "client-123" });
      if (url === `${AS}/token`) return json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 3600 });
      return new Response("not found", { status: 404 });
    }),
  );
}

// Starts a sign-in and returns the state Roma would send back.
async function start(e: Env, path = "/oauth/start"): Promise<string> {
  const res = await worker.fetch(get(path), e);
  expect(res.status).toBe(302);
  return new URL(res.headers.get("location") as string).searchParams.get("state") as string;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the token", () => {
  it("is not made or shown by a visit to /, however many times", async () => {
    const e = env();
    for (let i = 0; i < 2; i++) {
      const res = await worker.fetch(get("/"), e);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("/oauth/start");
    }
    expect((e.OFFHAND_KV as FakeKV).data.size).toBe(0);
  });

  it("is made when the first Roma sign-in finishes, which lands on the setup page", async () => {
    stubRoma();
    const e = env();
    const kv = e.OFFHAND_KV as FakeKV;
    const state = await start(e);
    expect(kv.data.has("offhand.token")).toBe(false);

    const done = await worker.fetch(get(`/oauth/callback?code=c&state=${state}`), e);
    expect(done.status).toBe(303);
    const token = kv.data.get("offhand.token") as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(done.headers.get("location")).toBe(`https://offhand.test/setup?t=${token}`);
    expect(kv.data.has("roma.tokens")).toBe(true);

    const home = await (await worker.fetch(get("/"), e)).text();
    expect(home).not.toContain(token);
    expect(home).toContain("Open this page with your token");
  });

  it("is not given to someone who started signing in before the owner and finishes after", async () => {
    stubRoma();
    const e = env();
    const kv = e.OFFHAND_KV as FakeKV;
    const stranger = await start(e);
    const owner = await start(e);
    await worker.fetch(get(`/oauth/callback?code=c&state=${owner}`), e);
    const token = kv.data.get("offhand.token") as string;
    const roma = kv.data.get("roma.tokens");

    const late = await worker.fetch(get(`/oauth/callback?code=c&state=${stranger}`), e);
    expect(late.status).toBe(409);
    expect(late.headers.get("location")).toBeNull();
    expect(await late.text()).not.toContain(token);
    expect(kv.data.get("offhand.token")).toBe(token);
    expect(kv.data.get("roma.tokens")).toBe(roma);
  });

  it("needs OFFHAND_TOKEN when Roma is an API key, since there is no sign-in to make one from", async () => {
    const e = env({ ROMA_API_KEY: "roma_x" });
    const res = await worker.fetch(get("/"), e);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("OFFHAND_TOKEN");
    expect((e.OFFHAND_KV as FakeKV).data.size).toBe(0);
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
    const kv = e.OFFHAND_KV as FakeKV;
    const old = "old-token";
    kv.data.set("offhand.token", old);
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

  it("says how to set up the Pebble app, and which kind of MCP server to choose", async () => {
    const e = env({ OFFHAND_TOKEN: "chosen" });
    const page = await (await worker.fetch(get("/setup?t=chosen"), e)).text();
    expect(page).toContain("Index agent");
    expect(page).toContain("Notes");
    expect(page).toContain("Streamable");
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
  it("/oauth/start needs the token once there is one", async () => {
    const e = env({ OFFHAND_TOKEN: "chosen" });
    const res = await worker.fetch(get("/oauth/start?t=wrong"), e);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Open this page with your token");
  });

  it("/oauth/callback with no pending state stores nothing and shows a page, not JSON", async () => {
    const e = env({ OFFHAND_TOKEN: "chosen" });
    const res = await worker.fetch(get("/oauth/callback?code=x&state=y"), e);
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("setup page");
    expect((e.OFFHAND_KV as FakeKV).data.has("roma.tokens")).toBe(false);
  });

  it("/oauth/callback explains a sign-in the person cancelled on Roma", async () => {
    const e = env({ OFFHAND_TOKEN: "chosen" });
    const res = await worker.fetch(get("/oauth/callback?error=access_denied"), e);
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("access_denied");
  });
});

describe("the time zone", () => {
  it("comes from the browser when Roma is connected, and the setup page says which", async () => {
    stubRoma();
    const e = env();
    const state = await start(e, "/oauth/start?tz=America%2FLos_Angeles");
    const done = await worker.fetch(get(`/oauth/callback?code=c&state=${state}`), e);
    expect((e.OFFHAND_KV as FakeKV).data.get("offhand.tz")).toBe("America/Los_Angeles");
    const page = await (await worker.fetch(new Request(done.headers.get("location") as string), e)).text();
    expect(page).toContain("America/Los_Angeles");
  });

  it("ignores a zone that is not one, and TIME_ZONE wins when set", async () => {
    stubRoma();
    const e = env({ OFFHAND_TOKEN: "chosen", TIME_ZONE: "Europe/Rome" });
    await start(e, "/oauth/start?t=chosen&tz=Not%2FA_Zone");
    expect((e.OFFHAND_KV as FakeKV).data.has("offhand.tz")).toBe(false);
    await start(e, "/oauth/start?t=chosen&tz=Asia%2FTokyo");
    const page = await (await worker.fetch(get("/setup?t=chosen"), e)).text();
    expect(page).toContain("Europe/Rome");
  });
});

describe("without KV", () => {
  it("works when both secrets are set", async () => {
    const e: Env = { OFFHAND_TOKEN: "chosen", ROMA_API_KEY: "roma_x" };
    expect((await worker.fetch(get("/"), e)).status).toBe(200);
  });

  it("explains what to do otherwise", async () => {
    const e: Env = { OFFHAND_TOKEN: "chosen" };
    const res = await worker.fetch(get("/"), e);
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("OFFHAND_KV");
  });
});
