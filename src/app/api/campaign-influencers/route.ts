import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { handleApiError, parseClampedInt, parseOptionalString, readJsonObject } from "@/lib/api";
import { getCurrentUserContext, requireEditor } from "@/lib/auth";
import {
  ensureStarterCampaigns,
  ensureStarterInfluencers,
} from "@/lib/campaign-bootstrap";
import { ensureCollectionMember } from "@/lib/collections";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { safeErrorMessage } from "@/lib/safe-output";
import {
  parseTrackVideoRequestBody,
  trackVideoForOrg,
  trackVideoUrlLookupVariants,
} from "@/lib/tracking";

type DashboardPlatform =
  | "TikTok"
  | "Instagram"
  | "YouTube"
  | "Facebook"
  | "Snapchat"
  | "X";
type RateType = "Flat" | "Gifted" | "Affiliate";
type MutableInputJsonObject = Record<string, Prisma.InputJsonValue>;

const PLATFORM_FALLBACK: DashboardPlatform = "TikTok";

interface LinkedCampaignVideoMetric {
  videoId: string;
  url: string;
  uploadDate: string;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  metricSource: string;
  metricCapturedAt: string;
  collectionIds: string[];
  collectionNames: string[];
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { org } = await getCurrentUserContext();
    if (process.env.ENABLE_DEMO_BOOTSTRAP === "true") {
      await ensureStarterCampaigns(org.id);
      await ensureStarterInfluencers(org.id);
    }

    const query = parseCampaignInfluencerQuery(req.nextUrl.searchParams);
    const baseWhere = buildCampaignBaseWhere(org.id, query);
    const filteredWhere = buildCampaignFilteredWhere(baseWhere, query);
    const orderBy = orderByForCampaignSort(query.sort, query.dir);

    const [statuses, total, filteredTotal, assignments, summaryRows] =
      await Promise.all([
        prisma.workflowStatus.findMany({
          where: { campaign: { organisationId: org.id } },
          orderBy: { createdAt: "asc" },
          select: { id: true, label: true, color: true },
        }),
        prisma.campaignInfluencer.count({ where: baseWhere }),
        prisma.campaignInfluencer.count({ where: filteredWhere }),
        prisma.campaignInfluencer.findMany({
          where: filteredWhere,
          orderBy,
          skip: query.offset,
          take: query.limit,
          include: {
            influencer: true,
            subcategory: true,
          },
        }),
        prisma.campaignInfluencer.findMany({
          where: baseWhere,
          select: {
            status: true,
            rate: true,
            updatedAt: true,
            trackerFields: true,
            influencer: { select: { category: true } },
          },
        }),
      ]);

    const linkedVideoMetrics = await loadLinkedCampaignVideoMetrics(
      org.id,
      linkedVideoIdsFromAssignments(assignments)
    );

    const statusDtos = statuses.map((status) => ({
      id: status.id,
      label: status.label,
      color: status.color,
    }));

    const summary = summarizeCampaignRows(summaryRows, statusDtos);

    return NextResponse.json({
      data: assignments.map((assignment) =>
        assignmentToRecord(assignment, linkedVideoMetrics)
      ),
      statuses: statusDtos,
      meta: {
        total,
        filteredTotal,
        limit: query.limit,
        offset: query.offset,
        sort: query.sort,
        dir: query.dir,
      },
      summary,
      filters: {
        categories: summary.categories,
      },
    });
  } catch (err) {
    return handleApiError(
      "GET /api/campaign-influencers",
      err,
      "Failed to load campaign influencers"
    );
  }
}

interface CampaignInfluencerQuery {
  campaignId: string | null;
  segment: string;
  search: string;
  platform: string;
  status: string;
  category: string;
  sort: string;
  dir: "asc" | "desc";
  limit: number;
  offset: number;
}

function parseCampaignInfluencerQuery(
  searchParams: URLSearchParams
): CampaignInfluencerQuery {
  return {
    campaignId: parseOptionalString(searchParams.get("campaignId")),
    segment: searchParams.get("segment") || "all",
    search: searchParams.get("query")?.trim() ?? "",
    platform: searchParams.get("platform") || "All",
    status: searchParams.get("status") || "All",
    category: searchParams.get("category") || "All",
    sort: searchParams.get("sort") || "lastUpdated",
    dir: searchParams.get("dir") === "asc" ? "asc" : "desc",
    limit: parseClampedInt(searchParams.get("limit"), 75, 1, 200),
    offset: parseClampedInt(searchParams.get("offset"), 0, 0, 1_000_000),
  };
}

