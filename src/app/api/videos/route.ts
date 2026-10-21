import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import {
  handleApiError,
  parseClampedInt,
  parseSort,
  readJsonObject,
} from "@/lib/api";
import { getCurrentUserContext, requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseFilters, videoWhereForFilters } from "@/lib/query";
import {
  computeVideoRows,
  loadViralCohortRows,
  loadVideosByWhere,
  type ComputedVideoRow,
} from "@/lib/server-metrics";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

const SORTABLE: Record<string, (v: ComputedVideoRow) => number> = {
  views: (v) => v.totalViews,
  gainViews: (v) => v.gainViews,
  engagementRate: (v) => v.engagementRate,
  likes: (v) => v.totalLikes,
  comments: (v) => v.totalComments,
  shares: (v) => v.totalShares,
  saves: (v) => v.totalSaves,
  delta24h: (v) => v.delta24h,
  delta7d: (v) => v.delta7d,
  viral: (v) => v.viralScore,
  uploadDate: (v) => new Date(v.uploadDate).getTime(),
};

export async function GET(req: NextRequest) {
  try {
    const { org } = await getCurrentUserContext();
    const sp = req.nextUrl.searchParams;
    const filters = parseFilters(sp);

    const { sortKey, direction, multiplier, sorter } = parseSort(
      sp,
      SORTABLE,
      "views"
    );
    const limit = parseClampedInt(sp.get("limit"), 50, 1, 500);
    const offset = parseClampedInt(sp.get("offset"), 0, 0, 1_000_000);

    const videoWhere = await videoWhereForFilters(org.id, filters);
    const dbOrderBy = videoOrderByForSort(sortKey, direction);
    if (dbOrderBy) {
      const [total, loaded, cohortRows] = await Promise.all([
        prisma.video.count({ where: videoWhere }),
        loadVideosByWhere(videoWhere, filters.from, filters.to, {
          orderBy: dbOrderBy,
          skip: offset,
          take: limit,
        }),
        loadViralCohortRows(videoWhere, filters.to),
      ]);
      const page = computeVideoRows(loaded, filters.from, filters.to, cohortRows);
      page.sort((a, b) => (sorter(a) - sorter(b)) * multiplier);

      return NextResponse.json({
        meta: {
          total,
          limit,
          offset,
          sort: sortKey,
          dir: direction,
        },
        data: page,
      });
    }

    const [loaded, cohortRows] = await Promise.all([
      loadVideosByWhere(videoWhere, filters.from, filters.to),
      loadViralCohortRows(videoWhere, filters.to),
    ]);
    const computed = computeVideoRows(loaded, filters.from, filters.to, cohortRows);

    computed.sort((a, b) => (sorter(a) - sorter(b)) * multiplier);

    const page = computed.slice(offset, offset + limit);

    return NextResponse.json({
      meta: {
        total: computed.length,
        limit,
        offset,
        sort: sortKey,
        dir: direction,
      },
      data: page,
    });
  } catch (err) {
    return handleApiError("GET /api/videos", err, "Failed to load videos");
  }
}

function videoOrderByForSort(
  sortKey: string,
  direction: "asc" | "desc"
): Prisma.VideoOrderByWithRelationInput[] | null {
  const currentMetricFields: Record<string, keyof Prisma.VideoCurrentMetricOrderByWithRelationInput> = {
    views: "views",
    likes: "likes",
    comments: "comments",
    shares: "shares",
    saves: "saves",
  };

  const metricField = currentMetricFields[sortKey];
  if (metricField) {
    return [
      { currentMetric: { [metricField]: direction } },
      { uploadDate: "desc" },
      { id: "asc" },
    ] as Prisma.VideoOrderByWithRelationInput[];
  }

  if (sortKey === "uploadDate") {
    return [{ uploadDate: direction }, { id: "asc" }];
  }

  return null;
}

export async function DELETE(req: NextRequest) {
  try {
    const { org } = await requireEditor();
    const body = await readJsonObject(req, { maxBytes: 200_000 });
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string" && !!id.trim())
      : [];

    const uniqueIds = Array.from(new Set(ids.map((id) => id.trim())));
    if (uniqueIds.length === 0) throw badRequest("No videos selected");
    if (uniqueIds.length > 100) {
      throw badRequest("Stop tracking up to 100 videos at a time");
    }

    const result = await prisma.video.deleteMany({
      where: { id: { in: uniqueIds }, organisationId: org.id },
    });

    return NextResponse.json({ data: { deleted: result.count } });
  } catch (err) {
    return handleApiError("DELETE /api/videos", err, "Failed to delete videos");
  }
}
