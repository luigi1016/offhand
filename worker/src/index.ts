// offhand on Cloudflare Workers. Stateless per request; the little state there is
// (the token, Roma's sign-in, the time zone) lives in one KV namespace.

import { authorized, loadToken, makeToken, type KV } from "./auth";
import { handleMcp } from "./inputs/mcp";
import { handleSay } from "./inputs/say";
import { makeIntents } from "./intents";
import { renderNoToken, renderPlain, renderSetup, renderWelcome } from "./setup";
import { RomaStore } from "./store/roma";
import { NotConnected, RomaAuth, isClaim, keyBearer } from "./store/roma-auth";
import type { ItemStore } from "./store/types";

// The browser's time zone, sent along when Roma is connected. TIME_ZONE, when set, wins.
const TZ_KEY = "offhand.tz";

export interface Env {
  // KV, in wrangler.jsonc. Holds the token and Roma's sign-in. Optional when both secrets below are set.
  OFFHAND_KV?: KV;
  // secrets, set with `wrangler secret put` or on the Deploy to Cloudflare screen
  OFFHAND_TOKEN?: string; // optional: made when Roma is first connected
  ROMA_API_KEY?: string; // optional: sign in on the setup page instead
  ANTHROPIC_API_KEY?: string; // only for POST /say
  // vars, all optional; wrangler.jsonc sets none so that Deploy to Cloudflare asks for none
  DEFAULT_LIST?: string; // where unlisted items go; "tasks" when unset
  TIME_ZONE?: string; // an IANA zone; the browser's, from when Roma was connected, when unset
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

    // The token: set at deploy time, or made when the first Roma sign-in finishes. It is never
    // handed to a visitor: a robot that opens / before the owner gets a page with a button.
    let token = await loadToken(env, kv);
    // The item store: an API key wins; otherwise Roma's sign-in.
    const romaAuth = env.ROMA_API_KEY ? null : new RomaAuth(kv as KV);

    if (path === "/") {
      if (token) return renderNoToken(origin);
      if (!romaAuth) return renderPlain("ROMA_API_KEY is set, so there is no sign-in to make a token from. Set OFFHAND_TOKEN as well.", 500);
      return renderWelcome();
    }

    const store: ItemStore = new RomaStore(romaAuth ?? keyBearer(env.ROMA_API_KEY as string));
    const defaultList = env.DEFAULT_LIST || "tasks";
    const timeZone = env.TIME_ZONE || (kv && (await kv.get(TZ_KEY))) || "UTC";
    const intents = makeIntents(store, { defaultList, timeZone });

    const setupState = async (notice?: string) =>
      renderSetup(
        {
          origin,
          token: token as string,
          tokenFromEnv: Boolean(env.OFFHAND_TOKEN),
          store,
          roma: { mode: romaAuth ? "oauth" : "key", connected: romaAuth ? await romaAuth.connected() : true },
          defaultList,
          timeZone,
        },
        notice,
      );

    try {
      if (path === "/oauth/start") {
        if (!romaAuth) return renderPlain("Roma is connected with an API key; nothing to sign in to.");
        // Before there is a token anyone may start: finishing the sign-in is what makes one.
        if (token && !authorized(req, token)) return renderNoToken(origin);
        const tz = url.searchParams.get("tz");
        if (tz && validZone(tz)) await (kv as KV).put(TZ_KEY, tz);
        return Response.redirect(await romaAuth.startUrl(origin, !token), 302);
      }
      if (path === "/oauth/callback") {
        // A browser lands here, so failures are a page, not JSON.
        if (!romaAuth) return renderPlain("Roma is connected with an API key.");
        const again = token ? "Go back to your setup page and try again." : `Open ${origin}/ and try again.`;
        const denied = url.searchParams.get("error");
        if (denied) return renderPlain(`Roma sign-in did not finish (${denied}). ${again}`, 400);
        // Someone who started before the owner must not finish after them and be sent to the setup page.
        if (token && isClaim(url.searchParams.get("state") ?? "")) {
          return renderPlain("This offhand is already set up. Open your setup page.", 409);
        }
        try {
          await romaAuth.callback(origin, url.searchParams);
        } catch (e) {
          return renderPlain(`Roma sign-in failed: ${e instanceof Error ? e.message : String(e)}. ${again}`, 400);
        }
        token ??= await makeToken(kv);
        return Response.redirect(`${origin}/setup?t=${encodeURIComponent(token as string)}`, 303);
      }

      if (!token) return renderPlain(`Not set up yet. Open ${origin}/ first.`, 503);

      if (path === "/mcp") return await handleMcp(req, intents, token);
      if (path === "/say")
        return await handleSay(req, intents, {
          token,
          apiKey: env.ANTHROPIC_API_KEY,
          model: env.SAY_MODEL || "claude-opus-5-5",
          effort: env.SAY_EFFORT || "low",
          maxTokens: Number(env.SAY_MAX_TOKENS) || 1024,
          timeZone,
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

      return new Response("not found", { status: 404 });
    } catch (e) {
      if (e instanceof NotConnected) {
        return Response.json({ ok: false, say: e.message, reason: "error" }, { status: 503 });
      }
      return Response.json({ ok: false, say: "Something failed. Nothing changed.", reason: "error", detail: String(e) }, { status: 502 });
    }
  },
};

function validZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
