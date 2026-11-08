// RomaStore against a fake Roma MCP endpoint: what each store call sends, and how the
// session, a 401, an SSE body and a tool error are handled. Shapes follow roma.app/developers.

import { afterEach, describe, expect, it, vi } from "vitest";
import { RomaStore } from "../src/store/roma";

interface Hit {
  method: string;
  params: Record<string, any> | undefined;
  headers: Record<string, string>;
}

function fakeRoma(opts: { rejectBearer?: string; sse?: boolean; errorTool?: string } = {}) {
  const hits: Hit[] = [];
  const results = new Map<string, unknown>();
  const json = (o: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(o), { headers: { "content-type": "application/json", ...headers } });
  const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    hits.push({ method: body.method, params: body.params, headers });
    if (opts.rejectBearer && headers.authorization === `Bearer ${opts.rejectBearer}`) return new Response("unauthorized", { status: 401 });
    if (body.method === "initialize") return json({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18" } }, { "mcp-session-id": "S1" });
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/call") {
      const name = body.params.name as string;
      if (name === opts.errorTool) {
        return json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "messageRequired" }], isError: true } });
      }
      const r = results.get(name) ?? {};
      const msg = { jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r } };
      if (opts.sse) return new Response(`event: message\ndata: ${JSON.stringify(msg)}\n\n`, { headers: { "content-type": "text/event-stream" } });
      return json(msg);
    }
    return new Response("not found", { status: 404 });
  });
  const calls = () => hits.filter((h) => h.method === "tools/call").map((h) => h.params as { name: string; arguments: Record<string, any> });
  return { hits, results, fetchMock, calls };
}

// A bearer that hands out "t1" until asked for a fresh one, then "t2".
function fakeBearer() {
  let current = "t1";
  const token = vi.fn(async (fresh?: boolean) => {
    if (fresh) current = "t2";
    return current;
  });
  return { token };
}

