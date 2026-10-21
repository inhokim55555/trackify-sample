import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getCurrentUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  compareViralPerformance,
  computeVideoRows,
  loadViralCohortRows,
  loadVideos,
  topViralVideoIdsFromCohort,
} from "@/lib/server-metrics";

export const dynamic = "force-dynamic";

interface AppNotification {
  id: string;
  tone: "info" | "warning" | "danger" | "success";
  title: string;
  body: string;
  href: string;
  createdAt: string;
}

export async function GET() {
  try {
    const { org } = await getCurrentUserContext();
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - 7 * 86_400_000);
    const notifications: AppNotification[] = [];

    const recentRuns = await prisma.metricRefreshRun.findMany({
      where: {
        organisationId: org.id,
        status: { in: ["failed", "partial"] },
      },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        source: true,
        status: true,
        failed: true,
        videosChecked: true,
        startedAt: true,
      },
    });

    for (const run of recentRuns) {
      notifications.push({
        id: `refresh-${run.id}`,
        tone: run.status === "failed" ? "danger" : "warning",
        title:
          run.status === "failed"
            ? run.failed === 0 ? "Metric refresh interrupted" : "Metric refresh failed"
            : "Metric refresh partially completed",
        body: run.status === "failed" && run.failed === 0
          ? `${run.source} refresh stopped before completion. Completed updates were retained. The next scheduled refresh can start a new run.`
          : `${run.source} checked ${run.videosChecked} videos with ${run.failed} failures.`,
        href: "/videos",
        createdAt: run.startedAt.toISOString(),
      });
    }

    const staleCount = await prisma.video.count({
      where: {
        organisationId: org.id,
        OR: [
          { currentMetric: { is: null } },
          { currentMetric: { is: { capturedAt: { lt: staleCutoff } } } },
        ],
      },
    });

    if (staleCount > 0) {
      notifications.push({
        id: "stale-current-metrics",
        tone: "warning",
        title: `${staleCount.toLocaleString()} videos need metric updates`,
        body: "Current metrics are missing or older than 7 days.",
        href: "/videos",
        createdAt: now.toISOString(),
      });
    }

    const from = utcMidnight(new Date(now.getTime() - 29 * 86_400_000));
    const to = utcMidnight(now);
    const viralWhere = {
      organisationId: org.id,
      currentMetric: { isNot: null },
    };
    const cohortRows = await loadViralCohortRows(viralWhere, to);
    const viralCandidateIds = topViralVideoIdsFromCohort(cohortRows, to, 10);
    const loaded = await loadVideos(
      viralCandidateIds,
      from,
      to
    );
    const viralVideos = computeVideoRows(loaded, from, to, cohortRows)
      .filter((video) => video.viralLabel === "Breakout")
      .sort(compareViralPerformance)
      .slice(0, 3);

    for (const video of viralVideos) {
      notifications.push({
        id: `viral-${video.id}`,
        tone: "success",
        title: `${video.accountHandle} is a breakout`,
        body: `${video.viralReason} across ${video.viralCohortLabel}.`,
        href: `/videos/${video.id}`,
        createdAt: video.metricCapturedAt ?? now.toISOString(),
      });
    }

    notifications.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ data: notifications.slice(0, 10) });
  } catch (err) {
    return handleApiError(
      "GET /api/notifications",
      err,
      "Failed to load notifications"
    );
  }
}

function utcMidnight(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
