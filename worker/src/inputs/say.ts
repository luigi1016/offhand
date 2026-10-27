// Input for devices without an agent: POST text, get a report back.
// Claude picks the intent from the same four tools the MCP input exposes.
// Needs ANTHROPIC_API_KEY. Audio is not accepted yet; send the transcript.

import Anthropic from "@anthropic-ai/sdk";
import type { IntentResult, Intents } from "../intents";
import { TOOLS, runTool } from "../tools";

const SYSTEM =
  "You turn one spoken utterance into exactly one offhand tool call. " +
  "Always call a tool; never answer in prose. Keep the person's words as titles and notes. " +
  "A dictated list is several items in one add_item call. " +
  "If the utterance fits no tool, call read_list with the utterance as query.";

export async function handleSay(req: Request, intents: Intents, apiKey: string | undefined): Promise<Response> {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!apiKey) return Response.json({ ok: false, say: "Text input is not set up.", reason: "error" }, { status: 501 });

  const text = await utteranceFrom(req);
  if (!text) return Response.json({ ok: false, say: "Nothing was said.", reason: "error" }, { status: 400 });

  const result = await pickAndRun(text, intents, apiKey);
  return Response.json(result);
}

async function utteranceFrom(req: Request): Promise<string> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    return String(form.get("transcription") ?? form.get("text") ?? "").trim();
  }
  if (type.includes("application/json")) {
    const body = (await req.json()) as { text?: string };
    return (body.text ?? "").trim();
  }
  return (await req.text()).trim();
}

async function pickAndRun(text: string, intents: Intents, apiKey: string): Promise<IntentResult> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 1024,
    system: SYSTEM,
    output_config: { effort: "low" },
    tools: TOOLS.map((t) => ({ ...t, strict: true })),
    tool_choice: { type: "auto", disable_parallel_tool_use: true },
    messages: [{ role: "user", content: text }],
  });

  const call = response.content.find((c) => c.type === "tool_use");
  if (!call) return { ok: false, say: "Could not tell what to do with that.", reason: "error" };
  return runTool(intents, call.name, call.input);
}
