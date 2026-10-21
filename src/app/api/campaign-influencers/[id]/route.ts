import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await requireEditor();
    const routeParams = await params;
    const assignment = await prisma.campaignInfluencer.findFirst({
      where: {
        id: routeParams.id,
        archivedAt: null,
        campaign: { organisationId: org.id },
      },
      select: { id: true },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Influencer row not found" }, { status: 404 });
    }

    await prisma.campaignInfluencer.update({
      where: { id: routeParams.id },
      data: { archivedAt: new Date() },
    });

    return NextResponse.json({ data: { id: routeParams.id, archived: true } });
  } catch (err) {
    return handleApiError(
      "DELETE /api/campaign-influencers/[id]",
      err,
      "Failed to archive influencer row"
    );
  }
}
