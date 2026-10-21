import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { handleApiError } from "@/lib/api";
import { getCurrentUserContext } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseFilters, videoWhereForFilters } from "@/lib/query";
import { csvCell } from "@/lib/safe-output";

export const dynamic = "force-dynamic";

const EXPORT_HEADERS = [
  "video_url",
  "trackify_video_ID",
  "title_caption",
  "product",
  "collection",
  "creator",
  "platform",
  "Campaign",
  "campaign_type",
  "Rate",
  "published_at",
  "collected_at",
  "Views",
  "Likes",
  "Comments",
  "Saves",
  "Shares",
];

type ExportVideo = {
  id: string;
  platform: string;
  caption: string;
  url: string | null;
  uploadDate: Date;
  account: {
    handle: string;
    displayName: string;
  };
  currentMetric: {
    capturedAt: Date;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
  } | null;
  collectionItems: {
    collection: {
      id: string;
      name: string;
      type: string;
      parentId: string | null;
      campaignSubcategories: {
        trackerKind: string;
        campaign: { name: string };
      }[];
    };
  }[];
};

type CampaignAssignment = {
  campaign: { name: string };
  subcategory: {
    trackerKind: string;
    collection: ExportCollectionRef | null;
  } | null;
  trackerKind: string;
  rate: number;
  finalLink: string | null;
  trackerFields: Prisma.JsonValue;
};

type ExportCollectionRef = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
};

type CampaignExportMatch = {
  campaigns: Set<string>;
  campaignTypes: Set<string>;
  rates: Set<string>;
  collections: Map<string, ExportCollectionRef>;
};

export async function GET(req: NextRequest) {
  try {
    const { org } = await getCurrentUserContext();
    const sp = req.nextUrl.searchParams;
    const filters = parseFilters(sp);
    const ids = parseIds(sp.get("ids"));

    const where = ids.length
      ? { organisationId: org.id, id: { in: ids } }
      : sp.get("scope") === "all"
        ? { organisationId: org.id }
        : await videoWhereForFilters(org.id, filters);

    const [videos, assignments, collections] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy: [{ uploadDate: "desc" }, { id: "asc" }],
        include: {
          account: {
            select: {
              handle: true,
              displayName: true,
            },
          },
          currentMetric: {
            select: {
              capturedAt: true,
              views: true,
              likes: true,
              comments: true,
              shares: true,
              saves: true,
            },
          },
          collectionItems: {
            where: { collection: { organisationId: org.id } },
            select: {
              collection: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  parentId: true,
                  campaignSubcategories: {
                    select: {
                      trackerKind: true,
                      campaign: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.campaignInfluencer.findMany({
        where: {
          campaign: { organisationId: org.id },
          archivedAt: null,
        },
        select: {
          trackerKind: true,
          rate: true,
          finalLink: true,
          trackerFields: true,
          campaign: { select: { name: true } },
          subcategory: {
            select: {
              trackerKind: true,
              collection: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  parentId: true,
                },
              },
            },
          },
        },
      }),
      prisma.collection.findMany({
        where: { organisationId: org.id },
        select: {
          id: true,
          name: true,
          type: true,
          parentId: true,
        },
      }),
    ]);

    const campaignLookup = buildCampaignLookup(assignments as CampaignAssignment[]);
    const collectionLookup = new Map(
      (collections as ExportCollectionRef[]).map((collection) => [collection.id, collection])
    );
    const rows = (videos as ExportVideo[]).map((video) =>
      exportRow(video, campaignLookup, collectionLookup)
    );
    const csv = [EXPORT_HEADERS.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(sp)}"`,
      },
    });
  } catch (err) {
    return handleApiError("GET /api/videos/export", err, "Failed to export videos");
  }
}

function exportRow(
  video: ExportVideo,
  campaignLookup: Map<string, CampaignExportMatch>,
  collectionLookup: Map<string, ExportCollectionRef>
) {
  const videoCollections = uniqueCollections(
    video.collectionItems.map((item) => item.collection)
  );
  const matches = campaignMatches(video, campaignLookup);
  const campaignCollections = uniqueCollections(
    matches.flatMap((match) => Array.from(match.collections.values()))
  );
  const attributionCollections = videoCollections.length
    ? videoCollections
    : campaignCollections;
  const collectionNames = unique(
    attributionCollections.map((collection) => collection.name)
  );

  const campaignNames = new Set<string>();
  const campaignTypes = new Set<string>();
  for (const item of video.collectionItems) {
    const collectionType = campaignTypeLabel(item.collection.type);
    if (collectionType) campaignTypes.add(collectionType);

    for (const subcategory of item.collection.campaignSubcategories) {
      campaignNames.add(subcategory.campaign.name);
      const campaignType = campaignTypeLabel(subcategory.trackerKind);
      if (campaignType) campaignTypes.add(campaignType);
    }
  }

  const rates = new Set<string>();
  for (const match of matches) {
    for (const campaign of match.campaigns) campaignNames.add(campaign);
    for (const campaignType of match.campaignTypes) campaignTypes.add(campaignType);
    for (const rate of match.rates) rates.add(rate);
  }

  const metric = video.currentMetric;
  return [
    video.url ?? "",
    video.id,
    video.caption,
    productNames(attributionCollections, collectionLookup).join("; "),
    collectionNames.join("; "),
    creatorLabel(video.account.handle, video.account.displayName),
    video.platform,
    Array.from(campaignNames).join("; "),
    Array.from(campaignTypes).join("; "),
    Array.from(rates).join("; "),
    dateOnly(video.uploadDate),
    metric ? metric.capturedAt.toISOString() : "",
    metric?.views ?? 0,
    metric?.likes ?? 0,
    metric?.comments ?? 0,
    metric?.saves ?? 0,
    metric?.shares ?? 0,
  ];
}

