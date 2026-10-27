# offhand

Say it. It lands on a list. Something picks it up.

offhand turns the to-do list you already use into the control plane for your agents. Any voice device becomes the input. Any task manager becomes the inbox. Workers watch your lists and do the work: make a phone call, run a coding agent in the right repo, or whatever you plug in next. Results land on the same item, where you read them and reply.

> Voice is a great way to delegate and a terrible place to wait. A to-do list already has everything delegation needs: a record of what you asked, a status, a chat per item, and a notification when it is done. offhand lets agents live in the list you already check.

## How it works

```
inputs                      intents                 item store              workers
(any voice device)          (four verbs)            (any to-do app)         (watch a list, do the work)

ring, pendant, watch,  →    add_item           →    lists            →      phone call   →  summary + recording on the item
shortcut, chat bot          complete_item           items                   coding agent →  progress on the item
                            annotate_item           chat per item           your worker  →  ...
                            read_list
```

- **Inputs** deliver an utterance. Devices with their own agent call offhand's MCP tools directly. Devices without one post text to a single endpoint and offhand works out the intent.
- **Intents** are the only thing inputs know about: add items to a list, complete one, annotate one, read a list. They never ask a question; they report what happened, in one sentence and as data. A device that can only show a notification shows the sentence. A device that can talk back uses the data to follow up.
- **The item store** is an interface: lists, items, status, a chat per item, and a way to watch a list for new items and replies. One file per task manager.
- **Workers** watch a list and act. Which list an item is on decides who picks it up. A worker sets an item to in progress, writes its result into the item, posts only links or questions, and never marks anything complete. That is yours. Reply in the item's chat to steer it.

The full contract is in [docs/contract.md](docs/contract.md).

## Supported today

| Side | First adapter | Next |
|---|---|---|
| Input | Pebble Index 01 ring (via MCP) | any device that can POST text |
| Item store | Roma | Todoist, Linear, Things, Notion |
| Workers | phone calls (ElevenLabs + Twilio), Claude Code on a Mac | yours |

The first adapters are the ones I use. The seams are there so the next ones are a file, not a fork.

## Status

Early. Build order:

| Phase | What you get | Status |
|---|---|---|
| 0 | Voice to list: add, complete, annotate and read by voice | in progress |
| 1 | Phone-call worker: an item becomes a call, summary and recording come back | planned |
| 2 | Mac app: items on repo-named lists run Claude Code | planned |

## Install

The rule: one button, two pastes, no terminal.

1. Create an API key in your task manager.
2. Click **Deploy to Cloudflare**, paste the key and make up a token.
3. Open your deployment's setup page. It shows the URL and header to paste into your device's app.

Each adapter adds at most one card to the setup page. The button lands here when phase 0 ships; until then, [worker/README.md](worker/README.md) has the manual steps.

## Repository layout

```
worker/   Cloudflare Worker: inputs, intents, item store adapters, cloud workers
mac/      offhand for Mac: menu bar app that runs coding agents from your lists
docs/     the contract: intents, the item store interface, how workers write back
```

## License

MIT. See [LICENSE](LICENSE).
