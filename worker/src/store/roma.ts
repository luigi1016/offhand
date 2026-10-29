// Roma as an item store: https://roma.app/developers
// Talks MCP over Streamable HTTP. The bearer is an API key or an OAuth token (roma-auth.ts).

import type { Bearer } from "./roma-auth";
import type { FindOptions, Item, ItemStore, ListRef, NewItem, ReadFilter } from "./types";

const ENDPOINT = "https://api.roma.app/mcp";

type Json = Record<string, unknown>;

export class RomaStore implements ItemStore {
  private sessionId: string | null = null;
  private nextId = 1;

  constructor(private readonly bearer: Bearer) {}

  async lists(): Promise<ListRef[]> {
    const r = await this.call("list_lists", { suppressOptions: true });
    const lists = (r.lists as Json[] | undefined) ?? [];
    return lists.map((l) => ({ id: String(l.id), name: String(l.name) }));
  }

  async createItems(listId: string | null, items: NewItem[], opts?: { enrich?: boolean }): Promise<Item[]> {
    const args: Json = { items, enrich: opts?.enrich ?? true };
    if (listId) args.listId = listId;
    const r = await this.call("create_items", args);
    const made = [...((r.items as Json[] | undefined) ?? []), ...((r.existing as Json[] | undefined) ?? [])];
    return made.map(toItem);
  }

  async completeItem(id: string): Promise<Item> {
    const r = await this.call("update_items", { items: [{ itemId: id }], taskStatus: "completed" });
    return toItem(((r.items as Json[] | undefined) ?? [{ id }])[0]);
  }

  async annotateItem(id: string, text: string): Promise<Item> {
    const r = await this.call("update_items", { items: [{ itemId: id, body: text }], mode: "append" });
    return toItem(((r.items as Json[] | undefined) ?? [{ id }])[0]);
  }

  async readList(listId: string | null, filter: ReadFilter = {}): Promise<Item[]> {
    const args: Json = { limit: filter.limit ?? 10 };
    if (listId) args.listId = listId;
    if (filter.dueBefore) args.dueBefore = filter.dueBefore;
    if (filter.dueAfter) args.dueAfter = filter.dueAfter;
    const r = await this.call("list_items", args);
    return ((r.items as Json[] | undefined) ?? []).map(toItem);
  }

  async findItems(words: string, opts: FindOptions = {}): Promise<Item[]> {
    const limit = opts.limit ?? 5;
    if (opts.openOnly) {
      const r = await this.call("list_items", { query: words, limit });
      return ((r.items as Json[] | undefined) ?? []).map(toItem);
    }
    const r = await this.call("search", { query: words, limit });
    return ((r.results as Json[] | undefined) ?? []).map(toItem);
  }

  // One MCP tools/call. Initializes a session on first use and once more if Roma forgets it.
  private async call(name: string, args: Json, retry = true): Promise<Json> {
    if (!this.sessionId) await this.initialize();
    const res = await this.rpc("tools/call", { name, arguments: args });
    if (res.status === 404 && retry) {
      this.sessionId = null;
      return this.call(name, args, false);
    }
    if (res.status === 401 && retry) {
      await this.bearer.token(true);
      this.sessionId = null;
      return this.call(name, args, false);
    }
    const msg = await readRpc(res);
    if (msg.error) throw new Error(`roma ${name}: ${(msg.error as Json).message}`);
    const result = msg.result as Json;
    if (result.isError) throw new Error(`roma ${name}: ${textOf(result)}`);
    if (result.structuredContent) return result.structuredContent as Json;
    try {
      return JSON.parse(textOf(result)) as Json;
    } catch {
      return { text: textOf(result) };
    }
  }

  private async initialize(): Promise<void> {
    const res = await this.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "offhand", version: "0.1" },
    });
    this.sessionId = res.headers.get("mcp-session-id");
    const msg = await readRpc(res);
    if (msg.error) throw new Error(`roma initialize: ${(msg.error as Json).message}`);
    await this.rpc("notifications/initialized", undefined, true);
  }

  private async rpc(method: string, params?: Json, notification = false): Promise<Response> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await this.bearer.token()}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const body: Json = { jsonrpc: "2.0", method };
    if (params) body.params = params;
    if (!notification) body.id = this.nextId++;
    return fetch(ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) });
  }
}

// A Streamable HTTP response is JSON or an SSE stream with the JSON inside.
async function readRpc(res: Response): Promise<Json> {
  const text = await res.text();
  if (!res.ok) throw new Error(`roma http ${res.status}: ${text.slice(0, 200)}`);
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    let last: Json | null = null;
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const m = JSON.parse(line.slice(5).trim()) as Json;
        if ("result" in m || "error" in m) last = m;
      } catch {
        // keep-alive or partial line
      }
    }
    if (!last) throw new Error("roma: empty stream");
    return last;
  }
  return JSON.parse(text) as Json;
}

function textOf(result: Json): string {
  const content = (result.content as Json[] | undefined) ?? [];
  return content
    .filter((c) => c.type === "text")
    .map((c) => String(c.text))
    .join("\n");
}

function toItem(j: Json): Item {
  const item: Item = { id: String(j.id ?? j.itemId), title: String(j.title ?? "") };
  if (j.listId) item.listId = String(j.listId);
  if (j.listName) item.listName = String(j.listName);
  if (j.taskStatus) item.status = String(j.taskStatus);
  if (j.dueAt) item.dueAt = String(j.dueAt);
  if (typeof j.body === "string") item.body = j.body;
  return item;
}
