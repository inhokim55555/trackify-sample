import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getCurrentUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseFilters, videoWhereForFilters } from "@/lib/query";
import {
  compareViralPerformance,
  computeVideoRows,
  loadViralCohortRows,
  loadVideos,
  loadVideosByWhere,
  topViralVideoIdsFromCohort,
} from "@/lib/server-metrics";
import {
  buildOverviewFromDatabase,
  loadTopGainVideoIds,
} from "@/lib/overview-analytics";

export const dynamic = "force-dynamic";
const VIDEO_STATS_ROW_LIMIT = 8;
const MOST_VIRAL_ROW_LIMIT = 6;

export async function GET(req: NextRequest) {
  try {
    const { org } = await getCurrentUserContext();
    const filters = parseFilters(req.nextUrl.searchParams);
    const viralSortParam = req.nextUrl.searchParams.get("viralSort");
    const sortMode =
      viralSortParam === "total" || viralSortParam === "gains"
        ? viralSortParam
        : "score";

    const videoWhere = await videoWhereForFilters(org.id, filters);
    const topViewsLimit = Math.max(VIDEO_STATS_ROW_LIMIT, MOST_VIRAL_ROW_LIMIT);

    const [
      trackedVideos,
      overview,
      topViewsLoaded,
      topGainVideoIds,
      cohortRows,
    ] =
      await Promise.all([
        prisma.video.count({ where: videoWhere }),
        buildOverviewFromDatabase(org.id, filters),
        loadVideosByWhere(videoWhere, filters.from, filters.to, {
          orderBy: [
            { currentMetric: { views: "desc" } },
            { uploadDate: "desc" },
            { id: "asc" },
          ],
          take: topViewsLimit,
        }),
        loadTopGainVideoIds(org.id, filters, MOST_VIRAL_ROW_LIMIT * 2),
        loadViralCohortRows(videoWhere, filters.to),
      ]);

    const topViewsComputed = computeVideoRows(
      topViewsLoaded,
      filters.from,
      filters.to,
      cohortRows
    ).sort((a, b) => b.totalViews - a.totalViews);
    const videoStatsRows = topViewsComputed
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, VIDEO_STATS_ROW_LIMIT);

    const topViralVideoIds = topViralVideoIdsFromCohort(
      cohortRows,
      filters.to,
      MOST_VIRAL_ROW_LIMIT * 2
    );
    const candidateIds = uniqueIds([
      ...topViralVideoIds,
      ...topGainVideoIds,
      ...topViewsLoaded.map((video) => video.meta.id),
    ]);
    const candidateLoaded =
      candidateIds.length > 0
        ? await loadVideos(candidateIds, filters.from, filters.to)
        : [];
    const mostViralSource = computeVideoRows(
      candidateLoaded,
      filters.from,
      filters.to,
      cohortRows
    ).sort((a, b) => {
      if (sortMode === "total") return b.totalViews - a.totalViews;
      if (sortMode === "gains") return b.gainViews - a.gainViews;
      return compareViralPerformance(a, b);
    });

    const mostViral = mostViralSource
      .slice(0, MOST_VIRAL_ROW_LIMIT * 2)
      .map((v) => ({
        id: v.id,
        platform: v.platform,
        caption: v.caption,
        accountHandle: v.accountHandle,
        url: v.url,
        totalViews: v.totalViews,
        gainViews: v.gainViews,
        engagementRate: v.engagementRate,
        totalLikes: v.totalLikes,
        totalComments: v.totalComments,
        totalShares: v.totalShares,
        totalSaves: v.totalSaves,
        viralLabel: v.viralLabel,
        viralScore: v.viralScore,
        viralPercentile: v.viralPercentile,
        viralViewsPerDay: v.viralViewsPerDay,
        viralCohortMedianViewsPerDay: v.viralCohortMedianViewsPerDay,
        viralCohortSize: v.viralCohortSize,
        viralCohortLabel: v.viralCohortLabel,
        viralReason: v.viralReason,
        viralConfidence: v.viralConfidence,
        viralEngagementIndex: v.viralEngagementIndex,
      }));

    return NextResponse.json({
      meta: {
        from: filters.from.toISOString(),
        to: filters.to.toISOString(),
        days: filters.days,
        platform: filters.platform,
        collectionId: filters.collectionId,
        trackedVideos,
      },
      kpis: overview.kpis,
      daily: overview.daily,
      cumulative: overview.cumulative,
      videoStatsRows,
      mostViral,
    });
  } catch (err) {
    return handleApiError("GET /api/overview", err, "Failed to load overview");
  }
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}