describe("RomaStore", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens a session once, then calls tools with it and the bearer", async () => {
    const roma = fakeRoma();
    roma.results.set("list_lists", { lists: [{ id: "L1", name: "Groceries", extra: 1 }] });
    vi.stubGlobal("fetch", roma.fetchMock);
    const store = new RomaStore(fakeBearer());

    expect(await store.lists()).toEqual([{ id: "L1", name: "Groceries" }]);
    await store.lists();
    expect(roma.hits.map((h) => h.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call"]);
    expect(roma.hits[0].headers["mcp-session-id"]).toBeUndefined();
    for (const h of roma.hits.slice(1)) expect(h.headers["mcp-session-id"]).toBe("S1");
    for (const h of roma.hits) expect(h.headers.authorization).toBe("Bearer t1");
    expect(roma.calls()[0].arguments).toEqual({ suppressOptions: true });
  });

  it("createItems: hasDueTime rides with a dueAt, the inbox omits listId, enrich is on", async () => {
    const roma = fakeRoma();
    roma.results.set("create_items", { items: [{ id: "I1", title: "milk", dueAt: "2026-10-29T02:00:00.000Z" }], existing: [{ id: "I0", title: "eggs" }] });
    vi.stubGlobal("fetch", roma.fetchMock);
    const store = new RomaStore(fakeBearer());

    const made = await store.createItems(null, [{ title: "milk", dueAt: "2026-10-29T02:00:00.000Z" }, { title: "eggs" }]);
    const args = roma.calls()[0].arguments;
    expect(args.listId).toBeUndefined();
    expect(args.enrich).toBe(true);
    expect(args.items[0]).toEqual({ title: "milk", dueAt: "2026-10-29T02:00:00.000Z", hasDueTime: true });
    expect(args.items[1]).toEqual({ title: "eggs" });
    expect(made.map((m) => m.id)).toEqual(["I1", "I0"]);

    await store.createItems("L1", [{ title: "bread" }]);
    expect(roma.calls()[1].arguments.listId).toBe("L1");
  });

  it("annotateItem appends the note with the message Roma requires", async () => {
    const roma = fakeRoma();
    roma.results.set("update_items", { items: [{ id: "I3", title: "dentist", body: "ask about the crown" }] });
    vi.stubGlobal("fetch", roma.fetchMock);
    const store = new RomaStore(fakeBearer());

    const item = await store.annotateItem("I3", "ask about the crown");
    const args = roma.calls()[0].arguments;
    expect(args.mode).toBe("append");
    expect(args.items[0].itemId).toBe("I3");
    expect(args.items[0].body).toBe("ask about the crown");
    expect(typeof args.items[0].message).toBe("string");
    expect(args.items[0].message.length).toBeGreaterThan(0);
    expect(args.items[0].message.length).toBeLessThanOrEqual(420);
    expect(item.body).toBe("ask about the crown");
  });

  it("completeItem sets the status to completed", async () => {
    const roma = fakeRoma();
    vi.stubGlobal("fetch", roma.fetchMock);
    await new RomaStore(fakeBearer()).completeItem("I9");
    expect(roma.calls()[0]).toEqual({ name: "update_items", arguments: { items: [{ itemId: "I9" }], taskStatus: "completed" } });
  });

  it("findItems: open items go through list_items, anything through search", async () => {
    const roma = fakeRoma();
    roma.results.set("list_items", { items: [{ id: "a", title: "call the dentist", taskStatus: "todo", listName: "Tasks" }] });
    roma.results.set("search", { results: [{ id: "b", title: "dentist notes" }] });
    vi.stubGlobal("fetch", roma.fetchMock);
    const store = new RomaStore(fakeBearer());

    const open = await store.findItems("dentist", { openOnly: true, limit: 5 });
    expect(roma.calls()[0]).toEqual({ name: "list_items", arguments: { query: "dentist", limit: 5 } });
    expect(open[0]).toEqual({ id: "a", title: "call the dentist", status: "todo", listName: "Tasks" });

    const any = await store.findItems("dentist", { openOnly: false });
    expect(roma.calls()[1]).toEqual({ name: "search", arguments: { query: "dentist", limit: 5 } });
    expect(any[0].id).toBe("b");
  });

  it("readList passes the window and limit, and omits listId for the inbox", async () => {
    const roma = fakeRoma();
    vi.stubGlobal("fetch", roma.fetchMock);
    await new RomaStore(fakeBearer()).readList(null, { dueAfter: "A", dueBefore: "B", limit: 10 });
    expect(roma.calls()[0].arguments).toEqual({ limit: 10, dueAfter: "A", dueBefore: "B" });
  });

  it("asks the bearer for a fresh token and retries when initialize is refused", async () => {
    const roma = fakeRoma({ rejectBearer: "t1" });
    roma.results.set("list_lists", { lists: [] });
    vi.stubGlobal("fetch", roma.fetchMock);
    const bearer = fakeBearer();

    expect(await new RomaStore(bearer).lists()).toEqual([]);
    expect(bearer.token).toHaveBeenCalledWith(true);
    const methods = roma.hits.map((h) => `${h.method}:${h.headers.authorization}`);
    expect(methods).toEqual(["initialize:Bearer t1", "initialize:Bearer t2", "notifications/initialized:Bearer t2", "tools/call:Bearer t2"]);
  });

  it("gives up after one retry when the fresh token is refused too", async () => {
    const roma = fakeRoma({ rejectBearer: "t1" });
    vi.stubGlobal("fetch", roma.fetchMock);
    const bearer = { token: vi.fn(async () => "t1") };
    await expect(new RomaStore(bearer).lists()).rejects.toThrow(/401/);
    expect(roma.hits.filter((h) => h.method === "initialize")).toHaveLength(2);
  });

  it("reads a result delivered as an SSE stream", async () => {
    const roma = fakeRoma({ sse: true });
    roma.results.set("list_lists", { lists: [{ id: "L2", name: "Errands" }] });
    vi.stubGlobal("fetch", roma.fetchMock);
    expect(await new RomaStore(fakeBearer()).lists()).toEqual([{ id: "L2", name: "Errands" }]);
  });

  it("turns a tool result marked isError into an exception naming the tool", async () => {
    const roma = fakeRoma({ errorTool: "update_items" });
    vi.stubGlobal("fetch", roma.fetchMock);
    await expect(new RomaStore(fakeBearer()).annotateItem("I3", "x")).rejects.toThrow(/update_items: messageRequired/);
  });
});
