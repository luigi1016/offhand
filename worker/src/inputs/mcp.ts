// Input for devices with their own agent: the four intents as MCP tools.
// Stateless Streamable HTTP, POST only, bearer auth. Spec: modelcontextprotocol.io

import type { Intents } from "../intents";
import { TOOLS, runTool } from "../tools";

const PROTOCOL = "2025-06-18";

type Json = Record<string, unknown>;

export async function handleMcp(req: Request, intents: Intents, token: string): Promise<Response> {
  if (!authorized(req, token)) return new Response("unauthorized", { status: 401 });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let msg: Json;
  try {
    msg = (await req.json()) as Json;
  } catch {
    return rpcError(null, -32700, "parse error");
  }
  const id = (msg.id as number | string | undefined) ?? null;

  switch (msg.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: { name: "offhand", version: "0.1" },
      });
    case "notifications/initialized":
    case "notifications/cancelled":
      return new Response(null, { status: 202 });
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      const params = (msg.params ?? {}) as Json;
      const result = await runTool(intents, String(params.name), params.arguments);
      return rpcResult(id, {
        content: [{ type: "text", text: result.say }],
        structuredContent: result,
        isError: false,
      });
    }
    default:
      return rpcError(id, -32601, `method not found: ${msg.method}`);
  }
}

function authorized(req: Request, token: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  return given.length > 0 && timingSafeEqual(given, token);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function rpcResult(id: number | string | null, result: Json): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function rpcError(id: number | string | null, code: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}
