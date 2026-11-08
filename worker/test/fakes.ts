// An in-memory item store that records every call, and an in-memory KV.

import type { KV } from "../src/auth";
import type { FindOptions, Item, ItemStore, ListRef, NewItem, ReadFilter } from "../src/store/types";

export interface Call {
  method: string;
  args: unknown[];
}

export class FakeStore implements ItemStore {
  calls: Call[] = [];
  listsToReturn: ListRef[] = [
    { id: "L1", name: "Groceries" },
    { id: "L2", name: "Errands" },
  ];
  found: Item[] = [];
  listed: Item[] = [];
  private nextId = 1;

  async lists(): Promise<ListRef[]> {
    this.calls.push({ method: "lists", args: [] });
    return this.listsToReturn;
  }

  async createItems(listId: string | null, items: NewItem[], opts?: { enrich?: boolean }): Promise<Item[]> {
    this.calls.push({ method: "createItems", args: [listId, items, opts] });
    return items.map((i) => ({ id: `I${this.nextId++}`, title: i.title, dueAt: i.dueAt, listId: listId ?? undefined }));
  }

  async completeItem(id: string): Promise<Item> {
    this.calls.push({ method: "completeItem", args: [id] });
    const item = this.found.find((f) => f.id === id);
    return { ...(item ?? { id, title: id }), status: "completed" };
  }

  async annotateItem(id: string, text: string): Promise<Item> {
    this.calls.push({ method: "annotateItem", args: [id, text] });
    const item = this.found.find((f) => f.id === id);
    return { ...(item ?? { id, title: id }), body: text };
  }

  async readList(listId: string | null, filter?: ReadFilter): Promise<Item[]> {
    this.calls.push({ method: "readList", args: [listId, filter] });
    return this.listed;
  }

  async findItems(words: string, opts?: FindOptions): Promise<Item[]> {
    this.calls.push({ method: "findItems", args: [words, opts] });
    return this.found;
  }

  last(method: string): Call | undefined {
    return [...this.calls].reverse().find((c) => c.method === method);
  }
}

export class FakeKV implements KV {
  data = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}
