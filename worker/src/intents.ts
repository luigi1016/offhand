// The four intents. They never ask; they report. See docs/contract.md.

import type { Item, ItemStore, NewItem } from "./store/types";

export type Reason = "ambiguous" | "not_found" | "unknown_list" | "error";

export type IntentResult =
  | { ok: true; say: string; items?: Item[] }
  | { ok: false; say: string; reason: Reason; candidates?: Item[] };

export interface Intents {
  add_item(args: { list?: string; items: NewItem[] }): Promise<IntentResult>;
  complete_item(args: { item?: string; id?: string }): Promise<IntentResult>;
  annotate_item(args: { item?: string; id?: string; text: string }): Promise<IntentResult>;
  read_list(args: { list?: string; when?: "today" | "overdue"; query?: string }): Promise<IntentResult>;
}

export interface IntentConfig {
  defaultList: string; // a list name, or "tasks" for the store's inbox
  timeZone: string; // for "today"
}

export function makeIntents(store: ItemStore, config: IntentConfig): Intents {
  // Resolve a spoken list name to an id. Null means the store's inbox.
  async function resolveList(name: string | undefined): Promise<{ id: string | null; name: string } | undefined> {
    const wanted = (name ?? config.defaultList).trim();
    if (!wanted || wanted.toLowerCase() === "tasks") return { id: null, name: "Tasks" };
    const lists = await store.lists();
    const match = bestList(lists, wanted);
    return match ? { id: match.id, name: match.name } : undefined;
  }

  async function resolveItem(
    args: { item?: string; id?: string },
    openOnly: boolean,
  ): Promise<{ item: Item } | { fail: IntentResult }> {
    if (args.id) return { item: { id: args.id, title: args.item ?? "" } };
    const words = (args.item ?? "").trim();
    if (!words) return { fail: { ok: false, say: "Which item? Nothing changed.", reason: "not_found" } };
    const found = await store.findItems(words, { openOnly, limit: 5 });
    if (found.length === 0) {
      return { fail: { ok: false, say: `Nothing matches ${words}. Nothing changed.`, reason: "not_found" } };
    }
    const exact = found.filter((f) => f.title.trim().toLowerCase() === words.toLowerCase());
    if (exact.length === 1) return { item: exact[0] };
    if (found.length === 1) return { item: found[0] };
    const top = found.slice(0, 3);
    return {
      fail: {
        ok: false,
        say: `${top.length} items match ${words}: ${top.map((t) => t.title).join(", ")}. Nothing changed.`,
        reason: "ambiguous",
        candidates: top,
      },
    };
  }

  return {
    async add_item({ list, items }) {
      if (!items?.length) return { ok: false, say: "Nothing to add.", reason: "error" };
      let target = await resolveList(list);
      let note = "";
      if (!target) {
        note = `No list called ${list}. `;
        target = (await resolveList(undefined)) ?? { id: null, name: "Tasks" };
      }
      const clean = items.map((i) => (i.dueAt && !Number.isNaN(Date.parse(i.dueAt)) ? i : { ...i, dueAt: undefined }));
      const made = await store.createItems(target.id, clean, { enrich: true });
      const titles = made.map((m) => (m.dueAt ? `${m.title} (due ${whenSaid(m.dueAt, config.timeZone)})` : m.title)).join(", ");
      return { ok: true, say: `${note}Added ${titles} to ${target.name}.`, items: made };
    },

    async complete_item(args) {
      const r = await resolveItem(args, true);
      if ("fail" in r) return r.fail;
      const done = await store.completeItem(r.item.id);
      return { ok: true, say: `Done: ${done.title || r.item.title}.`, items: [done] };
    },

    async annotate_item(args) {
      const text = (args.text ?? "").trim();
      if (!text) return { ok: false, say: "Nothing to note.", reason: "error" };
      const r = await resolveItem(args, false);
      if ("fail" in r) return r.fail;
      const item = await store.annotateItem(r.item.id, text);
      return { ok: true, say: `Noted on ${item.title || r.item.title}: ${text}`, items: [item] };
    },

    async read_list({ list, when, query }) {
      if (query) {
        const found = await store.findItems(query, { openOnly: true, limit: 5 });
        if (found.length === 0) return { ok: true, say: `Nothing open matches ${query}.`, items: [] };
        return { ok: true, say: found.map(describe).join(". "), items: found };
      }
      const target = list ? await resolveList(list) : { id: null, name: "Tasks" };
      if (!target) return { ok: false, say: `No list called ${list}.`, reason: "unknown_list" };
      const filter = when ? dayWindow(when, config.timeZone) : {};
      const items = await store.readList(target.id, { ...filter, limit: 10 });
      const label = when ?? target.name;
      if (items.length === 0) return { ok: true, say: `Nothing on ${label}.`, items: [] };
      return { ok: true, say: `${label}: ${items.map((i) => i.title).join(", ")}.`, items };
    },
  };
}

function bestList<T extends { name: string }>(lists: T[], wanted: string): T | undefined {
  const w = wanted.toLowerCase();
  return (
    lists.find((l) => l.name.toLowerCase() === w) ??
    lists.find((l) => l.name.toLowerCase().startsWith(w)) ??
    lists.find((l) => l.name.toLowerCase().includes(w))
  );
}

function describe(i: Item): string {
  return i.listName ? `${i.title} on ${i.listName}` : i.title;
}

// Midnight boundaries in the person's zone, as ISO instants.
function dayWindow(when: "today" | "overdue", timeZone: string): { dueBefore?: string; dueAfter?: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = fmt.format(now); // YYYY-MM-DD
  const offset = zoneOffset(now, timeZone);
  const startOfToday = new Date(`${today}T00:00:00${offset}`);
  const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
  if (when === "overdue") return { dueBefore: startOfToday.toISOString() };
  return { dueAfter: startOfToday.toISOString(), dueBefore: startOfTomorrow.toISOString() };
}

// "Oct 28, 7:00 PM" in the person's zone, for the spoken result.
function whenSaid(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function zoneOffset(at: Date, timeZone: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = part?.match(/GMT([+-]\d{2}:\d{2})?/);
  return m?.[1] ?? "+00:00";
}
