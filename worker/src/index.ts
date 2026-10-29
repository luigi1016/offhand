// offhand on Cloudflare Workers. Stateless per request; the little state there is
// (the token, Roma's sign-in) lives in one KV namespace.

import { authorized, loadToken, makeToken, type KV } from "./auth";
import { handleMcp } from "./inputs/mcp";
import { handleSay } from "./inputs/say";
import { makeIntents } from "./intents";
import { renderFirstVisit, renderNoToken, renderPlain, renderSetup } from "./setup";
import { RomaStore } from "./store/roma";
import { NotConnected, RomaAuth, keyBearer } from "./store/roma-auth";
import type { ItemStore } from "./store/types";

export interface Env {
  // KV, in wrangler.jsonc. Holds the token and Roma's sign-in. Optional when both secrets below are set.
  OFFHAND_KV?: KV;
  // secrets, set with `wrangler secret put` or on the Deploy to Cloudflare screen
  OFFHAND_TOKEN?: string; // optional: made on first visit when unset
  ROMA_API_KEY?: string; // optional: sign in on the setup page instead
  ANTHROPIC_API_KEY?: string; // only for POST /say
  // vars, in wrangler.jsonc
  DEFAULT_LIST: string;
  TIME_ZONE: string;
  SAY_MODEL?: string; // POST /say: which Claude model picks the intent
  SAY_EFFORT?: string; // POST /say: low | medium | high | xhigh | max
  SAY_MAX_TOKENS?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = `${url.protocol}//${url.host}`;
    const path = url.pathname;
    const kv = env.OFFHAND_KV;

    if (!kv && !(env.OFFHAND_TOKEN && env.ROMA_API_KEY)) {
      return renderPlain("Bind the OFFHAND_KV namespace, or set both OFFHAND_TOKEN and ROMA_API_KEY.", 500);
    }

    // The token: set at deploy time, or made on the first visit to / and shown once.
    let token = await loadToken(env, kv);
    if (path === "/") {
      if (!token) {
        token = await makeToken(kv);
        if (!token) return renderPlain("No token and nowhere to keep one.", 500);
        return renderFirstVisit(origin, token);
      }
      return renderNoToken(origin);
    }
    if (!token) return renderPlain(`Not set up yet. Open ${origin}/ first.`, 503);

    // The item store: an API key wins; otherwise Roma's sign-in from the setup page.
    const romaAuth = env.ROMA_API_KEY ? null : new RomaAuth(kv as KV);
    const store: ItemStore = new RomaStore(romaAuth ?? keyBearer(env.ROMA_API_KEY as string));
    const defaultList = env.DEFAULT_LIST || "tasks";
    const intents = makeIntents(store, { defaultList, timeZone: env.TIME_ZONE || "UTC" });

    const setupState = async (notice?: string) =>
      renderSetup(
        {
          origin,
          token: token as string,
          tokenFromEnv: Boolean(env.OFFHAND_TOKEN),
          store,
          roma: { mode: romaAuth ? "oauth" : "key", connected: romaAuth ? await romaAuth.connected() : true },
          defaultList,
        },
        notice,
      );

    try {
      if (path === "/mcp") return await handleMcp(req, intents, token);
      if (path === "/say")
        return await handleSay(req, intents, {
          token,
          apiKey: env.ANTHROPIC_API_KEY,
          model: env.SAY_MODEL || "claude-opus-5-5",
          effort: env.SAY_EFFORT || "low",
          maxTokens: Number(env.SAY_MAX_TOKENS) || 1024,
          timeZone: env.TIME_ZONE || "UTC",
        });

      if (path === "/setup") {
        if (!authorized(req, token)) return renderNoToken(origin);
        if (req.method === "POST") {
          const action = String((await req.formData()).get("action") ?? "");
          if (action === "disconnect" && romaAuth) {
            await romaAuth.disconnect();
            return setupState("Roma disconnected.");
          }
          if (action === "rotate") {
            if (env.OFFHAND_TOKEN) return setupState("The token is set at deploy time. Change it there.");
            const next = await makeToken(kv);
            return Response.redirect(`${origin}/setup?t=${encodeURIComponent(next as string)}`, 303);
          }
        }
        return setupState();
      }

      if (path === "/oauth/start") {
        if (!authorized(req, token)) return renderNoToken(origin);
        if (!romaAuth) return renderPlain("Roma is connected with an API key; nothing to sign in to.");
        return Response.redirect(await romaAuth.startUrl(origin), 302);
      }
      if (path === "/oauth/callback") {
        if (!romaAuth) return renderPlain("Roma is connected with an API key.");
        await romaAuth.callback(origin, url.searchParams);
        return Response.redirect(`${origin}/setup?t=${encodeURIComponent(token)}`, 303);
      }

      return new Response("not found", { status: 404 });
    } catch (e) {
      if (e instanceof NotConnected) {
        return Response.json({ ok: false, say: e.message, reason: "error" }, { status: 503 });
      }
      return Response.json({ ok: false, say: "Something failed. Nothing changed.", reason: "error", detail: String(e) }, { status: 502 });
    }
  },
};
