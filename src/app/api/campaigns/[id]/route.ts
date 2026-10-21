import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseOptionalString, readJsonObject } from "@/lib/api";
import { requireEditor } from "@/lib/auth";
import { CAMPAIGN_STAGES, type Campaign } from "@/lib/campaign-defaults";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await requireEditor();
    const routeParams = await params;
    const body = await readJsonObject(req);

    const existing = await prisma.campaign.findFirst({
      where: { id: routeParams.id, organisationId: org.id, archivedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const data: {
      name?: string;
      brand?: string;
      stage?: string;
      budget?: number;
      startsAt?: Date;
      endsAt?: Date;
      notes?: string;
    } = {};

    if ("name" in body) {
      const name = parseOptionalString(body.name);
      if (!name) throw badRequest("Campaign name cannot be empty");
      data.name = name;
    }
    if ("brand" in body) {
      const brand = parseOptionalString(body.brand);
      if (!brand) throw badRequest("Brand cannot be empty");
      data.brand = brand;
    }
    if ("stage" in body) {
      if (typeof body.stage !== "string" || !CAMPAIGN_STAGES.includes(body.stage as any)) {
        throw badRequest("Invalid campaign stage");
      }
      data.stage = body.stage;
    }
    if ("budget" in body) {
      data.budget = Math.max(0, Number(body.budget) || 0);
    }
    if ("startsAt" in body && typeof body.startsAt === "string") {
      data.startsAt = dateFromIso(body.startsAt);
    }
    if ("endsAt" in body && typeof body.endsAt === "string") {
      data.endsAt = dateFromIso(body.endsAt);
    }
    if ("notes" in body && typeof body.notes === "string") {
      data.notes = body.notes;
    }

    const campaign = await prisma.campaign.update({
      where: { id: routeParams.id },
      data,
      include: { subcategories: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({ data: campaignToDto(campaign) });
  } catch (err) {
    return handleApiError(
      "PATCH /api/campaigns/[id]",
      err,
      "Failed to update campaign"
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await requireEditor();
    const routeParams = await params;
    const existing = await prisma.campaign.findFirst({
      where: { id: routeParams.id, organisationId: org.id, archivedAt: null },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    await prisma.campaign.update({
      where: { id: routeParams.id },
      data: { archivedAt: new Date() },
    });

    return NextResponse.json({ data: { id: routeParams.id, archived: true } });
  } catch (err) {
    return handleApiError(
      "DELETE /api/campaigns/[id]",
      err,
      "Failed to delete campaign"
    );
  }
}

function campaignToDto(campaign: {
  id: string;
  name: string;
  brand: string;
  startsAt: Date;
  endsAt: Date;
  budget: number;
  stage: string;
  notes: string;
  subcategories: {
    id: string;
    name: string;
    trackerKind: string;
    collectionId: string | null;
  }[];
}): Campaign {
  const segmentCollections: Campaign["segmentCollections"] = {
    seeding: null,
    paid: null,
  };
  for (const subcategory of campaign.subcategories) {
    const segment = defaultSubcategoryKind(subcategory.name);
    if (segment) segmentCollections[segment] = subcategory.collectionId ?? null;
  }

  return {
    id: campaign.id,
    name: campaign.name,
    brand: campaign.brand,
    objective: "",
    owner: "",
    startsAt: dateOnly(campaign.startsAt),
    endsAt: dateOnly(campaign.endsAt),
    budget: campaign.budget,
    stage: CAMPAIGN_STAGES.includes(campaign.stage as any)
      ? (campaign.stage as Campaign["stage"])
      : "Planning",
    notes: campaign.notes,
    segmentCollections,
    subcategories: campaign.subcategories
      .filter((subcategory) => !defaultSubcategoryKind(subcategory.name))
      .map((subcategory) => ({
        id: subcategory.id,
        name: subcategory.name,
        trackerKind: subcategory.trackerKind === "paid" ? "paid" : "seeding",
        collectionId: subcategory.collectionId ?? null,
      })),
  };
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromIso(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw badRequest("Invalid date");
  return date;
}

function defaultSubcategoryKind(name: string): Campaign["subcategories"][number]["trackerKind"] | null {
  const normalized = name.trim().toLowerCase();
  if (normalized === "seeding") return "seeding";
  if (normalized === "paid") return "paid";
  return null;
}
