import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getCurrentUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gmailConnectionStatus } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { user } = await getCurrentUserContext();
    const connection = await prisma.gmailConnection.findUnique({
      where: { userId: user.id },
    });

    return NextResponse.json({
      data: {
        configured: process.env.PORTFOLIO_SAMPLE === '1' || Boolean(
          process.env.GOOGLE_CLIENT_ID &&
            process.env.GOOGLE_CLIENT_SECRET &&
            process.env.GMAIL_TOKEN_ENCRYPTION_KEY
        ),
        ...gmailConnectionStatus(connection),
      },
    });
  } catch (err) {
    return handleApiError("GET /api/gmail/status", err, "Failed to load Gmail status");
  }
}

export async function DELETE() {
  try {
    const { user } = await getCurrentUserContext();
    await prisma.gmailConnection.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ data: gmailConnectionStatus(null) });
  } catch (err) {
    return handleApiError(
      "DELETE /api/gmail/status",
      err,
      "Failed to disconnect Gmail"
    );
  }
}
