import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseOptionalString, readJsonObject } from "@/lib/api";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await requireEditor();
    const routeParams = await params;
    const body = await readJsonObject(req);
    const name = parseOptionalString(body.name);
    const trackerKind = body.trackerKind === "paid" ? "paid" : "seeding";
    const id = parseOptionalString(body.id);
    const collectionId = parseOptionalString(body.collectionId);

    if (!name) throw badRequest("Subcategory name is required");

    const campaign = await prisma.campaign.findFirst({
      where: { id: routeParams.id, organisationId: org.id },
      select: { id: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (collectionId) {
      const collection = await prisma.collection.findFirst({
        where: { id: collectionId, organisationId: org.id },
        select: { id: true },
      });
      if (!collection) throw badRequest("Collection not found");
    }

    const subcategory = await prisma.campaignSubcategory.upsert({
      where: {
        campaignId_name: {
          campaignId: routeParams.id,
          name,
        },
      },
      create: {
        ...(id ? { id } : {}),
        campaignId: routeParams.id,
        name,
        trackerKind,
        collectionId,
      },
      update: { trackerKind, collectionId },
    });

    return NextResponse.json(
      {
        data: {
          id: subcategory.id,
          name: subcategory.name,
          trackerKind: subcategory.trackerKind === "paid" ? "paid" : "seeding",
          collectionId: subcategory.collectionId ?? null,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(
      "POST /api/campaigns/[id]/subcategories",
      err,
      "Failed to create campaign subcategory"
    );
  }
}
