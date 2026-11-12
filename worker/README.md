# offhand worker

The Cloudflare Worker. Stateless: every request carries everything it needs.

## Routes

| Route | Who calls it | What it does |
|---|---|---|
| `GET /` | you, once after deploying | a Connect Roma button. Shows nothing secret, so it does not matter who opens it first |
| `GET /setup?t=<token>` | you | connect Roma, copy the URL and header to paste, see your lists, rotate the token |
| `GET /oauth/start`, `/oauth/callback` | `/` and the setup page | Roma sign-in (OAuth 2.1, PKCE). The first one to finish makes your token and lands on the setup page |
| `POST /mcp` | a device's own agent | the four intents as MCP tools over Streamable HTTP (not SSE), bearer auth |
| `POST /say` | a device without an agent | text in, Claude picks the intent, report out; same bearer |

## Secrets and variables

Secrets are set once and never written to a file in this repo. All three are optional, and so is every variable: `wrangler.jsonc` sets none, because Deploy to Cloudflare shows a box for each one it finds. To change a variable, set it in the Cloudflare dashboard (the Worker, Settings, Variables and Secrets). `keep_vars` makes it survive deploys and updates.

| Name | Kind | What it is |
|---|---|---|
| `OFFHAND_TOKEN` | secret, optional | the token your devices send. Leave unset and offhand makes one when you connect Roma. Required when `ROMA_API_KEY` is set, since there is then no sign-in to make one from |
| `ROMA_API_KEY` | secret, optional | a Roma API key (Settings, Connections). Leave unset and sign in on the setup page instead |
| `ANTHROPIC_API_KEY` | secret, optional | only for `POST /say` |
| `OFFHAND_KV` | KV binding | holds the token, Roma's sign-in and the time zone. Needed unless both secrets above are set |
| `DEFAULT_LIST` | var, optional | where unlisted items go; a list name or `tasks` (the default) |
| `TIME_ZONE` | var, optional | for "due today" and "tonight"; an IANA zone. Unset, it is your browser's, sent along when you connect Roma |
| `SAY_MODEL` | var, optional | `POST /say` only: the Claude model that picks the intent; `claude-opus-5-5` by default |
| `SAY_EFFORT` | var, optional | `POST /say` only: `low` (the default), `medium`, `high`, `xhigh` or `max` |
| `SAY_MAX_TOKENS` | var, optional | `POST /say` only; 1024 by default |

## Run it

```bash
npm install
cp .dev.vars.example .dev.vars   # uncomment and fill in locally, this file is gitignored
npm run dev
```

Then `npm test` for the tests and `npm run typecheck`.

## Deploy by hand

```bash
npx wrangler kv namespace create OFFHAND_KV
```

Paste the id it prints into `kv_namespaces` in `wrangler.jsonc`, then `npm run deploy` and open the URL it prints.
To skip the setup page's sign-in and token, set the secrets instead: `npx wrangler secret put ROMA_API_KEY`, `npx wrangler secret put OFFHAND_TOKEN`.

## What is stored where

| What | Where | Readable by |
|---|---|---|
| your token | a Worker secret, or the `offhand.token` key in KV | the Worker, and anyone who can open your Cloudflare account |
| Roma's access and refresh tokens | KV, `roma.tokens` | the Worker, and anyone who can open your Cloudflare account |
| your time zone | KV, `offhand.tz` | the same |
| the MCP URL and header | your device's app | you |

Nothing is stored on your computer. Losing the token, or finding the Worker set up by someone else: delete `offhand.token` from KV, open `/` and connect Roma again. Or set `OFFHAND_TOKEN`.

## Layout

```
src/index.ts          routes and env
src/auth.ts           the token: made when Roma is first connected, checked on every call
src/setup.ts          the setup page
src/intents.ts        the four intents, typed results
src/tools.ts          the intents as tools: names, descriptions, schemas
src/inputs/mcp.ts     MCP over Streamable HTTP
src/inputs/say.ts     text in, Claude picks the tool
src/store/types.ts    the ItemStore interface
src/store/roma.ts     Roma, the first store
src/store/roma-auth.ts  Roma sign-in: OAuth 2.1 with PKCE, tokens in KV
scripts/update.mjs    brings a copy up to date; run by the "Update offhand" action (INSTALL.md)
scripts/carry-over.mjs  what a copy keeps across an update: its Worker name and KV id
test/                 the intents, the MCP input, the router, the sign-in and the update against fakes
```

The contract these implement is in [docs/contract.md](../docs/contract.md).
