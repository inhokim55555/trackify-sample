import { REFRESH_HEARTBEAT_MS, RefreshOwnershipLostError, renewRefreshRun, type RefreshOwner } from "@/lib/refresh-jobs";

/** Keep slow provider calls alive without holding a database transaction open. */
export function startRefreshHeartbeat(owner: RefreshOwner) {
  let lost = false;
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (pending || lost) return;
    pending = renewRefreshRun(owner)
      .catch(() => { lost = true; }) // Database uncertainty fails closed.
      .finally(() => { pending = undefined; });
  }, REFRESH_HEARTBEAT_MS);
  timer.unref();
  return {
    assertOwned() { if (lost) throw new RefreshOwnershipLostError(); },
    async stop() { clearInterval(timer); await pending; },
  };
}
