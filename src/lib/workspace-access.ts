import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, badRequest, forbidden, notFound } from "@/lib/errors";

export const SEED_USER_PREFIX = "seed-";

export interface AccessActor {
  userId: string;
  organisationId: string;
  supabaseUserId: string;
}

/**
 * Rare access changes share one database lock. The transaction-scoped lock is
 * released at commit/rollback and works with transaction connection pooling.
 * ReadCommitted makes reads after waiting see the previous lock holder's commit.
 */
export async function withWorkspaceAccess<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1414676811, 1)`;
      return operation(tx);
    }, { isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 10_000 });
  } catch (error) {
    const failure = error as { code?: string; meta?: { code?: string } } | null;
    if (failure?.code === "P2028" || failure?.code === "P2024"
      || (failure?.code === "P2010" && failure.meta?.code === "55P03")) {
      throw new AppError("Team access is busy. Please retry in a moment.", 503);
    }
    throw error;
  }
}

/** Recheck the authenticated identity after acquiring the access lock. */
export async function assertActingAdmin(tx: Prisma.TransactionClient, actor: AccessActor) {
  const current = await tx.user.findFirst({
    where: { id: actor.userId, organisationId: actor.organisationId, supabaseUserId: actor.supabaseUserId },
    select: { role: true, disabledAt: true },
  });
  if (!current || current.role !== "Admin" || current.disabledAt) {
    throw forbidden("Admin access is required. Your access may have changed; reload and try again.");
  }
}

/** All routes that change an existing user's access must call this inside the lock. */
export async function updateWorkspaceUserAccess(
  tx: Prisma.TransactionClient,
  actor: AccessActor,
  targetId: string,
  data: { role?: string; disabledAt?: Date | null }
) {
  await assertActingAdmin(tx, actor);
  const target = await tx.user.findFirst({
    where: { id: targetId, organisationId: actor.organisationId },
    select: { id: true, role: true, disabledAt: true, supabaseUserId: true },
  });
  if (!target) throw notFound("User not found");
  if (data.disabledAt && target.id === actor.userId) throw badRequest("You cannot disable your own user.");

  const nextRole = data.role ?? target.role;
  const nextDisabledAt = data.disabledAt === undefined ? target.disabledAt : data.disabledAt;
  if (target.role === "Admin" && !target.disabledAt && !target.supabaseUserId.startsWith(SEED_USER_PREFIX)
      && (nextRole !== "Admin" || nextDisabledAt)) {
    const enabledAdmins = await tx.user.count({
      where: { organisationId: actor.organisationId, role: "Admin", disabledAt: null,
        NOT: { supabaseUserId: { startsWith: SEED_USER_PREFIX } } },
    });
    if (enabledAdmins <= 1) {
      throw badRequest("The workspace must have at least one active admin. Make another teammate an admin first.");
    }
  }
  return tx.user.update({
    where: { id: target.id }, data,
    select: { id: true, email: true, name: true, role: true, disabledAt: true, createdAt: true },
  });
}