function buildCampaignBaseWhere(
  organisationId: string,
  query: CampaignInfluencerQuery
): Prisma.CampaignInfluencerWhereInput {
  const where: Prisma.CampaignInfluencerWhereInput = {
    archivedAt: null,
    campaign: { organisationId, archivedAt: null },
  };

  if (query.campaignId) where.campaignId = query.campaignId;
  if (query.segment === "seeding") where.trackerKind = "seeding";
  else if (query.segment === "paid") where.trackerKind = "paid";
  else if (query.segment.startsWith("custom:")) {
    where.subcategoryId = query.segment.slice("custom:".length);
  }

  return where;
}

function buildCampaignFilteredWhere(
  baseWhere: Prisma.CampaignInfluencerWhereInput,
  query: CampaignInfluencerQuery
): Prisma.CampaignInfluencerWhereInput {
  const and: Prisma.CampaignInfluencerWhereInput[] = [baseWhere];
  const search = query.search.trim();

  if (search) {
    and.push({
      OR: [
        { influencer: { name: { contains: search, mode: "insensitive" } } },
        { influencer: { profile: { contains: search, mode: "insensitive" } } },
        { influencer: { email: { contains: search, mode: "insensitive" } } },
        { finalLink: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        { trackerFields: { path: ["name"], string_contains: search } },
        { trackerFields: { path: ["email"], string_contains: search } },
        { trackerFields: { path: ["finalLink"], string_contains: search } },
        { trackerFields: { path: ["finalLinkRaw"], string_contains: search } },
      ],
    });
  }

  if (query.platform !== "All") {
    and.push({ influencer: { platform: query.platform } });
  }
  if (query.status !== "All") {
    and.push({ status: query.status });
  }
  if (query.category !== "All") {
    and.push({
      influencer: { category: { equals: query.category, mode: "insensitive" } },
    });
  }

  return and.length === 1 ? baseWhere : { AND: and };
}

function orderByForCampaignSort(
  sort: string,
  dir: "asc" | "desc"
): Prisma.CampaignInfluencerOrderByWithRelationInput[] {
  const direction = dir;
  if (sort === "creatorName") return [{ influencer: { name: direction } }, { updatedAt: "desc" }];
  if (sort === "handle") return [{ influencer: { profile: direction } }, { updatedAt: "desc" }];
  if (sort === "platform") return [{ influencer: { platform: direction } }, { updatedAt: "desc" }];
  if (sort === "category") return [{ influencer: { category: direction } }, { updatedAt: "desc" }];
  if (sort === "followerCount") return [{ influencer: { followerCount: direction } }, { updatedAt: "desc" }];
  if (sort === "negotiatedRate") return [{ rate: direction }, { updatedAt: "desc" }];
  if (sort === "lastContacted") return [{ contactedAt: direction }, { updatedAt: "desc" }];
  if (sort === "status") return [{ status: direction }, { updatedAt: "desc" }];
  return [{ updatedAt: direction }];
}

function linkedVideoIdsFromAssignments(
  assignments: { trackerFields: Prisma.JsonValue }[]
) {
  return Array.from(
    new Set(
      assignments.flatMap((assignment) =>
        linkedVideoIdsFromFields(jsonObject(assignment.trackerFields))
      )
    )
  );
}

function linkedVideoIdsFromFields(fields: Record<string, unknown>) {
  const ids: string[] = [];
  const topLevelVideoId =
    stringField(fields.videoId) || stringField(fields.linkedVideoId);
  if (topLevelVideoId) ids.push(topLevelVideoId);

  for (const key of ["deliverables", "linkedVideos"]) {
    const value = fields[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const object = item as Record<string, unknown>;
      const videoId = stringField(object.videoId) || stringField(object.linkedVideoId);
      if (videoId) ids.push(videoId);
    }
  }

  return ids;
}

async function loadLinkedCampaignVideoMetrics(
  organisationId: string,
  videoIds: string[]
) {
  const ids = Array.from(new Set(videoIds.filter(Boolean)));
  if (ids.length === 0) return new Map<string, LinkedCampaignVideoMetric>();

  const videos = await prisma.video.findMany({
    where: { organisationId, id: { in: ids } },
    select: {
      id: true,
      url: true,
      uploadDate: true,
      currentMetric: {
        select: {
          views: true,
          likes: true,
          comments: true,
          saves: true,
          shares: true,
          source: true,
          capturedAt: true,
        },
      },
      collectionItems: {
        where: { collection: { organisationId } },
        select: {
          collectionId: true,
          collection: { select: { name: true } },
        },
      },
    },
  });

  return new Map(
    videos.map((video) => [
      video.id,
      {
        videoId: video.id,
        url: video.url ?? "",
        uploadDate: dateOnly(video.uploadDate),
        views: video.currentMetric?.views ?? 0,
        likes: video.currentMetric?.likes ?? 0,
        comments: video.currentMetric?.comments ?? 0,
        saves: video.currentMetric?.saves ?? 0,
        shares: video.currentMetric?.shares ?? 0,
        metricSource: video.currentMetric?.source ?? "tracked-video",
        metricCapturedAt: video.currentMetric?.capturedAt.toISOString() ?? "",
        collectionIds: video.collectionItems.map((item) => item.collectionId),
        collectionNames: video.collectionItems.map((item) => item.collection.name),
      },
    ])
  );
}

function summarizeCampaignRows(
  rows: {
    status: string;
    rate: number;
    updatedAt: Date;
    trackerFields: Prisma.JsonValue;
    influencer: { category: string | null };
  }[],
  statuses: { id: string; label: string; color: string }[]
) {
  const total = rows.length;
  const categories = new Set<string>();
  let rateSum = 0;
  let posted = 0;
  let stale = 0;
  let dueFollowUps = 0;
  let overdueDeliverables = 0;
  const counts = new Map<string, number>();

  for (const row of rows) {
    const fields = jsonObject(row.trackerFields);
    const category = stringField(fields.category) || row.influencer.category || "";
    if (category) categories.add(category);
    rateSum += row.rate;
    if (row.status === "Posted") posted += 1;
    counts.set(row.status, (counts.get(row.status) ?? 0) + 1);

    const lastUpdated = dateStringField(fields.lastUpdated) ?? dateOnly(row.updatedAt);
    if (isOlderThanDays(lastUpdated, 30)) stale += 1;
    if (isDueDate(dateStringField(fields.nextFollowUp) ?? "")) dueFollowUps += 1;
    if (isDueDate(dateStringField(fields.deliverableDue) ?? "")) {
      overdueDeliverables += 1;
    }
  }

  const statusCounts = statuses.map((status) => ({
    ...status,
    count: counts.get(status.label) ?? 0,
  }));

  return {
    total,
    avgRate: total === 0 ? 0 : rateSum / total,
    posted,
    stale,
    dueFollowUps,
    overdueDeliverables,
    statusCounts,
    categories: Array.from(categories).sort((a, b) => a.localeCompare(b)),
  };
}

function isOlderThanDays(date: string, days: number) {
  if (!date) return false;
  const ms = Date.now() - new Date(`${date}T00:00:00`).getTime();
  return Number.isFinite(ms) && ms > days * 86_400_000;
}

function isDueDate(date: string) {
  if (!date) return false;
  const target = new Date(`${date}T23:59:59`).getTime();
  return Number.isFinite(target) && target <= Date.now();
}
export async function POST(req: NextRequest) {
  try {
    const { org } = await requireEditor();
    const body = await readJsonObject(req);
    const rawRecord =
      body.record && typeof body.record === "object" && !Array.isArray(body.record)
        ? (body.record as Record<string, unknown>)
        : body;

    const campaignId = firstStringArrayValue(rawRecord.campaignIds);
    if (!campaignId) throw badRequest("Campaign is required");

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, organisationId: org.id },
      select: { id: true },
    });
    if (!campaign) throw badRequest("Campaign not found");

    const subcategoryId = firstStringArrayValue(rawRecord.subcategoryIds);
    let selectedSubcategory: {
      id: string;
      name: string;
      trackerKind: string;
      collectionId: string | null;
    } | null = null;
    if (subcategoryId) {
      const subcategory = await prisma.campaignSubcategory.findFirst({
        where: { id: subcategoryId, campaignId },
        select: {
          id: true,
          name: true,
          trackerKind: true,
          collectionId: true,
        },
      });
      if (!subcategory) throw badRequest("Subcategory not found");
      selectedSubcategory = subcategory;
    }

    const handle = normalizeHandle(
      parseOptionalString(rawRecord.handle) ??
        parseOptionalString(rawRecord.profile) ??
        ""
    );
    if (!handle) throw badRequest("Influencer handle is required");

    const creatorName =
      parseOptionalString(rawRecord.creatorName) ??
      parseOptionalString(rawRecord.name) ??
      handle.replace(/^@/, "");
    const platform = parsePlatform(rawRecord.platform);
    const rateType = parseRateType(rawRecord.rateType);
    const trackerKind =
      selectedSubcategory?.trackerKind === "paid" ||
      selectedSubcategory?.trackerKind === "seeding"
        ? selectedSubcategory.trackerKind
        : rateType === "Gifted"
          ? "seeding"
          : "paid";
    const finalLink = parseOptionalString(rawRecord.finalLink);
    const trackerFields = sanitizeTrackerFields(rawRecord);
    const targetCollectionId = await resolveCampaignCollectionId({
      campaignId,
      trackerKind,
      subcategory: selectedSubcategory,
    });
    if (targetCollectionId) {
      await linkCampaignFinalLinksToCollection(
        org.id,
        targetCollectionId,
        finalLink,
        trackerFields
      );
    }

    const influencer = await prisma.influencer.upsert({
      where: {
        organisationId_profile: {
          organisationId: org.id,
          profile: handle,
        },
      },
      create: {
        organisationId: org.id,
        profile: handle,
        name: creatorName,
        email: parseOptionalString(rawRecord.email),
        platform,
        followerCount: numberValue(rawRecord.followerCount),
        category: parseOptionalString(rawRecord.category),
        address: parseOptionalString(rawRecord.address),
        city: parseOptionalString(rawRecord.city),
        state: parseOptionalString(rawRecord.state),
        zipcode: parseOptionalString(rawRecord.zipcode),
      },
      update: {
        name: creatorName,
        email: parseOptionalString(rawRecord.email),
        platform,
        followerCount: numberValue(rawRecord.followerCount),
        category: parseOptionalString(rawRecord.category),
        address: parseOptionalString(rawRecord.address),
        city: parseOptionalString(rawRecord.city),
        state: parseOptionalString(rawRecord.state),
        zipcode: parseOptionalString(rawRecord.zipcode),
      },
    });

    const existingById = parseOptionalString(rawRecord.id)
      ? await prisma.campaignInfluencer.findFirst({
          where: {
            id: String(rawRecord.id),
            campaign: { organisationId: org.id },
          },
          select: { id: true },
        })
      : null;

    const existingByNaturalKey =
      existingById ??
      (await prisma.campaignInfluencer.findFirst({
        where: {
          campaignId,
          influencerId: influencer.id,
          subcategoryId: subcategoryId ?? null,
        },
        select: { id: true },
      }));

    const assignmentData = {
      campaignId,
      influencerId: influencer.id,
      subcategoryId: subcategoryId ?? null,
      trackerKind,
      status: parseOptionalString(rawRecord.status) ?? "Open",
      archivedAt: null,
      rate: numberValue(rawRecord.negotiatedRate),
      finalLink,
      contactedAt: dateOrNull(rawRecord.lastContacted),
      shippedAt: dateOrNull(rawRecord.shippedDate),
      deliveryStatus: parseOptionalString(rawRecord.deliveryStatus),
      notes: parseOptionalString(rawRecord.notes) ?? "",
      gmailThreads: sanitizeJsonArray(rawRecord.gmailThreads),
      trackerFields,
    };

    const assignment = existingByNaturalKey
      ? await prisma.campaignInfluencer.update({
          where: { id: existingByNaturalKey.id },
          data: assignmentData,
          include: { influencer: true, subcategory: true },
        })
      : await prisma.campaignInfluencer.create({
          data: {
            ...(parseOptionalString(rawRecord.id) ? { id: String(rawRecord.id) } : {}),
            ...assignmentData,
          },
          include: { influencer: true, subcategory: true },
        });

    const linkedVideoMetrics = await loadLinkedCampaignVideoMetrics(
      org.id,
      linkedVideoIdsFromFields(jsonObject(assignment.trackerFields))
    );

    return NextResponse.json(
      { data: assignmentToRecord(assignment, linkedVideoMetrics) },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(
      "POST /api/campaign-influencers",
      err,
      "Failed to save campaign influencer"
    );
  }
}

