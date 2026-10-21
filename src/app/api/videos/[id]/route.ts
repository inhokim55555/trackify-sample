import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseClampedInt } from "@/lib/api";
import { getCurrentUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

interface MetricSnapshot {
  id: string;
  date: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await getCurrentUserContext();
    const routeParams = await params;
    const limit = parseClampedInt(
      req.nextUrl.searchParams.get("limit"),
      180,
      1,
      1000
    );

    const video = await prisma.video.findFirst({
      where: { id: routeParams.id, organisationId: org.id },
      include: {
        account: {
          select: {
            id: true,
            handle: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        currentMetric: {
          select: {
            capturedAt: true,
            views: true,
            likes: true,
            comments: true,
            shares: true,
            saves: true,
            source: true,
          },
        },
        dailyMetrics: {
          orderBy: { date: "desc" },
          take: limit,
          select: {
            id: true,
            date: true,
            views: true,
            likes: true,
            comments: true,
            shares: true,
            saves: true,
          },
        },
      },
    });

    if (!video) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const snapshots = [...(video.dailyMetrics as MetricSnapshot[])]
      .reverse()
      .map((row, index, rows) => {
        const previous = rows[index - 1];
        const engagement = row.likes + row.comments + row.shares + row.saves;
        return {
          id: row.id,
          date: row.date.toISOString(),
          views: row.views,
          likes: row.likes,
          comments: row.comments,
          shares: row.shares,
          saves: row.saves,
          engagementRate: row.views > 0 ? (engagement / row.views) * 100 : 0,
          viewDelta: previous ? row.views - previous.views : null,
          likeDelta: previous ? row.likes - previous.likes : null,
          commentDelta: previous ? row.comments - previous.comments : null,
          shareDelta: previous ? row.shares - previous.shares : null,
          saveDelta: previous ? row.saves - previous.saves : null,
        };
      })
      .reverse();

    const current = video.currentMetric
      ? {
          capturedAt: video.currentMetric.capturedAt.toISOString(),
          views: video.currentMetric.views,
          likes: video.currentMetric.likes,
          comments: video.currentMetric.comments,
          shares: video.currentMetric.shares,
          saves: video.currentMetric.saves,
          engagementRate:
            video.currentMetric.views > 0
              ? ((video.currentMetric.likes +
                  video.currentMetric.comments +
                  video.currentMetric.shares +
                  video.currentMetric.saves) /
                  video.currentMetric.views) *
                100
              : 0,
          source: video.currentMetric.source,
        }
      : null;

    return NextResponse.json({
      data: {
        id: video.id,
        platform: video.platform,
        caption: video.caption,
        thumbnailUrl: video.thumbnailUrl,
        url: video.url,
        uploadDate: video.uploadDate.toISOString(),
        account: {
          id: video.account.id,
          handle: video.account.handle,
          displayName: video.account.displayName,
          avatarUrl: video.account.avatarUrl,
        },
        current,
        snapshots,
      },
    });
  } catch (err) {
    return handleApiError(
      "GET /api/videos/[id]",
      err,
      "Failed to load video details"
    );
  }
}
