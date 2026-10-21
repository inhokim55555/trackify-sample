import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  applyViralCohortScores,
  aggregateOverview,
  computeVideo,
  type MetricRow,
  type ViralCohortSource,
  type VideoComputed,
} from "@/lib/metrics";
import type { Platform } from "@/lib/constants";

export interface VideoMeta {
  id: string;
  platform: Platform;
  caption: string;
  thumbnailUrl: string | null;
  url: string | null;
  uploadDate: Date;
  accountId: string;
  accountHandle: string;
  accountDisplayName: string;
  accountAvatarUrl: string | null;
  viralSegment: string;
}

export interface LoadedVideo {
  meta: VideoMeta;
  rows: MetricRow[];
  current: CurrentMetricRow | null;
}

interface CurrentMetricRow extends MetricRow {
  source: string;
}

// Shape returned by the Prisma query in loadVideos (annotated so the file
// typechecks before `prisma generate` runs; structurally matches the client).
interface FetchedMetric {
  date: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}
interface FetchedCurrentMetric {
  capturedAt: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  source: string;
}
interface FetchedVideo {
  id: string;
  platform: string;
  caption: string;
  thumbnailUrl: string | null;
  url: string | null;
  uploadDate: Date;
  accountId: string;
  account: {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
  };
  dailyMetrics: FetchedMetric[];
  currentMetric: FetchedCurrentMetric | null;
  collectionItems: FetchedCollectionItem[];
}

interface FetchedCollectionItem {
  collection: {
    name: string;
    type: string;
  };
}

interface FetchedCohortVideo {
  id: string;
  platform: string;
  uploadDate: Date;
  currentMetric: FetchedCurrentMetric | null;
  dailyMetrics: FetchedMetric[];
  collectionItems: FetchedCollectionItem[];
}

/**
 * Load videos + their cumulative dated snapshots for the window. We fetch
 * before `from` so weekly gains and the range baseline are available.
 */
export async function loadVideos(
  videoIds: string[],
  from: Date,
  to: Date
): Promise<LoadedVideo[]> {
  if (videoIds.length === 0) return [];
  return loadVideosByWhere({ id: { in: videoIds } }, from, to);
}