async function resolveCampaignCollectionId({
  campaignId,
  trackerKind,
  subcategory,
}: {
  campaignId: string;
  trackerKind: string;
  subcategory: { collectionId: string | null } | null;
}) {
  if (subcategory) return subcategory.collectionId ?? null;

  const defaultName = trackerKind === "paid" ? "Paid" : "Seeding";
  const defaultSubcategory = await prisma.campaignSubcategory.findFirst({
    where: { campaignId, name: defaultName },
    select: { collectionId: true },
  });
  return defaultSubcategory?.collectionId ?? null;
}

async function linkCampaignFinalLinksToCollection(
  organisationId: string,
  collectionId: string,
  assignmentFinalLink: string | null,
  fields: MutableInputJsonObject
) {
  const deliverables = deliverableArray(fields.deliverables);
  const hasDeliverables = deliverables.length > 0;
  const candidates = hasDeliverables
    ? deliverables
    : assignmentFinalLink
      ? [
          {
            ...createEmptyDeliverable(),
            id: `deliverable-${hashString(assignmentFinalLink)}`,
            finalLink: assignmentFinalLink,
          },
        ]
      : [];
  if (candidates.length === 0) return;

  const metricsByUrl = new Map<string, LinkedCampaignVideoMetric | null>();
  const linkedDeliverables = [];

  for (const deliverable of candidates) {
    const finalLink = deliverable.finalLink.trim();
    if (!finalLink) {
      linkedDeliverables.push(deliverable);
      continue;
    }

    let metric = metricsByUrl.get(finalLink);
    if (metric === undefined) {
      metric = await findOrTrackCampaignVideo(
        organisationId,
        collectionId,
        finalLink,
        deliverable.videoId || null
      );
      metricsByUrl.set(finalLink, metric);
    }

    linkedDeliverables.push(metric ? applyLinkedMetric(deliverable, metric) : deliverable);
  }

  fields.deliverables = sanitizeDeliverableArray(linkedDeliverables);

  const primary = linkedDeliverables.find((deliverable) => deliverable.videoId);
  if (!primary) return;

  fields.videoId = primary.videoId ?? "";
  fields.linkedVideoId = primary.videoId ?? "";
  fields.linkedVideoUrl = primary.linkedVideoUrl ?? primary.finalLink;
  fields.metricSource = primary.metricSource ?? "";
  fields.metricCapturedAt = primary.metricCapturedAt ?? "";
  fields.collectionIds = primary.collectionIds ?? [];
  fields.collectionNames = primary.collectionNames ?? [];
  fields.date = primary.date;
  if (primary.views !== undefined) fields.views = primary.views;
  if (primary.likes !== undefined) fields.likes = primary.likes;
  if (primary.comments !== undefined) fields.comments = primary.comments;
  if (primary.saves !== undefined) fields.saves = primary.saves;
  if (primary.shares !== undefined) fields.shares = primary.shares;
}

