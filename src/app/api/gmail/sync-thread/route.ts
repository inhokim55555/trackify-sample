import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { handleApiError, parseOptionalString, readJsonObject } from "@/lib/api";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import {
  extractGmailThreadId,
  fetchGmailThreadMetadata,
  getValidGmailAccessToken,
  type GmailThreadAttachment,
} from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { org, user } = await requireEditor();
    const body = await readJsonObject(req);
    const assignmentId = parseOptionalString(body.assignmentId);
    if (!assignmentId) throw badRequest("Influencer assignment is required");

    const rawThread =
      body.thread && typeof body.thread === "object" && !Array.isArray(body.thread)
        ? (body.thread as Record<string, unknown>)
        : {};
    const attachmentId =
      parseOptionalString(body.attachmentId) ?? parseOptionalString(rawThread.id);
    const threadUrl =
      parseOptionalString(body.threadUrl) ?? parseOptionalString(rawThread.url) ?? "";
    const requestedThreadId =
      parseOptionalString(body.threadId) ??
      parseOptionalString(rawThread.gmailThreadId) ??
      extractGmailThreadId(threadUrl);
    const threadId = extractGmailThreadId(requestedThreadId);
    if (!threadId) throw badRequest("Gmail thread link or thread ID is required");

    const assignment = await prisma.campaignInfluencer.findFirst({
      where: {
        id: assignmentId,
        archivedAt: null,
        campaign: { organisationId: org.id, archivedAt: null },
      },
      select: {
        id: true,
        gmailThreads: true,
        trackerFields: true,
      },
    });
    if (!assignment) throw badRequest("Influencer assignment not found");

    const { accessToken } = await getValidGmailAccessToken(user.id);
    const metadata = await fetchGmailThreadMetadata({ accessToken, threadId });
    const threads = normalizeThreads(assignment.gmailThreads);
    const targetIndex = threads.findIndex(
      (thread) =>
        (attachmentId && thread.id === attachmentId) ||
        thread.gmailThreadId === metadata.threadId ||
        Boolean(thread.url && thread.url === threadUrl)
    );
    const existing = targetIndex >= 0 ? threads[targetIndex] : null;
    const updatedThread: GmailThreadAttachment = {
      id: existing?.id ?? attachmentId ?? `gmail-${metadata.threadId}`,
      subject: metadata.subject || existing?.subject || "Gmail thread",
      url: threadUrl || existing?.url || "",
      lastMessageAt: metadata.lastMessageAt,
      notes: existing?.notes ?? parseOptionalString(rawThread.notes) ?? "",
      gmailThreadId: metadata.threadId,
      syncedAt: new Date().toISOString(),
      lastSender: metadata.lastSender,
    };
    const updatedThreads =
      targetIndex >= 0
        ? threads.map((thread, index) => (index === targetIndex ? updatedThread : thread))
        : [...threads, updatedThread];

    const fields = jsonObject(assignment.trackerFields);
    const lastContacted = metadata.lastMessageAt;
    const lastUpdated = todayIso();
    const nextFields: Prisma.InputJsonObject = {
      ...fields,
      lastContacted,
      lastUpdated,
      date: typeof fields.date === "string" && fields.date ? fields.date : lastContacted,
    };

    await prisma.$transaction([
      prisma.campaignInfluencer.update({
        where: { id: assignment.id },
        data: {
          contactedAt: new Date(`${lastContacted}T00:00:00.000Z`),
          gmailThreads: updatedThreads as unknown as Prisma.InputJsonArray,
          trackerFields: nextFields,
        },
      }),
      prisma.gmailConnection.update({
        where: { userId: user.id },
        data: { lastSyncedAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      data: {
        assignmentId: assignment.id,
        lastContacted,
        lastUpdated,
        gmailThreads: updatedThreads,
        syncedThread: updatedThread,
      },
    });
  } catch (err) {
    return handleApiError(
      "POST /api/gmail/sync-thread",
      err,
      "Failed to sync Gmail thread"
    );
  }
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

function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.InputJsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.InputJsonValue>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
