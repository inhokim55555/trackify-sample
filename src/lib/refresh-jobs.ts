import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const REFRESH_LEASE_MS = 120_000;
export const REFRESH_HEARTBEAT_MS = 30_000;
export const REFRESH_DEADLINE_MS = 30 * 60_000;
export type RefreshOwner = { organisationId: string; runId: string };

export class RefreshOwnershipLostError extends Error {
  constructor() {
    super("Refresh ownership expired or changed. Saved progress is retained; start a new refresh to recover.");
    this.name = "RefreshOwnershipLostError";
  }
}

// The workspace row serializes claim, takeover and fenced writes. Never perform
// provider/network calls in this transaction. Compatible with transaction pooling.
// Queue this process's heartbeat and foreground writes before opening their
// transactions, so they cannot consume the database lock timeout on each other.
// Database locks and ownership checks still protect against other processes.
const workspaceTransactions = new Map<string, Promise<void>>();

async function withWorkspaceLock<T>(organisationId: string, work: (tx: Prisma.TransactionClient, now: Date) => Promise<T>) {
  const previous = workspaceTransactions.get(organisationId) ?? Promise.resolve();
  const pending = previous.then(() => prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Organisation" WHERE "id" = ${organisationId} FOR NO KEY UPDATE
    `;
    if (!rows.length) throw new Error("Organisation not found for metric refresh.");
    // Read time after acquiring the lock, not the transaction start timestamp.
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    return work(tx, clock.now);
  }, { isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 15_000 }));
  // Keep the queue usable after a rejected transaction without swallowing the
  // caller's error. Remove only our tail; a newer queued operation owns its tail.
  const tail = pending.then(() => undefined, () => undefined);
  workspaceTransactions.set(organisationId, tail);
  try { return await pending; }
  finally {
    if (workspaceTransactions.get(organisationId) === tail) workspaceTransactions.delete(organisationId);
  }
}

export async function claimRefreshRun(organisationId: string, source: string): Promise<
  { acquired: true; owner: RefreshOwner } | { acquired: false; runId: string }
> {
  return withWorkspaceLock(organisationId, async (tx, now) => {
    const lease = await tx.metricRefreshLease.findUnique({ where: { organisationId } });
    if (lease && lease.expiresAt > now && lease.deadlineAt > now) {
      return { acquired: false, runId: lease.runId };
    }
    if (lease) {
      const previous = await tx.metricRefreshRun.findUniqueOrThrow({ where: { id: lease.runId } });
      const failures = Array.isArray(previous.failureSummary) ? previous.failureSummary : [];
      await tx.metricRefreshRun.update({
        where: { id: lease.runId },
        data: {
          status: "failed", finishedAt: now,
          failureSummary: [
            { error: "Refresh interrupted: ownership expired. Completed updates were retained; recovery started a new run." },
            ...failures.slice(0, 49),
          ] as Prisma.InputJsonValue,
        },
      });
      await tx.metricRefreshLease.delete({ where: { organisationId } });
    }
    // Old application versions have no lease. Do not assume their worker died.
    // Operators must drain old workers and close orphaned legacy runs explicitly.
    const legacy = await tx.metricRefreshRun.findFirst({
      where: { organisationId, status: "running" }, orderBy: { startedAt: "asc" }, select: { id: true },
    });
    if (legacy) return { acquired: false, runId: legacy.id };
    const run = await tx.metricRefreshRun.create({
      data: { organisationId, source, status: "running", startedAt: now }, select: { id: true },
    });
    await tx.metricRefreshLease.create({ data: {
      organisationId, runId: run.id, heartbeatAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_LEASE_MS),
      deadlineAt: new Date(now.getTime() + REFRESH_DEADLINE_MS),
    } });
    return { acquired: true, owner: { organisationId, runId: run.id } };
  });
}

export async function withOwnedRefresh<T>(owner: RefreshOwner, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return withWorkspaceLock(owner.organisationId, async (tx, now) => {
    const lease = await tx.metricRefreshLease.findUnique({ where: { organisationId: owner.organisationId } });
    if (!lease || lease.runId !== owner.runId || lease.expiresAt <= now || lease.deadlineAt <= now) {
      throw new RefreshOwnershipLostError();
    }
    const run = await tx.metricRefreshRun.findUnique({ where: { id: owner.runId }, select: { status: true } });
    if (run?.status !== "running") throw new RefreshOwnershipLostError();
    await tx.metricRefreshLease.update({ where: { organisationId: owner.organisationId }, data: {
      heartbeatAt: now, expiresAt: new Date(Math.min(now.getTime() + REFRESH_LEASE_MS, lease.deadlineAt.getTime())),
    } });
    return work(tx);
  });
}

export async function renewRefreshRun(owner: RefreshOwner): Promise<void> {
  await withOwnedRefresh(owner, async () => undefined);
}

export async function finishRefreshRun(owner: RefreshOwner, status: "success" | "partial" | "failed"): Promise<void> {
  await withOwnedRefresh(owner, async (tx) => {
    const [clock] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    await tx.metricRefreshRun.update({ where: { id: owner.runId }, data: { status, finishedAt: clock.now } });
    await tx.metricRefreshLease.delete({ where: { organisationId: owner.organisationId } });
  });
}
