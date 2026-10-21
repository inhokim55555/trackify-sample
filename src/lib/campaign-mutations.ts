import { SaveSessionChangedError, type SaveOwner } from "./record-save-queue";
import type { Campaign, CampaignSubcategory } from "./campaign-defaults";

/** All operations for one campaign share ordering, including full metadata responses. */
export class CampaignMutationQueue {
  private tails = new Map<string, Promise<unknown>>();
  private controllers = new Set<AbortController>();
  private listeners = new Set<(origin: object) => void>();

  constructor(private getOwner: () => SaveOwner | null) {}

  subscribe(listener: (origin: object) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  isPending(key: string) { return this.tails.has(key); }

  reset() {
    this.controllers.forEach((controller) => controller.abort());
    this.controllers.clear();
    this.tails.clear();
  }

  run<T>(key: string, owner: SaveOwner | null, origin: object,
    operation: (signal: AbortSignal, assertCurrent: () => void) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const assertCurrent = () => {
      const current = this.getOwner();
      if (controller.signal.aborted || !owner || current?.userId !== owner.userId || current.revision !== owner.revision) {
        throw new SaveSessionChangedError();
      }
    };
    try { assertCurrent(); } catch (error) { return Promise.reject(error); }
    this.controllers.add(controller);
    const previous = this.tails.get(key) ?? Promise.resolve();
    let onAbort: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new SaveSessionChangedError());
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    const work = previous.catch(() => undefined).then(async () => {
      assertCurrent();
      try {
        const result = await operation(controller.signal, assertCurrent);
        assertCurrent();
        return result;
      } finally {
        // Even a lost response may have committed. A remounted provider must revalidate.
        if (!controller.signal.aborted && this.getOwner() === owner) {
          this.listeners.forEach((listener) => listener(origin));
        }
      }
    });
    const result = Promise.race([work, cancelled]);
    this.tails.set(key, result);
    // Handle cleanup without creating an unobserved rejected promise.
    void result.then(cleanup, cleanup);
    const queue = this;
    function cleanup() {
      controller.signal.removeEventListener("abort", onAbort);
      queue.controllers.delete(controller);
      if (queue.tails.get(key) === result) queue.tails.delete(key);
    }
    return result;
  }
}

/** The API upserts by name; retries and returned canonical IDs must not add rows. */
export function mergeConfirmedSubcategory(campaign: Campaign, saved: CampaignSubcategory, previousId?: string | null): Campaign {
  if (saved.name.trim().toLowerCase() === "paid" || saved.name.trim().toLowerCase() === "seeding") {
    const segment = saved.name.trim().toLowerCase() as "paid" | "seeding";
    return { ...campaign, segmentCollections: { ...campaign.segmentCollections, [segment]: saved.collectionId ?? null } };
  }
  const existing = campaign.subcategories.findIndex((item) => item.id === saved.id || item.id === previousId || item.name === saved.name);
  const subcategories = campaign.subcategories.filter((item, index) => index === existing || (item.id !== saved.id && item.id !== previousId && item.name !== saved.name));
  if (existing < 0) subcategories.push(saved);
  else subcategories[subcategories.findIndex((item) => item.id === campaign.subcategories[existing].id)] = saved;
  return { ...campaign, subcategories };
}
