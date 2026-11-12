// The four intents against a fake store: a tool call in, the store calls out, one sentence back.

import { describe, expect, it, vi } from "vitest";
import { makeIntents } from "../src/intents";
import { FakeStore } from "./fakes";

function setup() {
  const store = new FakeStore();
  const intents = makeIntents(store, { defaultList: "tasks", timeZone: "America/Los_Angeles" });
  return { store, intents };
}

describe("add_item", () => {
  it("adds a dictated list as one item each, on the named list, with enrich on", async () => {
    const { store, intents } = setup();
    const r = await intents.add_item({ list: "groceries", items: [{ title: "milk" }, { title: "eggs" }, { title: "bread" }] });
    expect(r.ok).toBe(true);
    expect(r.say).toBe("Added milk, eggs, bread to Groceries.");
    expect(store.last("createItems")?.args).toEqual(["L1", [{ title: "milk" }, { title: "eggs" }, { title: "bread" }], { enrich: true }]);
  });

  it("goes to the default list when none is named", async () => {
    const { store, intents } = setup();
    const r = await intents.add_item({ items: [{ title: "call mom" }] });
    expect(r.say).toBe("Added call mom to Tasks.");
    expect(store.last("createItems")?.args[0]).toBeNull();
  });

  it("names the default list, not undefined, when no list was said and the default is missing", async () => {
    const { store } = setup();
    const r = await makeIntents(store, { defaultList: "Inbox", timeZone: "UTC" }).add_item({ items: [{ title: "milk" }] });
    expect(r.say).toBe("No list called Inbox. Added milk to Tasks.");
  });

  it("fails instead of saying 'Added' when the store made nothing", async () => {
    const { store, intents } = setup();
    store.createItems = async () => [];
    const r = await intents.add_item({ items: [{ title: "milk" }] });
    expect(r.ok).toBe(false);
    expect(r.say).toBe("Nothing was added.");
  });

  it("falls back to the default list and says so when the list does not exist", async () => {
    const { store, intents } = setup();
    const r = await intents.add_item({ list: "wishlist", items: [{ title: "a kayak" }] });
    expect(r.ok).toBe(true);
    expect(r.say).toBe("No list called wishlist. Added a kayak to Tasks.");
    expect(store.last("createItems")?.args[0]).toBeNull();
  });

  it("reads a said time as the clock time where the person is, bare or marked UTC", async () => {
    // The ring sent "9am" as 09:00 UTC and Roma showed 1am in Los Angeles.
    for (const said of ["2026-11-12T09:00", "2026-11-12T09:00:00", "2026-11-12T09:00:00Z", "2026-11-12T09:00:00.000+00:00"]) {
      const { store, intents } = setup();
      const r = await intents.add_item({ items: [{ title: "call mom", dueAt: said }] });
      expect(r.say).toBe("Added call mom (due Nov 12, 9:00 AM) to Tasks.");
      const sent = store.last("createItems")?.args[1] as { dueAt?: string }[];
      expect(sent[0].dueAt).toBe("2026-11-12T17:00:00.000Z");
    }
  });

  it("uses the offset of that day, not of today, across a DST change", async () => {
    const { store, intents } = setup();
    await intents.add_item({ items: [{ title: "call mom", dueAt: "2026-07-01T09:00" }] });
    const sent = store.last("createItems")?.args[1] as { dueAt?: string }[];
    expect(sent[0].dueAt).toBe("2026-07-01T16:00:00.000Z");
  });

  it("keeps a time that carries a real offset as the instant it names", async () => {
    const { store, intents } = setup();
    const r = await intents.add_item({ items: [{ title: "buy milk", dueAt: "2026-10-28T22:00:00-04:00" }] });
    expect(r.say).toBe("Added buy milk (due Oct 28, 7:00 PM) to Tasks.");
    const sent = store.last("createItems")?.args[1] as { dueAt?: string }[];
    expect(sent[0].dueAt).toBe("2026-10-28T22:00:00-04:00");
  });

  it("drops a due date it cannot parse instead of failing", async () => {
    const { store, intents } = setup();
    const r = await intents.add_item({ items: [{ title: "buy milk", dueAt: "tonight" }] });
    expect(r.ok).toBe(true);
    expect(r.say).toBe("Added buy milk to Tasks.");
    const sent = store.last("createItems")?.args[1] as { dueAt?: string }[];
    expect(sent[0].dueAt).toBeUndefined();
  });

  it("refuses an empty list of items", async () => {
    const { store, intents } = setup();
    const r = await intents.add_item({ items: [] });
    expect(r.ok).toBe(false);
    expect(store.calls).toEqual([]);
  });
});

