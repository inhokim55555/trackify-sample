import { NextRequest, NextResponse } from "next/server";
import { handleApiError, readJsonObject } from "@/lib/api";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parseTrackVideoRequestBody,
  trackVideoForOrg,
} from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * Track a single video. Body: { videoUrl, collectionId? }.
 */
export async function POST(req: NextRequest) {
  try {
    const { org } = await requireEditor();
    const input = parseTrackVideoRequestBody(await readJsonObject(req));
    const { source, scraped, result, video } = await trackVideoForOrg(org.id, input);
    const total = await prisma.video.count({ where: { organisationId: org.id } });

    return NextResponse.json(
      {
        data: {
          accountId: result.accountId,
          videoUrl: video?.url ?? input.videoUrl,
          platform: scraped.platform,
          videosAdded: result.videosAdded,
          metricsSynced: result.metricsSynced,
          totalTrackedVideos: total,
          source: source.name,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(
      "POST /api/track/video",
      err,
      "Failed to track video"
    );
  }
}
