import { NextRequest, NextResponse } from "next/server";
import { handleApiError, readJsonObject } from "@/lib/api";
import { requireEditor } from "@/lib/auth";
import {
  assertCollectionBelongsToOrg,
  ensureCollectionMember,
} from "@/lib/collections";
import { prisma } from "@/lib/db";
import { safeErrorMessage } from "@/lib/safe-output";
import {
  parseTrackVideosRequestBody,
  trackVideoForOrg,
  trackVideoUrlLookupVariants,
  type TrackVideoRequestInput,
} from "@/lib/tracking";

export const dynamic = "force-dynamic";

type ImportStatus = "imported" | "already_tracked" | "failed";

interface ImportItemResult {
  inputUrl: string;
  videoUrl: string;
  status: ImportStatus;
  source?: string;
  videosAdded?: number;
  metricsSynced?: number;
  error?: string;
}

/**
 * Track many video URLs in one request. Body: { videoUrls: string[], collectionId? }.
 */
export async function POST(req: NextRequest) {
  try {
    const { org } = await requireEditor();
    const input = parseTrackVideosRequestBody(await readJsonObject(req));
    const startedAt = Date.now();

    if (input.collectionId) {
      await assertCollectionBelongsToOrg(org.id, input.collectionId);
    }

    const existingByInputUrl = await existingTrackedVideosByInputUrl(
      org.id,
      input.videos
    );
    const resolvedInputs = await mapWithConcurrency(
      input.videos,
      input.concurrency,
      async (videoInput) => {
        const existing = existingByInputUrl.get(videoInput.videoUrl);
        if (existing) {
          if (input.collectionId) {
            await ensureCollectionMember(input.collectionId, { videoId: existing.id });
          }
          return {
            result: {
              inputUrl: videoInput.videoUrl,
              videoUrl: existing.url ?? videoInput.videoUrl,
              status: "already_tracked" as const,
              videosAdded: 0,
              metricsSynced: 0,
            },
          };
        }
        return { toTrack: videoInput };
      }
    );

    const alreadyTracked = resolvedInputs.flatMap((inputResult) =>
      inputResult.result ? [inputResult.result] : []
    );
    const toTrack = resolvedInputs.flatMap((inputResult) =>
      inputResult.toTrack ? [inputResult.toTrack] : []
    );

    const tracked = await mapWithConcurrency(
      toTrack,
      input.concurrency,
      async (videoInput): Promise<ImportItemResult> => {
        try {
          const trackedVideo = await trackVideoForOrg(org.id, videoInput, {
            skipCollectionAssert: Boolean(input.collectionId),
          });
          return {
            inputUrl: videoInput.videoUrl,
            videoUrl: trackedVideo.video?.url ?? videoInput.videoUrl,
            status: "imported",
            source: trackedVideo.source.name,
            videosAdded: trackedVideo.result.videosAdded,
            metricsSynced: trackedVideo.result.metricsSynced,
          };
        } catch (err) {
          return {
            inputUrl: videoInput.videoUrl,
            videoUrl: videoInput.videoUrl,
            status: "failed",
            error: safeErrorMessage(err, "Failed to track video"),
          };
        }
      }
    );

    const items = preserveInputOrder(input.videos, [...alreadyTracked, ...tracked]);
    const total = await prisma.video.count({ where: { organisationId: org.id } });
    const summary = {
      requested: input.videos.length,
      imported: items.filter((item) => item.status === "imported").length,
      alreadyTracked: items.filter((item) => item.status === "already_tracked").length,
      failed: items.filter((item) => item.status === "failed").length,
      metricsSynced: items.reduce((sum, item) => sum + (item.metricsSynced ?? 0), 0),
      durationMs: Date.now() - startedAt,
      concurrency: input.concurrency,
    };

    return NextResponse.json(
      {
        data: {
          summary,
          items,
          totalTrackedVideos: total,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(
      "POST /api/track/videos",
      err,
      "Failed to track videos"
    );
  }
}

async function existingTrackedVideosByInputUrl(
  organisationId: string,
  inputs: TrackVideoRequestInput[]
) {
  const lookupUrls = Array.from(
    new Set(inputs.flatMap((input) => trackVideoUrlLookupVariants(input.videoUrl)))
  );
  const existingVideos = lookupUrls.length
    ? await prisma.video.findMany({
        where: { organisationId, url: { in: lookupUrls } },
        select: { id: true, url: true },
      })
    : [];
  const byLookupUrl = new Map(
    existingVideos
      .filter((video): video is { id: string; url: string } => Boolean(video.url))
      .map((video) => [video.url, video])
  );

  return new Map(
    inputs.flatMap((input) => {
      const match = trackVideoUrlLookupVariants(input.videoUrl)
        .map((url) => byLookupUrl.get(url))
        .find(Boolean);
      return match ? [[input.videoUrl, match] as const] : [];
    })
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

function preserveInputOrder(
  inputs: TrackVideoRequestInput[],
  results: ImportItemResult[]
) {
  const byInputUrl = new Map(results.map((result) => [result.inputUrl, result]));
  return inputs.flatMap((input) => {
    const result = byInputUrl.get(input.videoUrl);
    return result ? [result] : [];
  });
}
