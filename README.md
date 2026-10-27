# offhand

Say it to the ring. It becomes a task. Something picks it up.

offhand turns a to-do list into the control plane for your agents. You speak into a [Pebble Index 01](https://repebble.com/index) ring, the task lands in [Roma](https://roma.app), and workers watching your lists do the work: an AI that makes the phone call for you, or Claude Code running in the right repo on your Mac. Results come back to the same task, where you can read them and reply.

> Voice is a great way to delegate and a terrible place to wait. A to-do list already has everything delegation needs: a record of what you asked, a status, a chat per item, and a notification when it is done. offhand just lets agents live in the list you already check.

## How it works

```
ring  →  Pebble app  →  offhand worker  →  Roma lists
                        (Cloudflare)          ├─ Calls      →  phone-call worker  →  summary + recording on the task
                                              └─ my-repo    →  offhand for Mac    →  Claude Code  →  progress on the task
```

- **Ring to Roma.** Hold the ring and talk. The Pebble app transcribes on your phone and calls a small MCP server (a Cloudflare Worker you deploy with one click) that adds, completes, annotates or reads tasks in Roma.
- **Phone calls.** A task in your Calls list ("call the dentist, move Thursday to next week") is picked up by the worker, which places the call through ElevenLabs in a voice you choose, then writes the summary and the recording back onto the task.
- **Code.** A task in a list named after one of your repos starts Claude Code in that folder on your Mac. Progress shows up on the task. Reply in the task's chat to steer it.

Roma is the first task manager offhand speaks to. The task-manager side is an adapter, so others can follow.

## Status

Early. Nothing to install yet. The roadmap, in build order:

| Phase | What you get | Status |
|---|---|---|
| 0 | Ring to Roma: add, complete, annotate and read tasks by voice | in progress |
| 1 | Phone calls from a task, summary and recording back on it | planned |
| 2 | Mac app: tasks in repo-named lists run Claude Code | planned |

## Install

The goal is two pastes and one button, no terminal:

1. Create a Roma API key (Settings, then Connections).
2. Click **Deploy to Cloudflare**, paste the key.
3. Open your worker's setup page and copy the two values into the Pebble app under Index settings, MCP servers.

Details land here when phase 0 ships.

## Repository layout

```
worker/   Cloudflare Worker: MCP server for the ring, phone-call routes
mac/      offhand for Mac: menu bar app that runs Claude Code from Roma tasks
docs/     design notes and the contract with Roma
```

## License

MIT. See [LICENSE](LICENSE).
