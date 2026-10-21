import { NextRequest, NextResponse } from "next/server";
import { handleApiError, readJsonObject } from "@/lib/api";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { safeErrorMessage } from "@/lib/safe-output";
import { parseManualMetricPoint } from "@/lib/manual-metric-input";
import {
  syncCurrentMetricSnapshot,
  syncDailyMetricSnapshots,
} from "@/lib/metric-snapshots";

export const dynamic = "force-dynamic";

interface MetricUpdateInput {
  videoId?: string;
  url?: string;
  views?: unknown;
  likes?: unknown;
  comments?: unknown;
  shares?: unknown;
  saves?: unknown;
  capturedAt?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const { org } = await requireEditor();
    const body = await readJsonObject(req, { maxBytes: 2_000_000 });
    const updates = Array.isArray(body.updates)
      ? (body.updates as MetricUpdateInput[])
      : [];
    if (updates.length === 0) throw badRequest("No metric updates found");
    if (updates.length > 1000) throw badRequest("Import up to 1000 rows at a time");

    const source = typeof body.source === "string" && body.source.trim()
      ? body.source.trim().slice(0, 32)
      : "manual";

    let updated = 0;
    let currentUpdated = 0;
    let historyOnly = 0;
    const failures: { row: number; error: string }[] = [];

    for (let i = 0; i < updates.length; i++) {
      try {
        const input = updates[i];
        const point = parseManualMetricPoint(input);
        const video = await findVideo(org.id, input);
        if (!video) throw new Error("Tracked video not found");

        await syncDailyMetricSnapshots(video.id, [point]);
        const changedCurrent = await syncCurrentMetricSnapshot(video.id, point, source);
        if (changedCurrent) currentUpdated += 1;
        else historyOnly += 1;
        updated += 1;
      } catch (err) {
        failures.push({
          row: i + 1,
          error: safeErrorMessage(err, "Unknown import error"),
        });
      }
    }

    return NextResponse.json({
      data: {
        updated,
        currentUpdated,
        historyOnly,
        failed: failures.length,
        failures: failures.slice(0, 25),
      },
    });
  } catch (err) {
    return handleApiError(
      "POST /api/videos/current-metrics",
      err,
      "Failed to update video metrics"
    );
  }
}

async function findVideo(organisationId: string, input: MetricUpdateInput) {
  if (typeof input.videoId === "string" && input.videoId.trim()) {
    return prisma.video.findFirst({
      where: { id: input.videoId.trim(), organisationId },
      select: { id: true },
    });
  }

  if (typeof input.url === "string" && input.url.trim()) {
    return prisma.video.findFirst({
      where: { url: normalizeUrl(input.url), organisationId },
      select: { id: true },
    });
  }

  throw new Error("Missing videoId or url");
}

function normalizeUrl(value: string) {
  try {
    return new URL(value.trim()).toString();
  } catch {
    return value.trim();
  }
}
