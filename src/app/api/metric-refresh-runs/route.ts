import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseClampedInt } from "@/lib/api";
import { getCurrentUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { org } = await getCurrentUserContext();
    const limit = parseClampedInt(req.nextUrl.searchParams.get("limit"), 10, 1, 50);
    const runs = await prisma.metricRefreshRun.findMany({
      where: {
        organisationId: org.id,
      },
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true,
        source: true,
        status: true,
        videosChecked: true,
        succeeded: true,
        failed: true,
        metricsSynced: true,
        failureSummary: true,
        startedAt: true,
        finishedAt: true,
        lease: { select: { expiresAt: true, deadlineAt: true } },
      },
    });

    // Use the database clock, matching lease ownership checks across app hosts.
    const [{ now }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;

    return NextResponse.json({
      data: runs.map(({ lease, ...run }) => {
        const interrupted = run.status === "running" && lease &&
          (lease.expiresAt <= now || lease.deadlineAt <= now);
        return {
          ...run,
          status: interrupted ? "interrupted" : run.status,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) {
    return handleApiError(
      "GET /api/metric-refresh-runs",
      err,
      "Failed to load metric refresh runs"
    );
  }
}
