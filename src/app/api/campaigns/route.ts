import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseOptionalString, readJsonObject } from "@/lib/api";
import { getCurrentUserContext, requireEditor } from "@/lib/auth";
import { ensureStarterCampaigns } from "@/lib/campaign-bootstrap";
import { prisma } from "@/lib/db";
import {
  CAMPAIGN_STAGES,
  type Campaign,
  type CampaignTrackerKind,
} from "@/lib/campaign-defaults";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const { org } = await getCurrentUserContext();
    if (process.env.ENABLE_DEMO_BOOTSTRAP === "true") {
      await ensureStarterCampaigns(org.id);
    }
    const campaigns = await loadCampaigns(org.id);
    return NextResponse.json({ data: campaigns });
  } catch (err) {
    return handleApiError("GET /api/campaigns", err, "Failed to load campaigns");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { org } = await requireEditor();
    const body = await readJsonObject(req);
    const name = parseOptionalString(body.name);
    if (!name) throw badRequest("Campaign name is required");

    const brand = parseOptionalString(body.brand) ?? name;
    const startsAt = dateFromIso(parseOptionalString(body.startsAt) ?? dateOnly(new Date()));
    const endsAt = dateFromIso(
      parseOptionalString(body.endsAt) ?? dateOnly(addDays(startsAt, 30))
    );
    const stage =
      typeof body.stage === "string" && CAMPAIGN_STAGES.includes(body.stage as any)
        ? body.stage
        : "Planning";

    const created = await prisma.campaign.create({
      data: {
        organisationId: org.id,
        name,
        brand,
        stage,
        budget: Math.max(0, Number(body.budget) || 0),
        startsAt,
        endsAt,
        notes: parseOptionalString(body.notes) ?? "",
      },
      include: { subcategories: { orderBy: { createdAt: "asc" } } },
    });

    return NextResponse.json({ data: campaignToDto(created) }, { status: 201 });
  } catch (err) {
    return handleApiError("POST /api/campaigns", err, "Failed to create campaign");
  }
}

async function loadCampaigns(organisationId: string): Promise<Campaign[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { organisationId, archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      subcategories: { orderBy: { createdAt: "asc" } },
    },
  });

  return campaigns.map(campaignToDto);
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
    stage: parseCampaignStage(campaign.stage),
    notes: campaign.notes,
    segmentCollections,
    subcategories: campaign.subcategories
      .filter((subcategory) => !defaultSubcategoryKind(subcategory.name))
      .map((subcategory) => ({
        id: subcategory.id,
        name: subcategory.name,
        trackerKind: parseTrackerKind(subcategory.trackerKind),
        collectionId: subcategory.collectionId ?? null,
      })),
  };
}

function parseCampaignStage(value: string) {
  return CAMPAIGN_STAGES.includes(value as (typeof CAMPAIGN_STAGES)[number])
    ? (value as (typeof CAMPAIGN_STAGES)[number])
    : "Planning";
}

function parseTrackerKind(value: string): CampaignTrackerKind {
  return value === "paid" ? "paid" : "seeding";
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateFromIso(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw badRequest("Invalid campaign date");
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function defaultSubcategoryKind(name: string): CampaignTrackerKind | null {
  const normalized = name.trim().toLowerCase();
  if (normalized === "seeding") return "seeding";
  if (normalized === "paid") return "paid";
  return null;
}
