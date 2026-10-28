# The contract

offhand is three layers with two seams. Inputs produce intents. Intents call an item store. Workers watch the store and write back. An input never knows which store is behind it; a store never knows which device spoke.

## Vocabulary

Lists and items. A list has a name and holds items. An item has a title, an optional body, and, on lists that keep one, a status. That is all an intent sees.

## Intents

Every input ends in one of four intents. Each takes plain arguments and returns a result. Intents never ask a question; they report. What to do with the report is the input's job.

| Intent | Arguments | What it does |
|---|---|---|
| `add_item` | `list?`, `items[]` (title, body?, dueAt?) | creates items on one list |
| `complete_item` | `item` (words) or `id` | marks one item done |
| `annotate_item` | `item` or `id`, `text` | appends `text` to the item's body, verbatim |
| `read_list` | `list?`, `when?` (`today`, `overdue`), `query?` | returns open items |

The result:

```
{ ok: true,  say: "Added milk to Groceries", items: [...] }
{ ok: false, say: "Two items match dentist, nothing changed",
  reason: "ambiguous" | "not_found" | "unknown_list" | "error",
  candidates: [{ id, title, list }] }
```

`say` is one sentence written to be spoken or shown. It is always a statement. The structured fields let a richer input act on the same result: a device that can hold a conversation reads `candidates`, asks, and calls the intent again with an `id`.

## Rules

- A list that is named and does not exist: `add_item` goes to the default list and says so. `read_list` fails with `unknown_list`. Voice never creates lists.
- `complete_item` and `annotate_item` resolve `item` by searching open items. One clear match acts. No match or several matches changes nothing and returns the candidates.
- Text is stored as said. The only cleanup is the store's own, where it has one (Roma's enrich pass derives a tidier title and a due date from the words). Nothing offhand runs rewrites what you said.
- Every intent is reversible from the store's own app. Nothing is deleted.
- Repeats are safe: an input passes a stable `externalId` with each add, and a retried request returns the item already made.

Not in the contract today: delete, move, create list, undo, any confirmation step. Delete is the only irreversible verb and needs a confirmation the first inputs cannot give. Move and undo come when day-to-day use asks for them.

## Inputs

Two kinds.

- A device with its own agent calls `POST /mcp`. offhand exposes the four intents as MCP tools over Streamable HTTP, bearer auth. The device's agent picks the tool and fills the arguments; its descriptions are the prompt. The tool result's text is `say`.
- A device without one calls `POST /say` with text (or audio, later). offhand picks the intent with a model and runs it. Same result shape back.

Both are one-shot: one utterance in, one report out. An input that can speak keeps `say`; an input that can only show it shows it; an input that can converse uses the structured fields.

## Item store

One file per task manager implements this. Nothing outside that file knows which one it is.

```
lists()                                   -> [{ id, name }]
createItems(listId | null, items, opts)   -> [item]        opts.enrich
completeItem(id)                          -> item
annotateItem(id, text)                    -> item
readList(listId | null, filter)           -> [item]        filter.dueBefore, dueAfter, limit
findItems(words, opts)                    -> [item]        opts.openOnly, limit
```

Phase 1 and 2 add, for workers: `setStatus(id, status)`, `writeBody(id, markdown)`, `postMessage(id, text, agentName)`, and `watch(listId)` which yields new items and replies.

`item` is `{ id, title, listId?, listName?, status?, dueAt?, body? }`.

### Roma

The first store. One API key, sent as the bearer on every call to `https://api.roma.app/mcp`.

| Store call | Roma tool | Arguments |
|---|---|---|
| lists | `list_lists` | `suppressOptions: true` |
| createItems | `create_items` | `listId` (or omit for the Tasks list), `items: [{ title, body, dueAt, externalId }]`, `enrich: true` |
| completeItem | `update_items` | `items: [{ itemId }]`, `taskStatus: "completed"` |
| annotateItem | `update_items` | `items: [{ itemId, body }]`, `mode: "append"` |
| readList | `list_items` | `listId`, `dueBefore`, `dueAfter`, `limit`; omitting `listId` reads every open task |
| findItems, open only | `list_items` | `query`, `limit` |
| findItems, anything | `search` | `query`, `limit` |

Roma statuses are `todo`, `inProgress`, `completed`. Roma's rate limit is 60 calls a minute per key; a ring utterance costs one to three.

## Workers

Phases 1 and 2. A worker watches one list. The list an item is on decides who picks it up.

- Set the item to in progress when you start.
- Write your plan and result into the item's body.
- Post in the item's chat only for a link or a question, under your agent name.
- Never mark an item complete. That is the person's.
- A reply in the chat wakes you again, with the item's body and the reply. "Start over" means from scratch.

## Where it runs

| Piece | Runs on | In this repo |
|---|---|---|
| the device's app | your phone | nothing to install, you paste a URL and a token |
| offhand | Cloudflare Workers, on request only | `worker/` |
| the task manager | its own cloud | nothing, you hold a key |
| offhand for Mac (phase 2) | your Mac | `mac/` |