async function findOrTrackCampaignVideo(
  organisationId: string,
  collectionId: string,
  finalLink: string,
  existingVideoId: string | null
) {
  let input: { videoUrl: string; collectionId: string | null };
  try {
    input = parseTrackVideoRequestBody({ videoUrl: finalLink, collectionId });
  } catch {
    return null;
  }

  const existing = await findExistingCampaignVideo(
    organisationId,
    input.videoUrl,
    existingVideoId
  );
  if (existing) {
    await ensureCollectionMember(collectionId, { videoId: existing.id });
    return loadSingleLinkedCampaignVideoMetric(organisationId, existing.id);
  }

  try {
    await trackVideoForOrg(organisationId, input, { skipCollectionAssert: true });
  } catch (err) {
    console.warn(
      "Failed to auto-track campaign final link",
      safeErrorMessage(err, "Failed to auto-track campaign final link")
    );
    return null;
  }

  const tracked = await findExistingCampaignVideo(organisationId, input.videoUrl, null);
  if (!tracked) return null;
  await ensureCollectionMember(collectionId, { videoId: tracked.id });
  return loadSingleLinkedCampaignVideoMetric(organisationId, tracked.id);
}

async function findExistingCampaignVideo(
  organisationId: string,
  videoUrl: string,
  existingVideoId: string | null
) {
  if (existingVideoId) {
    const existing = await prisma.video.findFirst({
      where: { id: existingVideoId, organisationId },
      select: { id: true, url: true },
    });
    if (existing?.url && sameTrackedVideoUrl(videoUrl, existing.url)) {
      return existing;
    }
  }

  const variants = trackVideoUrlLookupVariants(videoUrl);
  return prisma.video.findFirst({
    where: { organisationId, url: { in: variants } },
    select: { id: true, url: true },
  });
}

