import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseOptionalString, readJsonObject } from "@/lib/api";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await requireEditor();
    const routeParams = await params;
    const body = await readJsonObject(req);
    const source = await prisma.campaign.findFirst({
      where: { id: routeParams.id, organisationId: org.id, archivedAt: null },
      include: { subcategories: true },
    });

    if (!source) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const name = parseOptionalString(body.name) ?? `${source.name} Copy`;
    const duplicated = await prisma.campaign.create({
      data: {
        organisationId: org.id,
        name,
        brand: source.brand,
        stage: "Planning",
        budget: source.budget,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        notes: source.notes,
        subcategories: {
          create: source.subcategories
            .filter((subcategory) => !isDefaultSubcategory(subcategory.name))
            .map((subcategory) => ({
              name: subcategory.name,
              trackerKind: subcategory.trackerKind,
            })),
        },
      },
      include: { subcategories: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json(
      {
        data: {
          id: duplicated.id,
          name: duplicated.name,
          brand: duplicated.brand,
          objective: "",
          owner: "",
          startsAt: dateOnly(duplicated.startsAt),
          endsAt: dateOnly(duplicated.endsAt),
          budget: duplicated.budget,
          stage: duplicated.stage,
          notes: duplicated.notes,
          subcategories: duplicated.subcategories
            .filter((subcategory) => !isDefaultSubcategory(subcategory.name))
            .map((subcategory) => ({
              id: subcategory.id,
              name: subcategory.name,
              trackerKind: subcategory.trackerKind === "paid" ? "paid" : "seeding",
            })),
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(
      "POST /api/campaigns/[id]/duplicate",
      err,
      "Failed to duplicate campaign"
    );
  }
}

function isDefaultSubcategory(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized === "seeding" || normalized === "paid";
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}
