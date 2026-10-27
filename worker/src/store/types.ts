// The item store seam. One file per task manager implements this.

export interface ListRef {
  id: string;
  name: string;
}

export interface Item {
  id: string;
  title: string;
  listId?: string;
  listName?: string;
  status?: string;
  dueAt?: string;
  body?: string;
}

export interface NewItem {
  title: string;
  body?: string;
  externalId?: string;
}

export interface ReadFilter {
  dueBefore?: string;
  dueAfter?: string;
  limit?: number;
}

export interface FindOptions {
  openOnly?: boolean;
  limit?: number;
}

export interface ItemStore {
  lists(): Promise<ListRef[]>;
  createItems(listId: string | null, items: NewItem[], opts?: { enrich?: boolean }): Promise<Item[]>;
  completeItem(id: string): Promise<Item>;
  annotateItem(id: string, text: string): Promise<Item>;
  readList(listId: string | null, filter?: ReadFilter): Promise<Item[]>;
  findItems(words: string, opts?: FindOptions): Promise<Item[]>;
}
