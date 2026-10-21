import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseClampedInt } from "@/lib/api";
import { forbidden } from "@/lib/errors";
import { refreshTrackedVideoMetrics } from "@/lib/video-refresh";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return runRefresh(req);
}

export async function POST(req: NextRequest) {
  return runRefresh(req);
}

async function runRefresh(req: NextRequest) {
  try {
    assertCronSecret(req);
    const sp = req.nextUrl.searchParams;
    const result = await refreshTrackedVideoMetrics({
      organisationId: sp.get("organisationId") ?? undefined,
      limitPerOrg: parseClampedInt(sp.get("limitPerOrg"), 250, 1, 1000),
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    return handleApiError(
      "GET/POST /api/cron/refresh-video-metrics",
      err,
      "Failed to refresh video metrics"
    );
  }
}

function assertCronSecret(req: NextRequest) {
  const configured = process.env.CRON_SECRET;
  if (!configured) {
    throw new Error("CRON_SECRET is not configured.");
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice("bearer ".length).trim()
    : "";

  if (!token || !secureEqual(token, configured)) {
    throw forbidden("Invalid cron secret");
  }
}

function secureEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