describe("complete_item", () => {
  it("completes the one open item that matches", async () => {
    const { store, intents } = setup();
    store.found = [{ id: "I9", title: "call the dentist", status: "todo" }];
    const r = await intents.complete_item({ item: "dentist" });
    expect(r.say).toBe("Done: call the dentist.");
    expect(store.last("findItems")?.args).toEqual(["dentist", { openOnly: true, limit: 5 }]);
    expect(store.last("completeItem")?.args).toEqual(["I9"]);
  });

  it("changes nothing and names the candidates when several match", async () => {
    const { store, intents } = setup();
    store.found = [
      { id: "I1", title: "call the dentist" },
      { id: "I2", title: "pay the dentist" },
    ];
    const r = await intents.complete_item({ item: "dentist" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("ambiguous");
    expect(r.say).toBe("2 items match dentist: call the dentist, pay the dentist. Nothing changed.");
    expect(r.candidates?.map((c) => c.id)).toEqual(["I1", "I2"]);
    expect(store.last("completeItem")).toBeUndefined();
  });

  it("picks the exact title when several match loosely", async () => {
    const { store, intents } = setup();
    store.found = [
      { id: "I1", title: "dentist" },
      { id: "I2", title: "pay the dentist" },
    ];
    const r = await intents.complete_item({ item: "dentist" });
    expect(r.ok).toBe(true);
    expect(store.last("completeItem")?.args).toEqual(["I1"]);
  });

  it("reports not found when nothing matches", async () => {
    const { store, intents } = setup();
    const r = await intents.complete_item({ item: "unicorn" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("not_found");
    expect(store.last("completeItem")).toBeUndefined();
  });

  it("skips the search when an id is given", async () => {
    const { store, intents } = setup();
    const r = await intents.complete_item({ id: "I42" });
    expect(r.ok).toBe(true);
    expect(store.last("findItems")).toBeUndefined();
    expect(store.last("completeItem")?.args).toEqual(["I42"]);
  });
});

describe("annotate_item", () => {
  it("appends the note verbatim, searching completed items too", async () => {
    const { store, intents } = setup();
    store.found = [{ id: "I3", title: "dentist", status: "completed" }];
    const r = await intents.annotate_item({ item: "dentist", text: "ask about the crown, it's been 6 months" });
    expect(r.say).toBe("Noted on dentist: ask about the crown, it's been 6 months");
    expect(store.last("findItems")?.args).toEqual(["dentist", { openOnly: false, limit: 5 }]);
    expect(store.last("annotateItem")?.args).toEqual(["I3", "ask about the crown, it's been 6 months"]);
  });

  it("refuses an empty note", async () => {
    const { store, intents } = setup();
    store.found = [{ id: "I3", title: "dentist" }];
    const r = await intents.annotate_item({ item: "dentist", text: "  " });
    expect(r.ok).toBe(false);
    expect(store.last("annotateItem")).toBeUndefined();
  });
});

describe("read_list", () => {
  it("reads a named list, capped at ten", async () => {
    const { store, intents } = setup();
    store.listed = [{ id: "a", title: "milk" }, { id: "b", title: "eggs" }];
    const r = await intents.read_list({ list: "groceries" });
    expect(r.say).toBe("Groceries: milk, eggs.");
    expect(store.last("readList")?.args).toEqual(["L1", { limit: 10 }]);
  });

  it("says when a list is empty", async () => {
    const { intents } = setup();
    const r = await intents.read_list({ list: "errands" });
    expect(r.say).toBe("Nothing on Errands.");
  });

  it("fails with unknown_list for a list that does not exist", async () => {
    const { store, intents } = setup();
    const r = await intents.read_list({ list: "wishlist" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("unknown_list");
    expect(store.last("readList")).toBeUndefined();
  });

  it("turns today into a day window in the person's zone, midnight to midnight", async () => {
    const { store, intents } = setup();
    await intents.read_list({ when: "today" });
    const filter = store.last("readList")?.args[1] as { dueAfter: string; dueBefore: string; limit: number };
    const start = new Date(filter.dueAfter);
    const end = new Date(filter.dueBefore);
    const la = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour12: false });
    expect(la(start)).toMatch(/^(24|00):00:00$/);
    expect(la(end)).toMatch(/^(24|00):00:00$/);
    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    expect([23, 24, 25]).toContain(hours); // a DST day is 23 or 25 hours long
    expect(filter.limit).toBe(10);
  });

  it("finds midnight on a DST change day with that midnight's offset", async () => {
    // 2026-11-01 in Los Angeles: clocks fall back at 02:00 PDT. Midnight was PDT (-07:00).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T23:00:00.000Z")); // 3 PM PST, after the change
    try {
      const { store, intents } = setup();
      await intents.read_list({ when: "today" });
      const filter = store.last("readList")?.args[1] as { dueAfter: string; dueBefore: string };
      expect(filter.dueAfter).toBe("2026-11-01T07:00:00.000Z"); // 00:00 PDT
      expect(filter.dueBefore).toBe("2026-11-02T08:00:00.000Z"); // 00:00 PST the next day
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns overdue into everything due before today", async () => {
    const { store, intents } = setup();
    await intents.read_list({ when: "overdue" });
    const filter = store.last("readList")?.args[1] as { dueAfter?: string; dueBefore?: string };
    expect(filter.dueAfter).toBeUndefined();
    expect(filter.dueBefore).toBeDefined();
  });

  it("answers did I add X with a search of open items", async () => {
    const { store, intents } = setup();
    store.found = [{ id: "a", title: "call the dentist" }];
    const r = await intents.read_list({ query: "dentist" });
    expect(r.say).toBe("call the dentist");
    expect(store.last("findItems")?.args).toEqual(["dentist", { openOnly: true, limit: 5 }]);
    expect(store.last("readList")).toBeUndefined();
  });
});
