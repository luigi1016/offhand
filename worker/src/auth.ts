// The offhand token: the one secret a device sends. Made on first visit and kept in KV,
// unless OFFHAND_TOKEN was set at deploy time, which wins.

export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

const TOKEN_KEY = "offhand.token";

export async function loadToken(env: { OFFHAND_TOKEN?: string }, kv: KV | undefined): Promise<string | null> {
  if (env.OFFHAND_TOKEN) return env.OFFHAND_TOKEN;
  return kv ? kv.get(TOKEN_KEY) : null;
}

// Makes a new token and stores it. Returns null when there is nowhere to keep it.
export async function makeToken(kv: KV | undefined): Promise<string | null> {
  if (!kv) return null;
  const token = randomToken();
  await kv.put(TOKEN_KEY, token);
  return token;
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Bearer header or ?t= query, compared in constant time.
export function authorized(req: Request, token: string | null): boolean {
  if (!token) return false;
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : (new URL(req.url).searchParams.get("t") ?? "");
  return given.length > 0 && timingSafeEqual(given, token);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
