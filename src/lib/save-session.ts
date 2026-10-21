import type { SaveOwner } from "./record-save-queue";

export interface SaveSession { owner: SaveOwner | null; ready: boolean }

/** Browser-memory identity only: never stores tokens or user drafts. */
export class SaveSessionStore {
  private revision = 0;
  private state: SaveSession = { owner: null, ready: false };
  private listeners = new Set<(session: SaveSession) => void>();

  snapshot() { return this.state; }

  subscribe(listener: (session: SaveSession) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  setUser(userId: string | null) {
    if (this.state.ready && (this.state.owner?.userId ?? null) === userId) return;
    this.state = { owner: userId ? { userId, revision: ++this.revision } : null, ready: true };
    this.listeners.forEach((listener) => listener(this.state));
  }

  clear() {
    this.revision++;
    this.state = { owner: null, ready: true };
    this.listeners.forEach((listener) => listener(this.state));
  }
}

export const saveSession = new SaveSessionStore();
