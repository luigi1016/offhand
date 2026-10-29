# offhand worker

The Cloudflare Worker. Stateless: every request carries everything it needs.

## Routes

| Route | Who calls it | What it does |
|---|---|---|
| `GET /` | you, once after deploying | makes your token and shows it once |
| `GET /setup?t=<token>` | you | connect Roma, copy the URL and header to paste, see your lists, rotate the token |
| `GET /oauth/start`, `/oauth/callback` | the setup page | Roma sign-in (OAuth 2.1, PKCE) |
| `POST /mcp` | a device's own agent | the four intents as MCP tools, bearer auth |
| `POST /say` | a device without an agent | text in, Claude picks the intent, report out; same bearer |

## Secrets and variables

Secrets are set once and never written to a file in this repo. All three are optional.

| Name | Kind | What it is |
|---|---|---|
| `OFFHAND_TOKEN` | secret, optional | the token your devices send. Leave unset and offhand makes one on your first visit to `/` |
| `ROMA_API_KEY` | secret, optional | a Roma API key (Settings, Connections). Leave unset and sign in on the setup page instead |
| `ANTHROPIC_API_KEY` | secret, optional | only for `POST /say` |
| `OFFHAND_KV` | KV binding | holds the token and Roma's sign-in. Needed unless both secrets above are set |
| `DEFAULT_LIST` | var | where unlisted items go; a list name or `tasks` |
| `TIME_ZONE` | var | for "due today" and "tonight"; an IANA zone |
| `SAY_MODEL` | var | `POST /say` only: the Claude model that picks the intent |
| `SAY_EFFORT` | var | `POST /say` only: `low`, `medium`, `high`, `xhigh` or `max` |
| `SAY_MAX_TOKENS` | var | `POST /say` only |

## Run it

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in locally, this file is gitignored
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
| your token | a Worker secret, or the `offhand.token` key in KV | the Worker only |
| Roma's access and refresh tokens | KV, `roma.tokens` | the Worker only |
| the MCP URL and header | your device's app | you |

Nothing is stored on your computer. Losing the token: set `OFFHAND_TOKEN`, or delete `offhand.token` from KV and open `/` again.

## Layout

```
src/index.ts          routes and env
src/auth.ts           the token: made once, checked on every call
src/setup.ts          the setup page
src/intents.ts        the four intents, typed results
src/tools.ts          the intents as tools: names, descriptions, schemas
src/inputs/mcp.ts     MCP over Streamable HTTP
src/inputs/say.ts     text in, Claude picks the tool
src/store/types.ts    the ItemStore interface
src/store/roma.ts     Roma, the first store
src/store/roma-auth.ts  Roma sign-in: OAuth 2.1 with PKCE, tokens in KV
test/                 the intents, the MCP input, the router and the sign-in against fakes
```

The contract these implement is in [docs/contract.md](../docs/contract.md).
