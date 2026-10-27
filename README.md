# offhand

Say it. It becomes a task. Something picks it up.

offhand turns the to-do list you already use into the control plane for your agents. Any voice device becomes the input. Any task manager becomes the inbox. Workers watch your lists and do the work: make a phone call, run a coding agent in the right repo, or whatever you plug in next. Results land on the same task, where you read them and reply.

> Voice is a great way to delegate and a terrible place to wait. A to-do list already has everything delegation needs: a record of what you asked, a status, a chat per item, and a notification when it is done. offhand lets agents live in the list you already check.

## How it works

```
inputs                      intents                 task store              workers
(any voice device)          (four verbs)            (any to-do app)         (watch a list, do the work)

ring, pendant, watch,  →    add                →    lists            →      phone call   →  summary + recording on the task
shortcut, chat bot          complete                tasks                   coding agent →  progress on the task
                            annotate                chat per task           your worker  →  ...
                            read
```

- **Inputs** deliver an utterance. Devices with their own agent call offhand's MCP tools directly. Devices without one post text or audio to a single endpoint and offhand works out the intent.
- **Intents** are the only thing inputs know about: add a task, complete one, annotate one, read a list.
- **The task store** is an interface: lists, tasks, status, a chat per task, and a way to watch a list for new tasks and replies. One file per task manager.
- **Workers** watch a list and act. Which list a task is on decides who picks it up. A worker sets a task to in progress, writes its result into the task, posts only links or questions, and never marks anything complete. That is yours. Reply in the task's chat to steer it.

## Supported today

| Side | First adapter | Next |
|---|---|---|
| Input | Pebble Index 01 ring (via MCP) | any device that can POST text or audio |
| Task store | Roma | Todoist, Linear, Things, Notion |
| Workers | phone calls (ElevenLabs + Twilio), Claude Code on a Mac | yours |

The first adapters are the ones I use. The seams are there so the next ones are a file, not a fork.

## Status

Early. Nothing to install yet. Build order:

| Phase | What you get | Status |
|---|---|---|
| 0 | Voice to task: add, complete, annotate and read by voice | in progress |
| 1 | Phone-call worker: a task becomes a call, summary and recording come back | planned |
| 2 | Mac app: tasks on repo-named lists run Claude Code | planned |

## Install

The rule: one button, two pastes, no terminal.

1. Create an API key in your task manager.
2. Click **Deploy to Cloudflare**, paste the key.
3. Open your deployment's setup page. It shows the URL and token to paste into your device's app.

Each adapter adds at most one card to the setup page. Details land here when phase 0 ships.

## Repository layout

```
worker/   Cloudflare Worker: inputs, intents, task store adapters, cloud workers
mac/      offhand for Mac: menu bar app that runs coding agents from your lists
docs/     the contract: intents, the task store interface, how workers write back
```

## License

MIT. See [LICENSE](LICENSE).
