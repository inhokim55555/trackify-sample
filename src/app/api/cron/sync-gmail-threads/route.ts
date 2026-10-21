import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { handleApiError, parseClampedInt } from "@/lib/api";
import { prisma } from "@/lib/db";
import { forbidden } from "@/lib/errors";
import { safeErrorMessage } from "@/lib/safe-output";
import {
  extractGmailThreadId,
  fetchGmailThreadMetadata,
  getValidGmailAccessToken,
  type GmailThreadAttachment,
} from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SyncFailure {
  assignmentId?: string;
  thread?: string;
  message: string;
}

export async function GET(req: NextRequest) {
  return runSync(req);
}

export async function POST(req: NextRequest) {
  return runSync(req);
}

async function runSync(req: NextRequest) {
  try {
    assertCronSecret(req);
    const sp = req.nextUrl.searchParams;
    const limitPerUser = parseClampedInt(sp.get("limitPerUser"), 100, 1, 500);
    const organisationId = sp.get("organisationId") ?? undefined;
    const failures: SyncFailure[] = [];
    const connections = await prisma.gmailConnection.findMany({
      where: organisationId ? { user: { organisationId } } : undefined,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            organisationId: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    let assignmentsChecked = 0;
    let assignmentsSynced = 0;
    let threadsSynced = 0;

    for (const connection of connections) {
      let accessToken = "";
      try {
        const token = await getValidGmailAccessToken(connection.userId);
        accessToken = token.accessToken;
      } catch (err) {
        failures.push({
          message: `${connection.user.email}: ${errorMessage(err)}`,
        });
        continue;
      }

      const assignments = await prisma.campaignInfluencer.findMany({
        where: {
          archivedAt: null,
          campaign: {
            organisationId: connection.user.organisationId,
            archivedAt: null,
          },
        },
        select: {
          id: true,
          gmailThreads: true,
          trackerFields: true,
        },
        orderBy: { updatedAt: "desc" },
      });

      let processedForUser = 0;
      for (const assignment of assignments) {
        if (processedForUser >= limitPerUser) break;
        const threads = normalizeThreads(assignment.gmailThreads);
        if (!threads.some((thread) => gmailThreadId(thread))) continue;

        processedForUser += 1;
        assignmentsChecked += 1;

        const result = await syncThreads({
          accessToken,
          assignmentId: assignment.id,
          threads,
          failures,
        });

        if (!result.lastContacted || result.syncedCount === 0) continue;

        const fields = jsonObject(assignment.trackerFields);
        const lastUpdated = todayIso();
        const nextFields: Prisma.InputJsonObject = {
          ...fields,
          lastContacted: result.lastContacted,
          lastUpdated,
          date:
            typeof fields.date === "string" && fields.date
              ? fields.date
              : result.lastContacted,
        };

        await prisma.campaignInfluencer.update({
          where: { id: assignment.id },
          data: {
            contactedAt: new Date(`${result.lastContacted}T00:00:00.000Z`),
            gmailThreads: result.updatedThreads as unknown as Prisma.InputJsonArray,
            trackerFields: nextFields,
          },
        });

        assignmentsSynced += 1;
        threadsSynced += result.syncedCount;
      }

      if (processedForUser > 0) {
        await prisma.gmailConnection.update({
          where: { userId: connection.userId },
          data: { lastSyncedAt: new Date() },
        });
      }
    }

    return NextResponse.json({
      data: {
        connectionsChecked: connections.length,
        assignmentsChecked,
        assignmentsSynced,
        threadsSynced,
        failures: failures.slice(0, 25),
      },
    });
  } catch (err) {
    return handleApiError(
      "GET/POST /api/cron/sync-gmail-threads",
      err,
      "Failed to sync Gmail threads"
    );
  }
}

async function syncThreads({
  accessToken,
  assignmentId,
  threads,
  failures,
}: {
  accessToken: string;
  assignmentId: string;
  threads: GmailThreadAttachment[];
  failures: SyncFailure[];
}) {
  let syncedCount = 0;
  const updatedThreads: GmailThreadAttachment[] = [];

  for (const thread of threads) {
    const threadId = gmailThreadId(thread);
    if (!threadId) {
      updatedThreads.push(thread);
      continue;
    }

    try {
      const metadata = await fetchGmailThreadMetadata({ accessToken, threadId });
      updatedThreads.push({
        ...thread,
        subject: metadata.subject || thread.subject || "Gmail thread",
        lastMessageAt: metadata.lastMessageAt,
        gmailThreadId: metadata.threadId,
        syncedAt: new Date().toISOString(),
        lastSender: metadata.lastSender,
      });
      syncedCount += 1;
    } catch (err) {
      failures.push({
        assignmentId,
        thread: thread.url || thread.gmailThreadId || thread.subject,
        message: errorMessage(err),
      });
      updatedThreads.push(thread);
    }
  }

  return {
    updatedThreads,
    syncedCount,
    lastContacted: latestThreadDate(updatedThreads),
  };
}

function normalizeThreads(value: Prisma.JsonValue): GmailThreadAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const object = item as Record<string, unknown>;
      return {
        id: String(object.id ?? ""),
        subject: String(object.subject ?? "Gmail thread"),
        url: String(object.url ?? ""),
        lastMessageAt: String(object.lastMessageAt ?? ""),
        notes: String(object.notes ?? ""),
        gmailThreadId: stringValue(object.gmailThreadId),
        syncedAt: stringValue(object.syncedAt),
        lastSender: stringValue(object.lastSender),
      };
    });
}

function gmailThreadId(thread: GmailThreadAttachment) {
  return (
    extractGmailThreadId(thread.gmailThreadId ?? "") ||
    extractGmailThreadId(thread.url) ||
    ""
  );
}

function latestThreadDate(threads: GmailThreadAttachment[]) {
  return [...threads]
    .map((thread) => thread.lastMessageAt)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0];
}

function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.InputJsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.InputJsonValue>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function errorMessage(err: unknown) {
  return safeErrorMessage(err, "Unknown sync error");
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function assertCronSecret(req: NextRequest) {
  const configured = process.env.CRON_SECRET;
  if (!configured) {
    throw new Error("CRON_SECRET is not configured.");
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice("bearer ".length).trim()
    : "";

  if (!token || !secureEqual(token, configured)) {
    throw forbidden("Invalid cron secret");
  }
}

function secureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
