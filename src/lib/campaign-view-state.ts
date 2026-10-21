import type { RecordSaveQueue, SaveSnapshot } from "./record-save-queue";

export interface CampaignPage { key: string; page: number }

/** A changed filter context starts at page zero before its request is rendered. */
export function reconcileCampaignPage(current: CampaignPage, key: string): CampaignPage {
  return current.key === key ? current : { key, page: 0 };
}

export function mergeCampaignDrafts<T extends { id: string }>(
  records: T[],
  pending: SaveSnapshot<T>[],
  normalize: (record: T) => T
): T[] {
  const drafts = new Map(pending.map((entry) => [entry.record.id, entry.record]));
  return records.map((record) => drafts.get(record.id) ?? normalize(record));
}

/** Stable external snapshots avoid missing queue events between render and subscription. */
export function createCampaignSaveView<T extends { id: string }>(queue: RecordSaveQueue<T>) {
  type Snapshot = {
    pending: SaveSnapshot<T>[];
    states: Record<string, SaveSnapshot<T>["state"]>;
  };
  const serverSnapshot: Snapshot = { pending: [], states: {} };
  let snapshot: Snapshot = {
    pending: queue.snapshots(),
    states: Object.fromEntries(queue.snapshots().map((entry) => [entry.record.id, entry.state])),
  };
  const listeners = new Set<() => void>();
  function pendingStates(pending: SaveSnapshot<T>[]) {
    return Object.fromEntries(pending.map((entry) => [entry.record.id, entry.state]));
  }
  queue.subscribe((event) => {
    const pending = queue.snapshots();
    snapshot = event.state === "reset"
      ? { pending: [], states: {} }
      : { pending, states: listeners.size > 0
        ? { ...snapshot.states, [event.record.id]: event.state }
        : pendingStates(pending) };
    listeners.forEach((listener) => listener());
  });
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        // Pending drafts survive navigation; completed status badges do not need
        // to accumulate for every row edited during the lifetime of a browser tab.
        if (listeners.size === 0) snapshot = { pending: snapshot.pending, states: pendingStates(snapshot.pending) };
      };
    },
  };
}