function sameTrackedVideoUrl(nextUrl: string, existingUrl: string) {
  const nextVariants = new Set(trackVideoUrlLookupVariants(nextUrl));
  return trackVideoUrlLookupVariants(existingUrl).some((variant) =>
    nextVariants.has(variant)
  );
}

async function loadSingleLinkedCampaignVideoMetric(
  organisationId: string,
  videoId: string
) {
  const metrics = await loadLinkedCampaignVideoMetrics(organisationId, [videoId]);
  return metrics.get(videoId) ?? null;
}

function applyLinkedMetric(
  deliverable: CampaignInfluencerDeliverable,
  metric: LinkedCampaignVideoMetric
): CampaignInfluencerDeliverable {
  return {
    ...deliverable,
    finalLink: deliverable.finalLink || metric.url,
    date: deliverable.date || metric.uploadDate,
    views: metric.views,
    likes: metric.likes,
    comments: metric.comments,
    saves: metric.saves,
    shares: metric.shares,
    videoId: metric.videoId,
    linkedVideoUrl: metric.url,
    metricSource: metric.metricSource,
    metricCapturedAt: metric.metricCapturedAt,
    collectionIds: mergeUnique(deliverable.collectionIds ?? [], metric.collectionIds),
    collectionNames: mergeUnique(
      deliverable.collectionNames ?? [],
      metric.collectionNames
    ),
  };
}

