import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseOptionalString, readJsonObject } from "@/lib/api";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";

const STATUS_COLORS = new Set([
  "gray",
  "sky",
  "amber",
  "violet",
  "indigo",
  "emerald",
  "green",
  "rose",
]);

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await requireEditor();
    const routeParams = await params;
    const body = await readJsonObject(req);
    const label = parseOptionalString(body.label);
    const id = parseOptionalString(body.id);
    const color = typeof body.color === "string" && STATUS_COLORS.has(body.color)
      ? body.color
      : "gray";

    if (!label) throw badRequest("Status label is required");

    const campaign = await prisma.campaign.findFirst({
      where: { id: routeParams.id, organisationId: org.id },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const status = await prisma.workflowStatus.upsert({
      where: {
        campaignId_label: {
          campaignId: routeParams.id,
          label,
        },
      },
      create: {
        ...(id ? { id } : {}),
        campaignId: routeParams.id,
        label,
        color,
      },
      update: { color },
    });

    return NextResponse.json(
      {
        data: {
          id: status.id,
          label: status.label,
          color: status.color,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(
      "POST /api/campaigns/[id]/statuses",
      err,
      "Failed to save workflow status"
    );
  }
}
