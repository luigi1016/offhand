// The MCP input: auth, the tool list a device's agent sees, and what a call returns.

import { describe, expect, it } from "vitest";
import { handleMcp } from "../src/inputs/mcp";
import { makeIntents } from "../src/intents";
import { FakeStore } from "./fakes";

const TOKEN = "test-token";

function rpc(body: unknown, token = TOKEN): Request {
  return new Request("https://offhand.test/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setup() {
  const store = new FakeStore();
  return { store, intents: makeIntents(store, { defaultList: "tasks", timeZone: "UTC" }) };
}

describe("POST /mcp", () => {
  it("refuses a wrong or missing token", async () => {
    const { intents } = setup();
    expect((await handleMcp(rpc({ method: "ping" }, "nope"), intents, TOKEN)).status).toBe(401);
    const bare = new Request("https://offhand.test/mcp", { method: "POST", body: "{}" });
    expect((await handleMcp(bare, intents, TOKEN)).status).toBe(401);
  });

  it("refuses everything while there is no token yet", async () => {
    const { intents } = setup();
    expect((await handleMcp(rpc({ method: "ping" }), intents, null)).status).toBe(401);
  });

  it("lists the four tools with inputSchema, as MCP spells it", async () => {
    const { intents } = setup();
    const res = await handleMcp(rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }), intents, TOKEN);
    const body = (await res.json()) as { result: { tools: { name: string; inputSchema?: unknown; input_schema?: unknown }[] } };
    expect(body.result.tools.map((t) => t.name)).toEqual(["add_item", "complete_item", "annotate_item", "read_list"]);
    for (const t of body.result.tools) {
      expect(t.inputSchema).toBeDefined();
      expect(t.input_schema).toBeUndefined();
    }
  });

  it("runs a tool and returns the sentence as text plus the result as structuredContent", async () => {
    const { store, intents } = setup();
    const res = await handleMcp(
      rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "add_item", arguments: { list: "groceries", items: [{ title: "milk" }] } } }),
      intents,
      TOKEN,
    );
    const body = (await res.json()) as { result: { content: { text: string }[]; structuredContent: { ok: boolean }; isError: boolean } };
    expect(body.result.content[0].text).toBe("Added milk to Groceries.");
    expect(body.result.structuredContent.ok).toBe(true);
    expect(body.result.isError).toBe(false);
    expect(store.last("createItems")?.args[0]).toBe("L1");
  });

  it("turns a store failure into a tool error that still says nothing changed", async () => {
    const { store, intents } = setup();
    store.lists = async () => {
      throw new Error("boom");
    };
    const res = await handleMcp(
      rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read_list", arguments: { list: "groceries" } } }),
      intents,
      TOKEN,
    );
    const body = (await res.json()) as { result: { content: { text: string }[]; isError: boolean } };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toBe("Something failed. Nothing changed.");
  });

  it("answers initialize and ping", async () => {
    const { intents } = setup();
    const init = (await (await handleMcp(rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }), intents, TOKEN)).json()) as {
      result: { serverInfo: { name: string } };
    };
    expect(init.result.serverInfo.name).toBe("offhand");
    const ping = await handleMcp(rpc({ jsonrpc: "2.0", id: 2, method: "ping" }), intents, TOKEN);
    expect(ping.status).toBe(200);
  });
});