function createEmptyDeliverable(): CampaignInfluencerDeliverable {
  return {
    id: cryptoId(),
    finalLink: "",
    concept: "",
    source: "",
    videoQuality: "",
    date: "",
    views: undefined,
    likes: undefined,
    comments: undefined,
    saves: undefined,
    shares: undefined,
    story: false,
    usageRights: false,
    notes: "",
    videoId: "",
    linkedVideoUrl: "",
    metricSource: "",
    metricCapturedAt: "",
    collectionIds: [],
    collectionNames: [],
  };
}

function assignmentToRecord(assignment: {
  id: string;
  campaignId: string;
  subcategoryId: string | null;
  trackerKind: string;
  status: string;
  rate: number;
  finalLink: string | null;
  contactedAt: Date | null;
  shippedAt: Date | null;
  deliveryStatus: string | null;
  notes: string;
  gmailThreads: Prisma.JsonValue;
  trackerFields: Prisma.JsonValue;
  updatedAt: Date;
  influencer: {
    profile: string;
    name: string | null;
    email: string | null;
    platform: string | null;
    followerCount: number;
    category: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipcode: string | null;
  };
}, linkedVideoMetrics = new Map<string, LinkedCampaignVideoMetric>()) {
  const fields = jsonObject(assignment.trackerFields);
  const handle = normalizeHandle(
    stringField(fields.handle) || stringField(fields.profile) || assignment.influencer.profile
  );
  const rateType = parseRateType(fields.rateType);
  const isPaid = rateType !== "Gifted";
  const lastContacted =
    dateStringField(fields.lastContacted) ??
    (assignment.contactedAt ? dateOnly(assignment.contactedAt) : dateOnly(assignment.updatedAt));
  const deliverables = deliverableArray(fields.deliverables, linkedVideoMetrics);
  const visibleDeliverables = isPaid
    ? deliverables.map(stripPaidDeliverableMetadata).filter(hasDeliverableValue)
    : deliverables;
  const primaryDeliverable = visibleDeliverables[0];

  return {
    id: assignment.id,
    creatorName:
      stringField(fields.creatorName) ||
      assignment.influencer.name ||
      handle.replace(/^@/, ""),
    handle,
    platform: parsePlatform(fields.platform ?? assignment.influencer.platform),
    category: stringField(fields.category) || assignment.influencer.category || "",
    followerCount: numberField(fields.followerCount) ?? assignment.influencer.followerCount,
    engagementRate: numberField(fields.engagementRate) ?? 0,
    negotiatedRate: assignment.rate,
    rateType,
    lastContacted,
    lastUpdated: dateStringField(fields.lastUpdated) ?? dateOnly(assignment.updatedAt),
    status: assignment.status,
    notes: assignment.notes,
    profile: stringField(fields.profile) || handle,
    finalLink: primaryDeliverable?.finalLink || assignment.finalLink || "",
    date: primaryDeliverable?.date || dateStringField(fields.date) || "",
    views: primaryDeliverable?.views ?? numberField(fields.views),
    likes: primaryDeliverable?.likes ?? numberField(fields.likes),
    comments: primaryDeliverable?.comments ?? numberField(fields.comments),
    saves: primaryDeliverable?.saves ?? numberField(fields.saves),
    shares: primaryDeliverable?.shares ?? numberField(fields.shares),
    address: stringField(fields.address) || assignment.influencer.address || "",
    city: stringField(fields.city) || assignment.influencer.city || "",
    state: stringField(fields.state) || assignment.influencer.state || "",
    zipcode: stringField(fields.zipcode) || assignment.influencer.zipcode || "",
    trackingNumber: stringField(fields.trackingNumber) || "",
    shippedDate:
      dateStringField(fields.shippedDate) ??
      (assignment.shippedAt ? dateOnly(assignment.shippedAt) : ""),
    shipped: booleanField(fields.shipped) ?? false,
    delivered: booleanField(fields.delivered) ?? false,
    received: booleanField(fields.received) ?? false,
    deliveryStatus: assignment.deliveryStatus ?? "",
    concept: isPaid ? "" : stringField(fields.concept) || assignment.influencer.category || "",
    source: isPaid
      ? ""
      : normalizeExternalVendorLabel(
          stringField(fields.source) || assignment.influencer.category || ""
        ),
    byouId: stringField(fields.byouId) || "",
    managedBy: normalizeExternalVendorLabel(stringField(fields.managedBy) || ""),
    email: stringField(fields.email) || assignment.influencer.email || "",
    name: stringField(fields.name) || assignment.influencer.name || "",
    story: primaryDeliverable?.story ?? booleanField(fields.story) ?? false,
    usageRights: primaryDeliverable?.usageRights ?? booleanField(fields.usageRights) ?? false,
    lastCheckIn: dateStringField(fields.lastCheckIn) ?? "",
    videoQuality: videoQualityField(fields.videoQuality),
    nextFollowUp: dateStringField(fields.nextFollowUp) ?? "",
    deliverableDue: dateStringField(fields.deliverableDue) ?? "",
    priority: stringField(fields.priority) || "Normal",
    statusHistory: stringArrayField(fields.statusHistory),
    deliverables: visibleDeliverables,
    campaignIds: [assignment.campaignId],
    subcategoryIds: assignment.subcategoryId ? [assignment.subcategoryId] : [],
    gmailThreads: jsonArray(assignment.gmailThreads),
  };
}

