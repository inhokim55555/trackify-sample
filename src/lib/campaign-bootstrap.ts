import { Prisma } from "@prisma/client";
import {
  DEFAULT_WORKFLOW_STATUSES,
  SAMPLE_CAMPAIGNS,
  STARTER_INFLUENCERS,
  type CampaignTrackerKind,
  type StarterInfluencer,
} from "@/lib/campaign-defaults";
import { prisma } from "@/lib/db";

export async function ensureStarterCampaigns(organisationId: string) {
  const count = await prisma.campaign.count({ where: { organisationId } });
  if (count > 0) return;

  for (const campaign of SAMPLE_CAMPAIGNS) {
    await prisma.campaign.create({
      data: {
        id: campaign.id,
        organisationId,
        name: campaign.name,
        brand: campaign.brand,
        stage: campaign.stage,
        budget: campaign.budget,
        startsAt: dateFromIso(campaign.startsAt),
        endsAt: dateFromIso(campaign.endsAt),
        notes: campaign.notes,
      },
    });

    await prisma.campaignSubcategory.createMany({
      data: [
        {
          id: `${campaign.id}-seeding`,
          campaignId: campaign.id,
          name: "Seeding",
          trackerKind: "seeding",
        },
        {
          id: `${campaign.id}-paid`,
          campaignId: campaign.id,
          name: "Paid",
          trackerKind: "paid",
        },
      ],
      skipDuplicates: true,
    });

    await prisma.workflowStatus.createMany({
      data: DEFAULT_WORKFLOW_STATUSES.map((status) => ({
        id: `${campaign.id}-${status.id}`,
        campaignId: campaign.id,
        label: status.label,
        color: status.color,
      })),
      skipDuplicates: true,
    });
  }
}

export async function ensureStarterInfluencers(organisationId: string) {
  const count = await prisma.campaignInfluencer.count({
    where: { campaign: { organisationId } },
  });
  if (count > 0) return;

  await ensureStarterCampaigns(organisationId);

  for (const record of STARTER_INFLUENCERS) {
    const campaignId = record.campaignIds[0];
    if (!campaignId) continue;

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organisationId },
      select: { id: true },
    });
    if (!campaign) continue;

    const handle = normalizeHandle(record.handle);
    const influencer = await prisma.influencer.upsert({
      where: {
        organisationId_profile: {
          organisationId,
          profile: handle,
        },
      },
      create: {
        organisationId,
        profile: handle,
        name: record.creatorName,
        platform: record.platform,
        followerCount: record.followerCount,
        category: record.category,
      },
      update: {
        name: record.creatorName,
        platform: record.platform,
        followerCount: record.followerCount,
        category: record.category,
      },
    });

    await prisma.campaignInfluencer.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        campaignId,
        influencerId: influencer.id,
        trackerKind: trackerKindForRateType(record.rateType),
        status: record.status,
        rate: record.negotiatedRate,
        contactedAt: dateOrNull(record.lastContacted),
        notes: record.notes,
        gmailThreads: [],
        trackerFields: starterTrackerFields(record),
      },
      update: {
        campaignId,
        influencerId: influencer.id,
        trackerKind: trackerKindForRateType(record.rateType),
        status: record.status,
        rate: record.negotiatedRate,
        contactedAt: dateOrNull(record.lastContacted),
        notes: record.notes,
        trackerFields: starterTrackerFields(record),
      },
    });
  }
}

function starterTrackerFields(
  record: StarterInfluencer
): Prisma.InputJsonObject {
  return {
    id: record.id,
    creatorName: record.creatorName,
    handle: record.handle,
    profile: record.handle,
    platform: record.platform,
    category: record.category,
    followerCount: record.followerCount,
    engagementRate: record.engagementRate,
    negotiatedRate: record.negotiatedRate,
    rateType: record.rateType,
    lastContacted: record.lastContacted,
    lastUpdated: record.lastUpdated,
    status: record.status,
    notes: record.notes,
    priority: record.priority ?? "Normal",
    nextFollowUp: record.nextFollowUp ?? "",
    deliverableDue: record.deliverableDue ?? "",
    statusHistory: record.statusHistory ?? [],
    campaignIds: record.campaignIds,
    date: record.lastContacted,
    source: record.category,
    concept: record.category,
    name: record.creatorName,
  };
}

function trackerKindForRateType(rateType: string): CampaignTrackerKind {
  return rateType === "Gifted" ? "seeding" : "paid";
}

function normalizeHandle(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function dateFromIso(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOrNull(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
