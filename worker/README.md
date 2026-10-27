# offhand worker

The Cloudflare Worker. Stateless: every request carries everything it needs.

## Routes

| Route | Who calls it | What it does |
|---|---|---|
| `POST /mcp` | a device's own agent | the four intents as MCP tools, bearer auth |
| `POST /say` | a device without an agent | text in, Claude picks the intent, report out |
| `GET /setup?t=<token>` | you, once | shows the URL and header to paste, and the lists it can see |

## Secrets and variables

Secrets are set once and never written to a file in this repo.

| Name | Kind | What it is |
|---|---|---|
| `ROMA_API_KEY` | secret | your task manager's API key (Roma: Settings, Connections, Create key) |
| `OFFHAND_TOKEN` | secret | the token your device sends; any long random string |
| `ANTHROPIC_API_KEY` | secret, optional | only for `POST /say` |
| `DEFAULT_LIST` | var | where unlisted items go; a list name or `tasks` |
| `TIME_ZONE` | var | for "due today"; an IANA zone |

## Run it

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in locally, this file is gitignored
npm run dev
```

Deploy with `npm run deploy`, then `npx wrangler secret put ROMA_API_KEY` and `npx wrangler secret put OFFHAND_TOKEN`.

## Layout

```
src/index.ts          routes and env
src/intents.ts        the four intents, typed results
src/tools.ts          the intents as tools: names, descriptions, schemas
src/inputs/mcp.ts     MCP over Streamable HTTP
src/inputs/say.ts     text in, Claude picks the tool
src/store/types.ts    the ItemStore interface
src/store/roma.ts     Roma, the first store
src/setup.ts          the setup page
```

The contract these implement is in [docs/contract.md](../docs/contract.md).