function sanitizeTrackerFields(record: Record<string, unknown>): MutableInputJsonObject {
  const copy: MutableInputJsonObject = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "gmailThreads") continue;
    if (key === "deliverables") {
      copy[key] = sanitizeDeliverableArray(value);
      continue;
    }
    if (key === "managedBy" || key === "source") {
      copy[key] = normalizeExternalVendorLabel(String(value ?? ""));
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      copy[key] = value;
    } else if (Array.isArray(value)) {
      copy[key] = value.filter(
        (item): item is string | number | boolean =>
          typeof item === "string" || typeof item === "number" || typeof item === "boolean"
      );
    }
  }
  return copy;
}

function sanitizeJsonArray(value: unknown): Prisma.InputJsonArray {
  return Array.isArray(value)
    ? value
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .map((item) => {
          const object = item as Record<string, unknown>;
          return {
            id: String(object.id ?? ""),
            subject: String(object.subject ?? "Gmail thread"),
            url: String(object.url ?? ""),
            lastMessageAt: String(object.lastMessageAt ?? ""),
            notes: String(object.notes ?? ""),
            gmailThreadId: String(object.gmailThreadId ?? ""),
            syncedAt: String(object.syncedAt ?? ""),
            lastSender: String(object.lastSender ?? ""),
          };
        })
    : [];
}