export async function loadVideosByWhere(
  where: Prisma.VideoWhereInput,
  from: Date,
  to: Date,
  query: {
    orderBy?: Prisma.VideoOrderByWithRelationInput | Prisma.VideoOrderByWithRelationInput[];
    skip?: number;
    take?: number;
  } = {}
): Promise<LoadedVideo[]> {
  const baselineFrom = new Date(from.getTime() - 86_400_000);
  const viralFrom = new Date(to.getTime() - 8 * 86_400_000);
  const fetchFrom =
    baselineFrom.getTime() < viralFrom.getTime() ? baselineFrom : viralFrom;
  const videos = await prisma.video.findMany({
    where,
    orderBy: query.orderBy,
    skip: query.skip,
    take: query.take,
    include: {
      account: {
        select: {
          id: true,
          handle: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      dailyMetrics: {
        where: { date: { gte: fetchFrom, lte: to } },
        orderBy: { date: "asc" },
        select: {
          date: true,
          views: true,
          likes: true,
          comments: true,
          shares: true,
          saves: true,
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
          source: true,
        },
      },
      collectionItems: {
        select: {
          collection: {
            select: {
              name: true,
              type: true,
            },
          },
        },
      },
    },
  });

  return (videos as FetchedVideo[]).map((v: FetchedVideo) => ({
    meta: {
      id: v.id,
      platform: v.platform as Platform,
      caption: v.caption,
      thumbnailUrl: v.thumbnailUrl,
      url: v.url,
      uploadDate: v.uploadDate,
      accountId: v.accountId,
      accountHandle: v.account.handle,
      accountDisplayName: v.account.displayName,
      accountAvatarUrl: v.account.avatarUrl,
      viralSegment: inferViralSegment(v.collectionItems),
    },
    rows: v.dailyMetrics.map((m: FetchedMetric) => ({
      date: m.date,
      views: m.views,
      likes: m.likes,
      comments: m.comments,
      shares: m.shares,
      saves: m.saves,
    })),
    current: v.currentMetric
      ? {
          date: v.currentMetric.capturedAt,
          views: v.currentMetric.views,
          likes: v.currentMetric.likes,
          comments: v.currentMetric.comments,
          shares: v.currentMetric.shares,
          saves: v.currentMetric.saves,
          source: v.currentMetric.source,
        }
      : null,
  }));
}

export async function loadViralCohortRows(
  where: Prisma.VideoWhereInput,
  to: Date
): Promise<ViralCohortSource[]> {
  const videos = await prisma.video.findMany({
    where,
    select: {
      id: true,
      platform: true,
      uploadDate: true,
      currentMetric: {
        select: {
          capturedAt: true,
          views: true,
          likes: true,
          comments: true,
          shares: true,
          saves: true,
          source: true,
        },
      },
      dailyMetrics: {
        where: { date: { lte: to } },
        orderBy: { date: "desc" },
        take: 1,
        select: {
          date: true,
          views: true,
          likes: true,
          comments: true,
          shares: true,
          saves: true,
        },
      },
      collectionItems: {
        select: {
          collection: {
            select: {
              name: true,
              type: true,
            },
          },
        },
      },
    },
  });

  return (videos as FetchedCohortVideo[]).map((video) => {
    const current = video.currentMetric;
    const history = video.dailyMetrics[0] ?? null;
    const metric = current
      ? {
          views: current.views,
          likes: current.likes,
          comments: current.comments,
          shares: current.shares,
          saves: current.saves,
          capturedAt: current.capturedAt,
          source: current.source,
        }
      : history
        ? {
            views: history.views,
            likes: history.likes,
            comments: history.comments,
            shares: history.shares,
            saves: history.saves,
            capturedAt: history.date,
            source: "history",
          }
        : null;
    const totalEngagement =
      (metric?.likes ?? 0) +
      (metric?.comments ?? 0) +
      (metric?.shares ?? 0) +
      (metric?.saves ?? 0);

    return {
      id: video.id,
      platform: video.platform,
      uploadDate: video.uploadDate,
      totalViews: metric?.views ?? 0,
      totalLikes: metric?.likes ?? 0,
      totalComments: metric?.comments ?? 0,
      totalShares: metric?.shares ?? 0,
      totalSaves: metric?.saves ?? 0,
      engagementRate:
        metric && metric.views > 0 ? (totalEngagement / metric.views) * 100 : 0,
      metricSource: metric?.source ?? "none",
      metricCapturedAt: metric?.capturedAt ?? null,
      hasHistoricalMetrics: !!history,
      viralSegment: inferViralSegment(video.collectionItems),
    };
  });
}

export interface ComputedVideoRow extends VideoComputed {
  id: string;
  platform: Platform;
  caption: string;
  thumbnailUrl: string | null;
  url: string | null;
  uploadDate: string;
  accountId: string;
  accountHandle: string;
  accountDisplayName: string;
  accountAvatarUrl: string | null;
  metricSource: string;
  metricCapturedAt: string | null;
  hasHistoricalMetrics: boolean;
}

export function computeVideoRows(
  loaded: LoadedVideo[],
  from: Date,
  to: Date,
  cohortRows?: ViralCohortSource[]
): ComputedVideoRow[] {
  const baseRows = loaded.map((lv) => {
    const c = computeVideo(lv.rows, from, to);
    const current = lv.current;
    const currentEngagement = current
      ? current.likes + current.comments + current.shares + current.saves
      : null;
    return {
      ...c,
      totalViews: current?.views ?? c.totalViews,
      totalLikes: current?.likes ?? c.totalLikes,
      totalComments: current?.comments ?? c.totalComments,
      totalShares: current?.shares ?? c.totalShares,
      totalSaves: current?.saves ?? c.totalSaves,
      engagementRate:
        current && current.views > 0
          ? ((currentEngagement ?? 0) / current.views) * 100
          : c.engagementRate,
      id: lv.meta.id,
      platform: lv.meta.platform,
      caption: lv.meta.caption,
      thumbnailUrl: lv.meta.thumbnailUrl,
      url: lv.meta.url,
      uploadDate: lv.meta.uploadDate.toISOString(),
      accountId: lv.meta.accountId,
      accountHandle: lv.meta.accountHandle,
      accountDisplayName: lv.meta.accountDisplayName,
      accountAvatarUrl: lv.meta.accountAvatarUrl,
      metricSource: current?.source ?? (lv.rows.length > 0 ? "history" : "none"),
      metricCapturedAt: current?.date.toISOString() ?? null,
      hasHistoricalMetrics: lv.rows.length > 0,
      viralSegment: lv.meta.viralSegment,
    };
  });

  return applyViralCohortScores(baseRows, { now: to, cohortRows });
}

export function compareViralPerformance(
  a: {
    viralLabel: string;
    viralScore: number;
    viralPercentile: number | null;
    viralViewsPerDay: number;
    totalViews: number;
  },
  b: {
    viralLabel: string;
    viralScore: number;
    viralPercentile: number | null;
    viralViewsPerDay: number;
    totalViews: number;
  }
) {
  const labelDelta = viralLabelRank(b.viralLabel) - viralLabelRank(a.viralLabel);
  if (labelDelta !== 0) return labelDelta;
  if (b.viralScore !== a.viralScore) return b.viralScore - a.viralScore;
  const percentileDelta = (b.viralPercentile ?? 0) - (a.viralPercentile ?? 0);
  if (percentileDelta !== 0) return percentileDelta;
  if (b.viralViewsPerDay !== a.viralViewsPerDay) {
    return b.viralViewsPerDay - a.viralViewsPerDay;
  }
  return b.totalViews - a.totalViews;
}

export function topViralVideoIdsFromCohort(
  cohortRows: ViralCohortSource[],
  to: Date,
  limit: number
) {
  if (limit <= 0) return [];
  return applyViralCohortScores(cohortRows, {
    now: to,
    cohortRows,
  })
    .filter((row) => row.viralLabel !== "Needs Data")
    .sort(compareViralPerformance)
    .slice(0, limit)
    .map((row) => row.id);
}

export function buildOverview(loaded: LoadedVideo[], from: Date, to: Date) {
  return aggregateOverview(
    loaded.map((lv) => ({
      videoId: lv.meta.id,
      uploadDate: lv.meta.uploadDate,
      rows: lv.rows,
    })),
    from,
    to
  );
}

// ── Account-level rollups ─────────────────────────────────────────────
export interface ComputedAccountRow {
  id: string;
  platform: Platform;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  firstTrackedAt: string;
  lastRefreshAt: string;
  videosTracked: number;
  viralRate: number; // % of videos outperforming their cohort
  highViralRate: number; // % breakout videos
  avgEngagementRate: number;
  totalViews: number;
  totalEngagement: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgViewsPerVideo: number;
  highestVideoViews: number;
}

export function rollupAccounts(
  accounts: {
    id: string;
    platform: string;
    handle: string;
    displayName: string;
    avatarUrl: string | null;
    status: string;
    firstTrackedAt: Date;
    lastRefreshAt: Date;
  }[],
  computedVideos: ComputedVideoRow[]
): ComputedAccountRow[] {
  const byAccount = new Map<string, ComputedVideoRow[]>();
  for (const v of computedVideos) {
    const list = byAccount.get(v.accountId) ?? [];
    list.push(v);
    byAccount.set(v.accountId, list);
  }

  return accounts.map((a) => {
    const vids = byAccount.get(a.id) ?? [];
    const n = vids.length;
    const sum = (f: (v: ComputedVideoRow) => number) =>
      vids.reduce((acc, v) => acc + f(v), 0);
    const totalViews = sum((v) => v.totalViews);
    const totalLikes = sum((v) => v.totalLikes);
    const totalComments = sum((v) => v.totalComments);
    const totalShares = sum((v) => v.totalShares);
    const totalSaves = sum((v) => v.totalSaves);
    const totalEngagement = totalLikes + totalComments + totalShares + totalSaves;
    const viralCount = vids.filter(
      (v) => v.viralLabel === "Breakout" || v.viralLabel === "Outperforming"
    ).length;
    const highViralCount = vids.filter((v) => v.viralLabel === "Breakout").length;
    const avgEng =
      n > 0 ? vids.reduce((acc, v) => acc + v.engagementRate, 0) / n : 0;
    const highest = vids.reduce((m, v) => Math.max(m, v.totalViews), 0);

    return {
      id: a.id,
      platform: a.platform as Platform,
      handle: a.handle,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      status: a.status,
      firstTrackedAt: a.firstTrackedAt.toISOString(),
      lastRefreshAt: a.lastRefreshAt.toISOString(),
      videosTracked: n,
      viralRate: n > 0 ? (viralCount / n) * 100 : 0,
      highViralRate: n > 0 ? (highViralCount / n) * 100 : 0,
      avgEngagementRate: avgEng,
      totalViews,
      totalEngagement,
      totalLikes,
      totalComments,
      totalShares,
      totalSaves,
      avgViewsPerVideo: n > 0 ? totalViews / n : 0,
      highestVideoViews: highest,
    };
  });
}

function inferViralSegment(items: FetchedCollectionItem[]) {
  const labels = items.map((item) =>
    `${item.collection.type} ${item.collection.name}`.toLowerCase()
  );
  if (labels.some((label) => /\bbsm\b/.test(label))) return "BSM";
  if (labels.some((label) => label.includes("paid"))) return "Paid";
  if (
    labels.some(
      (label) => label.includes("seeding") || /\bseed\b/.test(label)
    )
  ) {
    return "Seeding";
  }
  if (labels.some((label) => label.includes("affiliate"))) return "Affiliate";
  return "All";
}

function viralLabelRank(label: string) {
  if (label === "Breakout") return 4;
  if (label === "Outperforming") return 3;
  if (label === "On Track") return 2;
  if (label === "Underperforming") return 1;
  return 0;
}