function buildCampaignLookup(assignments: CampaignAssignment[]) {
  const lookup = new Map<string, CampaignExportMatch>();
  for (const assignment of assignments) {
    const links = campaignLinks(assignment);
    const videoIds = linkedVideoIds(jsonObject(assignment.trackerFields));
    for (const key of [...links.flatMap(urlKeys), ...videoIds.map((id) => `id:${id}`)]) {
      const existing =
        lookup.get(key) ?? {
          campaigns: new Set<string>(),
          campaignTypes: new Set<string>(),
          rates: new Set<string>(),
          collections: new Map<string, ExportCollectionRef>(),
        };
      existing.campaigns.add(assignment.campaign.name);
      const campaignType =
        campaignTypeLabel(assignment.subcategory?.trackerKind) ||
        campaignTypeLabel(assignment.trackerKind) ||
        campaignTypeFromTrackerFields(jsonObject(assignment.trackerFields));
      if (campaignType) existing.campaignTypes.add(campaignType);
      existing.rates.add(String(assignment.rate));
      if (assignment.subcategory?.collection) {
        existing.collections.set(
          assignment.subcategory.collection.id,
          assignment.subcategory.collection
        );
      }
      lookup.set(key, existing);
    }
  }
  return lookup;
}

function campaignMatches(
  video: ExportVideo,
  lookup: Map<string, CampaignExportMatch>
) {
  const keys = [`id:${video.id}`, ...urlKeys(video.url ?? "")];
  return unique(keys)
    .map((key) => lookup.get(key))
    .filter((match): match is CampaignExportMatch => !!match);
}

function campaignLinks(assignment: CampaignAssignment) {
  const fields = jsonObject(assignment.trackerFields);
  const links = [assignment.finalLink, stringField(fields.finalLink), stringField(fields.finalLinkRaw)];
  for (const key of ["deliverables", "linkedVideos"]) {
    const value = fields[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const object = item as Record<string, unknown>;
      links.push(
        stringField(object.finalLink),
        stringField(object.linkedVideoUrl),
        stringField(object.url)
      );
    }
  }
  return links.filter((link): link is string => !!link && !!link.trim());
}

function linkedVideoIds(fields: Record<string, unknown>) {
  const ids = [stringField(fields.videoId), stringField(fields.linkedVideoId)];
  for (const key of ["deliverables", "linkedVideos"]) {
    const value = fields[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const object = item as Record<string, unknown>;
      ids.push(stringField(object.videoId), stringField(object.linkedVideoId));
    }
  }
  return ids.filter((id) => !!id.trim());
}

function urlKeys(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const keys = new Set([trimmed.replace(/\/$/, "")]);
  try {
    const url = new URL(trimmed);
    url.hash = "";
    keys.add(url.toString().replace(/\/$/, ""));

    const noSearch = new URL(url);
    noSearch.search = "";
    keys.add(noSearch.toString().replace(/\/$/, ""));

    const normalizedHost = new URL(noSearch);
    normalizedHost.hostname = normalizedHost.hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/^m\./, "");
    keys.add(normalizedHost.toString().replace(/\/$/, ""));

    const youtubeId = youtubeVideoId(url);
    if (youtubeId) {
      keys.add(`https://youtube.com/watch?v=${youtubeId}`);
      keys.add(`https://youtu.be/${youtubeId}`);
    }
  } catch {
    // Keep the trimmed raw value only.
  }
  return Array.from(keys);
}

function youtubeVideoId(url: URL) {
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return parts[0] ?? null;
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    if (["shorts", "embed", "live"].includes(parts[0] ?? "")) return parts[1] ?? null;
  }
  return null;
}

function productNames(
  collections: ExportCollectionRef[],
  lookup: Map<string, ExportCollectionRef>
) {
  const products = collections
    .map((collection) => productCollection(collection, lookup)?.name ?? "")
    .filter(Boolean);
  return unique(products);
}

function productCollection(
  collection: ExportCollectionRef,
  lookup: Map<string, ExportCollectionRef>
) {
  let current: ExportCollectionRef | undefined = collection;
  let root: ExportCollectionRef | undefined = collection;
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.type === "brand") return current;
    root = current;
    current = current.parentId ? lookup.get(current.parentId) : undefined;
  }

  return root;
}

function campaignTypeFromTrackerFields(fields: Record<string, unknown>) {
  return (
    campaignTypeLabel(stringField(fields.trackerKind)) ||
    campaignTypeLabel(stringField(fields.rateType)) ||
    campaignTypeLabel(stringField(fields.campaignType))
  );
}

function campaignTypeLabel(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "seeding" || normalized === "gifted") return "seeding";
  if (normalized === "paid" || normalized === "flat") return "paid";
  if (normalized === "affiliate") return "affiliate";
  return "";
}

function parseIds(value: string | null) {
  if (!value) return [];
  return unique(value.split(",").map((id) => id.trim()).filter(Boolean)).slice(0, 1_000);
}

function exportFilename(sp: URLSearchParams) {
  if (sp.get("scope") === "all") return "trackify-all-videos.csv";
  if (sp.get("ids")) return "trackify-selected-videos.csv";
  return "trackify-videos.csv";
}

function creatorLabel(handle: string, displayName: string) {
  const normalized = handle.startsWith("@") ? handle : `@${handle}`;
  return displayName && displayName !== handle ? `${normalized} (${displayName})` : normalized;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function uniqueCollections(collections: ExportCollectionRef[]) {
  return Array.from(
    new Map(collections.map((collection) => [collection.id, collection])).values()
  );
}

function jsonObject(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : "";
}