function deliverableArray(
  value: unknown,
  linkedVideoMetrics = new Map<string, LinkedCampaignVideoMetric>()
) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => {
      const object = item as Record<string, unknown>;
      const videoId = stringField(object.videoId) || stringField(object.linkedVideoId);
      const linkedMetric = videoId ? linkedVideoMetrics.get(videoId) : null;
      return {
        id: stringField(object.id) || cryptoId(),
        finalLink: stringField(object.finalLink) || linkedMetric?.url || "",
        concept: stringField(object.concept),
        source: normalizeExternalVendorLabel(stringField(object.source)),
        videoQuality: videoQualityField(object.videoQuality),
        date: dateStringField(object.date) ?? linkedMetric?.uploadDate ?? "",
        views: linkedMetric?.views ?? optionalNumberField(object.views),
        likes: linkedMetric?.likes ?? optionalNumberField(object.likes),
        comments: linkedMetric?.comments ?? optionalNumberField(object.comments),
        saves: linkedMetric?.saves ?? optionalNumberField(object.saves),
        shares: linkedMetric?.shares ?? optionalNumberField(object.shares),
        story: booleanField(object.story) ?? false,
        usageRights: booleanField(object.usageRights) ?? false,
        notes: stringField(object.notes),
        videoId,
        linkedVideoUrl: linkedMetric?.url || stringField(object.linkedVideoUrl),
        metricSource: linkedMetric?.metricSource || stringField(object.metricSource),
        metricCapturedAt:
          linkedMetric?.metricCapturedAt || stringField(object.metricCapturedAt),
        collectionIds: linkedMetric?.collectionIds ?? stringArrayField(object.collectionIds),
        collectionNames:
          linkedMetric?.collectionNames ?? stringArrayField(object.collectionNames),
      };
    })
    .filter((item) =>
      Boolean(
        item.finalLink ||
          item.concept ||
          item.source ||
          item.videoQuality ||
          item.date ||
          item.views ||
          item.likes ||
          item.comments ||
          item.saves ||
          item.shares ||
          item.story ||
          item.usageRights ||
          item.notes ||
          item.videoId
      )
    );
}

type CampaignInfluencerDeliverable = ReturnType<typeof deliverableArray>[number];

function stripPaidDeliverableMetadata<T extends { concept: string; source: string }>(
  deliverable: T
): T {
  return { ...deliverable, concept: "", source: "" };
}

function hasDeliverableValue(deliverable: CampaignInfluencerDeliverable) {
  return Boolean(
    deliverable.finalLink ||
      deliverable.videoQuality ||
      deliverable.date ||
      deliverable.views ||
      deliverable.likes ||
      deliverable.comments ||
      deliverable.saves ||
      deliverable.shares ||
      deliverable.story ||
      deliverable.usageRights ||
      deliverable.notes ||
      deliverable.videoId
  );
}

function sanitizeDeliverableArray(value: unknown): Prisma.InputJsonArray {
  return deliverableArray(value).map((item) => ({
    id: item.id,
    finalLink: item.finalLink,
    concept: item.concept,
    source: item.source,
    videoQuality: item.videoQuality,
    date: item.date,
    views: item.views ?? null,
    likes: item.likes ?? null,
    comments: item.comments ?? null,
    saves: item.saves ?? null,
    shares: item.shares ?? null,
    story: item.story,
    usageRights: item.usageRights,
    notes: item.notes,
    videoId: item.videoId,
    linkedVideoUrl: item.linkedVideoUrl,
    metricSource: item.metricSource,
    metricCapturedAt: item.metricCapturedAt,
    collectionIds: item.collectionIds,
    collectionNames: item.collectionNames,
  })) as Prisma.InputJsonArray;
}

function videoQualityField(value: unknown) {
  const normalized = stringField(value).toLowerCase();
  if (normalized === "oof") return "OOF";
  if (normalized === "okay") return "Okay";
  if (normalized === "good") return "Good";
  if (normalized === "amazing") return "AMAZING";
  if (normalized === "in progress") return "In Progress";
  if (normalized === "blacklist") return "Blacklist";
  return stringField(value);
}

function normalizeExternalVendorLabel(value: string) {
  const trimmed = value.trim();
  return /^\?{3,}$/.test(trimmed) ? "외부업체" : trimmed;
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonArray(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value : [];
}

function firstStringArrayValue(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === "string" && value[0].trim()
    ? value[0].trim()
    : null;
}

function parsePlatform(value: unknown): DashboardPlatform {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "instagram") return "Instagram";
  if (normalized === "youtube") return "YouTube";
  if (normalized === "facebook") return "Facebook";
  if (normalized === "snapchat") return "Snapchat";
  if (normalized === "x" || normalized === "twitter") return "X";
  return PLATFORM_FALLBACK;
}

function parseRateType(value: unknown): RateType {
  if (value === "Gifted" || value === "Affiliate") return value;
  return "Flat";
}

function normalizeHandle(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function numberField(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function optionalNumberField(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return numberField(value);
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}

function cryptoId() {
  return `deliverable-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stringArrayField(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mergeUnique(current: string[], next: string[]) {
  return Array.from(new Set([...current, ...next].filter(Boolean)));
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function booleanField(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "checked"].includes(normalized)) return true;
    if (["false", "no", "0", ""].includes(normalized)) return false;
  }
  return undefined;
}

function dateStringField(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function dateOrNull(value: unknown) {
  const dateString = dateStringField(value);
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}
