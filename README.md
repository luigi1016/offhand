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

No terminal. A free Cloudflare account, a GitHub account and Roma.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/luigi1016/offhand/tree/main/worker)

1. **Deploy.** Click the button. On Cloudflare's form, pick your Git account and click Deploy. Nothing else on the form needs changing. Cloudflare copies the code into a repository of your own and runs it.
2. **Open your Worker.** Its address is on the Worker's Overview page in Cloudflare, under Domains and routes: `https://<project name>.<your account>.workers.dev`. If that page says the address is disabled, enable it there.
3. **Connect Roma.** Click **Connect Roma** and approve. You land on your setup page. Bookmark it: it is the way back, and its address holds your token, so do not share it.
4. **Paste into your device's app.** The setup page has an MCP URL and a header, each with a Copy button. Add them as a **Streamable HTTP** MCP server, not SSE.

### Pebble Index 01

In the Pebble app:

1. Set hold and talk to **Index agent**.
2. Uncheck **Notes** and **Reminders**. Left on, Pebble keeps what you say in its own lists and offhand never hears it.
3. Add the MCP server from step 4 above, as **Streamable**.

Hold the button and say "add milk to groceries". It should land in Roma.

### What to know

- **Your token is never shown to a visitor.** It is made when you finish connecting Roma, so a robot or a stranger that opens your Worker's address first gets a page with a button and nothing else.
- **Your Roma sign-in stays in your Cloudflare account**, in the Worker's KV namespace. Whoever can log in to that account can read it.
- **Your Worker runs your copy of the code.** It does not follow this repository, so changes here do not reach it yet.

Prefer keys over sign-in, or deploying from a terminal? [worker/README.md](worker/README.md) has both.

## Repository layout

```
worker/   Cloudflare Worker: inputs, intents, item store adapters, cloud workers
mac/      offhand for Mac: menu bar app that runs coding agents from your lists
docs/     the contract: intents, the item store interface, how workers write back
```

## License

MIT. See [LICENSE](LICENSE).
