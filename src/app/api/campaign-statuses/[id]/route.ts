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
    const status = await prisma.workflowStatus.findFirst({
      where: {
        id: routeParams.id,
        campaign: { organisationId: org.id },
      },
      select: { id: true },
    });

    if (!status) {
      return NextResponse.json({ error: "Status not found" }, { status: 404 });
    }

    await prisma.workflowStatus.delete({ where: { id: routeParams.id } });
    return NextResponse.json({ data: { id: routeParams.id, deleted: true } });
  } catch (err) {
    return handleApiError(
      "DELETE /api/campaign-statuses/[id]",
      err,
      "Failed to delete workflow status"
    );
  }
}
