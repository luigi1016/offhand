// The four intents as tools. The descriptions are the prompt a device's agent reads.
// Shared by the MCP input and the /say input so both see the same contract.

import type Anthropic from "@anthropic-ai/sdk";
import type { IntentResult, Intents } from "./intents";

export interface ToolDef {
  name: keyof Intents;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
}

const itemArg = {
  item: { type: "string", description: "The item, in the person's words. Matched against open items." },
  id: { type: "string", description: "The item's id, when known. Skips the match." },
};

export const TOOLS: ToolDef[] = [
  {
    name: "add_item",
    description:
      "Add one or more items to a list. A dictated list becomes one entry per item: 'milk, eggs and bread' is three. " +
      "Use the person's words as the title. Name the list only if the person named one; otherwise omit it and the default list is used. " +
      "'Remind me to X tonight' and 'I need to X by Friday' are items with a due date: resolve the time to an instant from the current date and time. " +
      "Returns what was added and where.",
    input_schema: {
      type: "object",
      properties: {
        list: { type: "string", description: "List name, only if the person said one." },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "The item, in the person's words." },
              body: { type: "string", description: "Anything extra the person said about it." },
              dueAt: {
                type: "string",
                description: "When it is due, as an ISO 8601 instant with offset, only if the person said when. 'Tonight' is 19:00 today, 'tomorrow' is 09:00.",
              },
            },
            required: ["title"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
  {
    name: "complete_item",
    description:
      "Mark one open item done: 'done with the dentist', 'I called mom'. " +
      "If several items match, nothing changes and the result names them.",
    input_schema: { type: "object", properties: itemArg, additionalProperties: false },
  },
  {
    name: "annotate_item",
    description:
      "Add a note to an existing item, verbatim: 'on the dentist thing, ask about the crown'. " +
      "The note is appended as said. If several items match, nothing changes and the result names them.",
    input_schema: {
      type: "object",
      properties: { ...itemArg, text: { type: "string", description: "The note, in the person's words." } },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "read_list",
    description:
      "Read what is open: 'what's on groceries', 'what's due today', 'what do I have to do', 'did I add the dentist'. " +
      "Omit everything for all open items. Use when for today or overdue, query to check for one thing.",
    input_schema: {
      type: "object",
      properties: {
        list: { type: "string", description: "List name, only if the person said one." },
        when: { type: "string", enum: ["today", "overdue"] },
        query: { type: "string", description: "Words to look for, to answer 'did I add X'." },
      },
      additionalProperties: false,
    },
  },
];

export async function runTool(intents: Intents, name: string, args: unknown): Promise<IntentResult> {
  const a = (args ?? {}) as never;
  switch (name) {
    case "add_item":
      return intents.add_item(a);
    case "complete_item":
      return intents.complete_item(a);
    case "annotate_item":
      return intents.annotate_item(a);
    case "read_list":
      return intents.read_list(a);
    default:
      return { ok: false, say: `No tool called ${name}.`, reason: "error" };
  }
}
