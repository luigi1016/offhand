// Roma sign-in against a fake Roma: discovery, registration, the authorize URL, the code
// exchange, and refresh. The real thing is only proven by a deployed Worker and a browser.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotConnected, RomaAuth, keyBearer } from "../src/store/roma-auth";
import { FakeKV } from "./fakes";

const ORIGIN = "https://offhand.test";
const AS = "https://auth.roma.test";

interface Hit {
  url: string;
  body?: string;
}

function fakeRoma(opts: { refreshStatus?: number } = {}) {
  const hits: Hit[] = [];
  let issued = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    hits.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
    if (url === "https://api.roma.app/.well-known/oauth-protected-resource") return json({ resource: "https://api.roma.app", authorization_servers: [AS] });
    if (url === `${AS}/.well-known/oauth-authorization-server`)
      return json({ authorization_endpoint: `${AS}/authorize`, token_endpoint: `${AS}/token`, registration_endpoint: `${AS}/register` });
    if (url === `${AS}/register`) return json({ client_id: "client-123" }, 201);
    if (url === `${AS}/token`) {
      const form = new URLSearchParams(String(init?.body));
      if (form.get("grant_type") === "refresh_token" && opts.refreshStatus) return json({ error: "invalid_grant" }, opts.refreshStatus);
      issued++;
      return json({ access_token: `access-${issued}`, refresh_token: `refresh-${issued}`, expires_in: 3600 });
    }
    return new Response("not found", { status: 404 });
  });
  return { hits, fetchMock };
}

describe("RomaAuth", () => {
  let kv: FakeKV;
  beforeEach(() => {
    kv = new FakeKV();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is not connected until a sign-in completes", async () => {
    const auth = new RomaAuth(kv);
    expect(await auth.connected()).toBe(false);
    await expect(auth.token()).rejects.toBeInstanceOf(NotConnected);
  });

  it("builds the authorize URL with PKCE, state and the resource, registering once", async () => {
    const { hits, fetchMock } = fakeRoma();
    vi.stubGlobal("fetch", fetchMock);
    const auth = new RomaAuth(kv);

    const url = new URL(await auth.startUrl(ORIGIN));
    expect(url.origin + url.pathname).toBe(`${AS}/authorize`);
    expect(url.searchParams.get("client_id")).toBe("client-123");
    expect(url.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/oauth/callback`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("resource")).toBe("https://api.roma.app");
    const state = url.searchParams.get("state") as string;
    expect(kv.data.has(`roma.pending.${state}`)).toBe(true);

    const registration = JSON.parse(hits.find((h) => h.url.endsWith("/register"))?.body ?? "{}");
    expect(registration.redirect_uris).toEqual([`${ORIGIN}/oauth/callback`]);
    expect(registration.token_endpoint_auth_method).toBe("none");

    await auth.startUrl(ORIGIN);
    expect(hits.filter((h) => h.url.endsWith("/register"))).toHaveLength(1);
  });

  it("exchanges the code with the verifier and stores the tokens", async () => {
    const { hits, fetchMock } = fakeRoma();
    vi.stubGlobal("fetch", fetchMock);
    const auth = new RomaAuth(kv);
    const state = new URL(await auth.startUrl(ORIGIN)).searchParams.get("state") as string;
    const verifier = kv.data.get(`roma.pending.${state}`);

    await auth.callback(ORIGIN, new URLSearchParams({ code: "the-code", state }));
    const exchange = new URLSearchParams(hits.find((h) => h.url.endsWith("/token"))?.body);
    expect(exchange.get("grant_type")).toBe("authorization_code");
    expect(exchange.get("code")).toBe("the-code");
    expect(exchange.get("code_verifier")).toBe(verifier);
    expect(exchange.get("client_id")).toBe("client-123");
    expect(kv.data.has(`roma.pending.${state}`)).toBe(false);
    expect(await auth.connected()).toBe(true);
    expect(await auth.token()).toBe("access-1");
  });

  it("rejects a callback whose state it never issued", async () => {
    vi.stubGlobal("fetch", fakeRoma().fetchMock);
    const auth = new RomaAuth(kv);
    await expect(auth.callback(ORIGIN, new URLSearchParams({ code: "x", state: "forged" }))).rejects.toThrow(/start again/);
    expect(await auth.connected()).toBe(false);
  });

  it("refreshes when the access token is about to expire, and on demand", async () => {
    const { hits, fetchMock } = fakeRoma();
    vi.stubGlobal("fetch", fetchMock);
    const auth = new RomaAuth(kv);
    const state = new URL(await auth.startUrl(ORIGIN)).searchParams.get("state") as string;
    await auth.callback(ORIGIN, new URLSearchParams({ code: "c", state }));

    expect(await auth.token()).toBe("access-1");
    const stored = JSON.parse(kv.data.get("roma.tokens") as string);
    stored.expires_at = Date.now() + 10_000;
    kv.data.set("roma.tokens", JSON.stringify(stored));
    expect(await auth.token()).toBe("access-2");
    const refresh = new URLSearchParams(hits.filter((h) => h.url.endsWith("/token")).at(-1)?.body);
    expect(refresh.get("grant_type")).toBe("refresh_token");
    expect(refresh.get("refresh_token")).toBe("refresh-1");

    expect(await auth.token(true)).toBe("access-3");
  });

  it("forgets the sign-in when the refresh is refused", async () => {
    vi.stubGlobal("fetch", fakeRoma({ refreshStatus: 400 }).fetchMock);
    const auth = new RomaAuth(kv);
    const state = new URL(await auth.startUrl(ORIGIN)).searchParams.get("state") as string;
    await auth.callback(ORIGIN, new URLSearchParams({ code: "c", state }));
    await expect(auth.token(true)).rejects.toBeInstanceOf(NotConnected);
    expect(await auth.connected()).toBe(false);
  });

  it("disconnect drops the tokens but keeps the client registration", async () => {
    vi.stubGlobal("fetch", fakeRoma().fetchMock);
    const auth = new RomaAuth(kv);
    const state = new URL(await auth.startUrl(ORIGIN)).searchParams.get("state") as string;
    await auth.callback(ORIGIN, new URLSearchParams({ code: "c", state }));
    await auth.disconnect();
    expect(await auth.connected()).toBe(false);
    expect(kv.data.get("roma.client")).toBe("client-123");
  });
});

describe("keyBearer", () => {
  it("always answers the key", async () => {
    expect(await keyBearer("roma_k").token()).toBe("roma_k");
    expect(await keyBearer("roma_k").token(true)).toBe("roma_k");
  });
});
