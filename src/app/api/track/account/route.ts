import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: "Account tracking is disabled. Import a video URL instead." },
    { status: 410 }
  );
}
