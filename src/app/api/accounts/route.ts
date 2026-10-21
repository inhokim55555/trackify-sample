import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseSort } from "@/lib/api";
import { getCurrentUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseFilters, videoWhereForFilters } from "@/lib/query";
import {
  computeVideoRows,
  loadViralCohortRows,
  loadVideosByWhere,
  rollupAccounts,
  type ComputedAccountRow,
} from "@/lib/server-metrics";

export const dynamic = "force-dynamic";

const SORTABLE: Record<string, (a: ComputedAccountRow) => number> = {
  totalViews: (a) => a.totalViews,
  videosTracked: (a) => a.videosTracked,
  viralRate: (a) => a.viralRate,
  highViralRate: (a) => a.highViralRate,
  avgEngagementRate: (a) => a.avgEngagementRate,
  totalEngagement: (a) => a.totalEngagement,
  totalLikes: (a) => a.totalLikes,
  totalComments: (a) => a.totalComments,
  avgViewsPerVideo: (a) => a.avgViewsPerVideo,
  highestVideoViews: (a) => a.highestVideoViews,
};

export async function GET(req: NextRequest) {
  try {
    const { org } = await getCurrentUserContext();
    const sp = req.nextUrl.searchParams;
    const filters = parseFilters(sp);
    const { sortKey, direction, multiplier, sorter } = parseSort(
      sp,
      SORTABLE,
      "totalViews"
    );

    const videoWhere = await videoWhereForFilters(org.id, filters);
    const [loaded, cohortRows] = await Promise.all([
      loadVideosByWhere(videoWhere, filters.from, filters.to),
      loadViralCohortRows(videoWhere, filters.to),
    ]);
    const computedVideos = computeVideoRows(
      loaded,
      filters.from,
      filters.to,
      cohortRows
    );

    const accountIds = Array.from(
      new Set(computedVideos.map((v) => v.accountId))
    );
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: {
        id: true,
        platform: true,
        handle: true,
        displayName: true,
        avatarUrl: true,
        status: true,
        firstTrackedAt: true,
        lastRefreshAt: true,
      },
    });

    const rows = rollupAccounts(accounts, computedVideos);
    rows.sort((a, b) => (sorter(a) - sorter(b)) * multiplier);

    return NextResponse.json({
      meta: { total: rows.length, sort: sortKey, dir: direction },
      data: rows,
    });
  } catch (err) {
    return handleApiError("GET /api/accounts", err, "Failed to load accounts");
  }
}
