import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getCurrentUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseFilters } from "@/lib/query";
import {
  buildOverview,
  computeVideoRows,
  loadViralCohortRows,
  loadVideos,
} from "@/lib/server-metrics";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await getCurrentUserContext();
    const routeParams = await params;
    const filters = parseFilters(req.nextUrl.searchParams);

    const account = await prisma.account.findFirst({
      where: { id: routeParams.id, organisationId: org.id },
      include: { videos: { select: { id: true } } },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const videoIds = account.videos.map((v: { id: string }) => v.id);
    const [loaded, cohortRows] = await Promise.all([
      loadVideos(videoIds, filters.from, filters.to),
      loadViralCohortRows(
        { id: { in: videoIds }, organisationId: org.id },
        filters.to
      ),
    ]);
    const overview = buildOverview(loaded, filters.from, filters.to);
    const videos = computeVideoRows(
      loaded,
      filters.from,
      filters.to,
      cohortRows
    ).sort((a, b) => b.totalViews - a.totalViews);

    return NextResponse.json({
      account: {
        id: account.id,
        platform: account.platform,
        handle: account.handle,
        displayName: account.displayName,
        avatarUrl: account.avatarUrl,
        status: account.status,
        firstTrackedAt: account.firstTrackedAt.toISOString(),
        lastRefreshAt: account.lastRefreshAt.toISOString(),
        videosTracked: videoIds.length,
      },
      kpis: overview.kpis,
      daily: overview.daily,
      videos,
    });
  } catch (err) {
    return handleApiError(
      "GET /api/accounts/[id]",
      err,
      "Failed to load account"
    );
  }
}
