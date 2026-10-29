// Signing in to Roma from the setup page: OAuth 2.1 with PKCE and dynamic client
// registration, as https://roma.app/developers/authentication describes.
// Tokens live in KV. An API key, when set, bypasses all of this (see keyBearer).

import { base64url, randomToken, type KV } from "../auth";

export const ROMA_RESOURCE = "https://api.roma.app";
const PROTECTED_RESOURCE = `${ROMA_RESOURCE}/.well-known/oauth-protected-resource`;

// What a store needs: a bearer for the next call. `fresh` means the last one was refused.
export interface Bearer {
  token(fresh?: boolean): Promise<string>;
}

export function keyBearer(apiKey: string): Bearer {
  return { token: async () => apiKey };
}

export class NotConnected extends Error {
  constructor() {
    super("Roma is not connected. Open the setup page and connect it.");
  }
}

interface Meta {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
}

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // ms since epoch
}

const K = {
  meta: "roma.meta",
  client: "roma.client",
  tokens: "roma.tokens",
  pending: (state: string) => `roma.pending.${state}`,
};

export class RomaAuth implements Bearer {
  constructor(private readonly kv: KV) {}

  async connected(): Promise<boolean> {
    return (await this.kv.get(K.tokens)) !== null;
  }

  async disconnect(): Promise<void> {
    await this.kv.delete(K.tokens);
  }

  // The URL to send the person to. Registers this Worker as a client the first time.
  async startUrl(origin: string): Promise<string> {
    const meta = await this.meta();
    const clientId = await this.clientId(meta, origin);
    const verifier = randomToken();
    const state = randomToken();
    await this.kv.put(K.pending(state), verifier, { expirationTtl: 600 });
    const url = new URL(meta.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri(origin));
    url.searchParams.set("code_challenge", await s256(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", "openid email offline_access");
    url.searchParams.set("resource", ROMA_RESOURCE);
    return url.toString();
  }

  // Back from Roma with ?code=&state=. Trades the code for tokens.
  async callback(origin: string, params: URLSearchParams): Promise<void> {
    const state = params.get("state") ?? "";
    const code = params.get("code") ?? "";
    const verifier = state ? await this.kv.get(K.pending(state)) : null;
    if (!verifier || !code) throw new Error("sign-in did not match a pending request; start again");
    await this.kv.delete(K.pending(state));
    const meta = await this.meta();
    const clientId = await this.clientId(meta, origin);
    const tokens = await this.tokenRequest(meta, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(origin),
      client_id: clientId,
      code_verifier: verifier,
      resource: ROMA_RESOURCE,
    });
    await this.kv.put(K.tokens, JSON.stringify(tokens));
  }

  async token(fresh = false): Promise<string> {
    const raw = await this.kv.get(K.tokens);
    if (!raw) throw new NotConnected();
    const tokens = JSON.parse(raw) as Tokens;
    const expiring = tokens.expires_at - Date.now() < 60_000;
    if (!fresh && !expiring) return tokens.access_token;

    const meta = await this.meta();
    const clientId = await this.clientId(meta);
    let next: Tokens;
    try {
      next = await this.tokenRequest(meta, {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: clientId,
        resource: ROMA_RESOURCE,
      });
    } catch (e) {
      // A 400 here means the grant is gone: sign in again.
      await this.kv.delete(K.tokens);
      throw new NotConnected();
    }
    await this.kv.put(K.tokens, JSON.stringify(next));
    return next.access_token;
  }

  private async tokenRequest(meta: Meta, form: Record<string, string>): Promise<Tokens> {
    const res = await fetch(meta.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(form).toString(),
    });
    const body = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !body.access_token) throw new Error(`roma token: ${res.status} ${body.error ?? ""}`.trim());
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token ?? form.refresh_token,
      expires_at: Date.now() + (body.expires_in ?? 3600) * 1000,
    };
  }

  // Discovery: the protected resource names its authorization server, which names its endpoints.
  private async meta(): Promise<Meta> {
    const cached = await this.kv.get(K.meta);
    if (cached) return JSON.parse(cached) as Meta;
    const pr = (await getJson(PROTECTED_RESOURCE)) as { authorization_servers?: string[] };
    const issuer = pr.authorization_servers?.[0];
    if (!issuer) throw new Error("roma discovery: no authorization server");
    const as = (await getJson(metadataUrl(issuer))) as Partial<Meta>;
    if (!as.authorization_endpoint || !as.token_endpoint || !as.registration_endpoint) {
      throw new Error("roma discovery: incomplete authorization server metadata");
    }
    const meta: Meta = {
      authorization_endpoint: as.authorization_endpoint,
      token_endpoint: as.token_endpoint,
      registration_endpoint: as.registration_endpoint,
    };
    await this.kv.put(K.meta, JSON.stringify(meta), { expirationTtl: 86_400 });
    return meta;
  }

  // Dynamic client registration (RFC 7591), once per deployment.
  private async clientId(meta: Meta, origin?: string): Promise<string> {
    const cached = await this.kv.get(K.client);
    if (cached) return cached;
    if (!origin) throw new NotConnected();
    const res = await fetch(meta.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        client_name: "offhand",
        client_uri: origin,
        redirect_uris: [redirectUri(origin)],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
    });
    const body = (await res.json()) as { client_id?: string };
    if (!res.ok || !body.client_id) throw new Error(`roma registration: ${res.status}`);
    await this.kv.put(K.client, body.client_id);
    return body.client_id;
  }
}

export function redirectUri(origin: string): string {
  return `${origin}/oauth/callback`;
}

// RFC 8414 places the metadata under the issuer's host, before any path.
function metadataUrl(issuer: string): string {
  const u = new URL(issuer);
  const path = u.pathname.replace(/\/$/, "");
  return `${u.origin}/.well-known/oauth-authorization-server${path}`;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}
