export interface SaveSnapshot<T> {
  record: T;
  state: "saving" | "saved" | "error";
  error?: string;
  replacedId?: string;
}

export interface SaveOwner { userId: string; revision: number }
export class SaveSessionChangedError extends Error {
  constructor() { super("Your sign-in session changed. This save was cancelled."); }
}
type SaveEvent<T> = SaveSnapshot<T> | { state: "reset" };

interface PendingSave<T> {
  key: string;
  originalId: string;
  generation: number;
  owner: SaveOwner;
  record: T;
  revision: number;
  running: boolean;
  timer?: ReturnType<typeof setTimeout>;
  error?: string;
  controller?: AbortController;
  waiters: { revision: number; resolve: (record: T) => void; reject: (error: Error) => void }[];
}

/** Serializes writes per record and retains failed drafts until an explicit retry. */
export class RecordSaveQueue<T extends { id: string }> {
  private pending = new Map<string, PendingSave<T>>();
  private listeners = new Set<(snapshot: SaveEvent<T>) => void>();
  private owner: SaveOwner | null = null;
  private generation = 0;

  constructor(private persist: (record: T, context: { owner: SaveOwner; signal: AbortSignal }) => Promise<T>, private delayMs = 500) {}

  subscribe(listener: (snapshot: SaveEvent<T>) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  setOwner(owner: SaveOwner | null) {
    if (this.owner?.userId === owner?.userId && this.owner?.revision === owner?.revision) return;
    this.reset();
    this.owner = owner;
  }

  reset() {
    this.generation++;
    this.owner = null;
    for (const entry of this.pending.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.controller?.abort();
      entry.waiters.forEach((waiter) => waiter.reject(new SaveSessionChangedError()));
      entry.waiters = [];
    }
    this.pending.clear();
    this.emit({ state: "reset" });
  }

  snapshots(): SaveSnapshot<T>[] {
    return Array.from(this.pending.values(), (entry) => ({
      record: entry.record,
      state: entry.error ? "error" : "saving",
      error: entry.error,
    }));
  }

  save(record: T, immediate = false, owner: SaveOwner | null = this.owner): Promise<T> {
    if (!owner || owner.userId !== this.owner?.userId || owner.revision !== this.owner.revision) {
      return Promise.reject(new SaveSessionChangedError());
    }
    let entry = this.pending.get(record.id);
    if (!entry) {
      entry = { key: record.id, originalId: record.id, generation: this.generation, owner, record, revision: 0, running: false, waiters: [] };
      this.pending.set(record.id, entry);
    }
    entry.record = record;
    entry.revision += 1;
    entry.error = undefined;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
    const promise = new Promise<T>((resolve, reject) => {
      entry!.waiters.push({ revision: entry!.revision, resolve, reject });
    });
    this.emit({ record, state: "saving" });
    if (!entry.running) {
      if (immediate) void this.run(entry);
      else entry.timer = setTimeout(() => { void this.run(entry!); }, this.delayMs);
    }
    return promise;
  }

  /** Route unmounts flush work; they must never cancel an unsent edit. */
  flush() {
    for (const entry of this.pending.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = undefined;
      if (!entry.running && !entry.error) void this.run(entry);
    }
  }

  private emit(snapshot: SaveEvent<T>) {
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private isCurrent(entry: PendingSave<T>) {
    return entry.generation === this.generation && this.pending.get(entry.key) === entry;
  }

  private async run(entry: PendingSave<T>) {
    if (entry.running || !this.isCurrent(entry)) return;
    entry.timer = undefined;
    entry.running = true;
    const revision = entry.revision;
    const record = entry.record;
    entry.controller = new AbortController();
    try {
      const saved = await this.persist(record, { owner: entry.owner, signal: entry.controller.signal });
      if (!this.isCurrent(entry)) return;
      if (saved.id !== entry.key) {
        const existing = this.pending.get(saved.id);
        if (existing && existing !== entry) throw new Error("Another edit for this influencer is already saving. Retry when it finishes.");
        this.pending.delete(entry.key);
        entry.key = saved.id;
        entry.record = { ...entry.record, id: saved.id };
        this.pending.set(entry.key, entry);
      }
      const completed = entry.waiters.filter((waiter) => waiter.revision <= revision);
      entry.waiters = entry.waiters.filter((waiter) => waiter.revision > revision);
      completed.forEach((waiter) => waiter.resolve(saved));
      if (entry.revision === revision) {
        this.pending.delete(entry.key);
        this.emit({ record: saved, state: "saved", replacedId: entry.originalId });
      }
      // A newer draft is already visible; never replace it with this old response.
    } catch (cause) {
      if (!this.isCurrent(entry)) return;
      const error = cause instanceof Error ? cause : new Error("Failed to save record");
      const completed = entry.waiters.filter((waiter) => waiter.revision <= revision);
      entry.waiters = entry.waiters.filter((waiter) => waiter.revision > revision);
      completed.forEach((waiter) => waiter.reject(error));
      if (entry.revision === revision) {
        entry.error = error.message;
        this.emit({ record: entry.record, state: "error", error: error.message });
      }
    } finally {
      entry.running = false;
      if (this.isCurrent(entry) && entry.revision > revision) void this.run(entry);
    }
  }
}

export interface BatchSaveResult<T> {
  succeeded: T[];
  failures: { record: T; error: string }[];
}

/** Bounded imports return every outcome so callers can retry only failed drafts. */
export async function saveRecordBatch<T>(
  records: T[],
  save: (record: T) => Promise<T>,
  concurrency = 3
): Promise<BatchSaveResult<T>> {
  const result: BatchSaveResult<T> = { succeeded: [], failures: [] };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(records.length, Math.max(1, concurrency)) }, async () => {
    while (next < records.length) {
      const record = records[next++];
      try { result.succeeded.push(await save(record)); }
      catch (error) {
        if (error instanceof SaveSessionChangedError) throw error;
        result.failures.push({ record, error: error instanceof Error ? error.message : "Failed to save record" });
      }
    }
  }));
  return result;
}
