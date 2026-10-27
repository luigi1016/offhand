// offhand on Cloudflare Workers. Three routes, no state.

import { handleMcp } from "./inputs/mcp";
import { handleSay } from "./inputs/say";
import { makeIntents } from "./intents";
import { handleSetup } from "./setup";
import { RomaStore } from "./store/roma";
import type { ItemStore } from "./store/types";

export interface Env {
  // secrets, set with `wrangler secret put` or in the Deploy to Cloudflare flow
  ROMA_API_KEY: string;
  OFFHAND_TOKEN: string;
  ANTHROPIC_API_KEY?: string; // only for POST /say
  // vars, in wrangler.jsonc
  DEFAULT_LIST: string;
  TIME_ZONE: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const missing = ["ROMA_API_KEY", "OFFHAND_TOKEN"].filter((k) => !env[k as keyof Env]);
    if (missing.length) return new Response(`offhand: set the secrets ${missing.join(", ")}`, { status: 500 });

    const store: ItemStore = new RomaStore(env.ROMA_API_KEY);
    const intents = makeIntents(store, {
      defaultList: env.DEFAULT_LIST || "tasks",
      timeZone: env.TIME_ZONE || "UTC",
    });

    const path = new URL(req.url).pathname;
    try {
      if (path === "/mcp") return await handleMcp(req, intents, env.OFFHAND_TOKEN);
      if (path === "/say") return await handleSay(req, intents, env.ANTHROPIC_API_KEY);
      if (path === "/setup") return await handleSetup(req, store, env.OFFHAND_TOKEN, env.DEFAULT_LIST || "tasks");
      if (path === "/") return new Response("offhand. Open /setup.", { headers: { "content-type": "text/plain" } });
      return new Response("not found", { status: 404 });
    } catch (e) {
      return Response.json({ ok: false, say: "Something failed. Nothing changed.", reason: "error", detail: String(e) }, { status: 502 });
    }
  },
};
