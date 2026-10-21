import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { ScrapedAccount } from "@/lib/datasource";
import { assertCollectionBelongsToOrg, ensureCollectionMember } from "@/lib/collections";
import {
  snapshotDayKey,
  syncCurrentMetricSnapshot,
  syncDailyMetricSnapshots,
} from "@/lib/metric-snapshots";

/**
 * Persist a scraped account (and its videos + metric snapshots) into the database.
 * Idempotent on (org, platform, handle) and on video url. Re-tracking refreshes
 * existing video metadata and historical snapshots, then appends new videos.
 */
export async function ingestAccount(
  organisationId: string,
  scraped: ScrapedAccount,
  options: {
    collectionId?: string | null;
    metricSource?: string;
    skipCollectionAssert?: boolean;
  } = {},
  client: Prisma.TransactionClient = prisma
): Promise<{
  accountId: string;
  videosAdded: number;
  metricsSynced: number;
  created: boolean;
}> {
  const collectionId = options.collectionId ?? null;
  // Collection helpers use the shared client. Never allow them to escape an
  // injected refresh transaction; refresh persistence does not change links.
  if (collectionId && client !== prisma) {
    throw new Error("Transactional ingestion cannot change collection membership");
  }
  if (collectionId && !options.skipCollectionAssert) {
    await assertCollectionBelongsToOrg(organisationId, collectionId);
  }

  const existing = await client.account.findUnique({
    where: {
      organisationId_platform_handle: {
        organisationId,
        platform: scraped.platform,
        handle: scraped.handle,
      },
    },
  });

  const account = await client.account.upsert({
    where: {
      organisationId_platform_handle: {
        organisationId,
        platform: scraped.platform,
        handle: scraped.handle,
      },
    },
    update: {
      displayName: scraped.displayName,
      avatarUrl: scraped.avatarUrl,
    },
    create: {
      organisationId,
      platform: scraped.platform,
      handle: scraped.handle,
      displayName: scraped.displayName,
      avatarUrl: scraped.avatarUrl,
      status: "active",
    },
  });

  const scrapedUrls = scraped.videos.map((v) => v.url).filter(Boolean);
  const existingVideos = await client.video.findMany({
    where: scrapedUrls.length
      ? { organisationId, url: { in: scrapedUrls } }
      : { accountId: account.id },
    select: { id: true, url: true },
  });
  const existingByUrl = new Map(
    existingVideos
      .filter((v): v is { id: string; url: string } => !!v.url)
      .map((v) => [v.url, v])
  );

  let videosAdded = 0;
  let metricsSynced = 0;
  for (const v of scraped.videos) {
    const existingVideo = v.url ? existingByUrl.get(v.url) : null;
    const video = existingVideo
      ? await client.video.update({
          where: { id: existingVideo.id },
          data: {
            accountId: account.id,
            platform: scraped.platform,
            caption: v.caption,
            thumbnailUrl: v.thumbnailUrl,
            uploadDate: v.uploadDate,
          },
        })
      : await client.video.create({
          data: {
            organisationId,
            accountId: account.id,
            platform: scraped.platform,
            caption: v.caption,
            thumbnailUrl: v.thumbnailUrl,
            url: v.url,
            uploadDate: v.uploadDate,
          },
        });

    if (!existingVideo) {
      videosAdded++;
      if (v.url) existingByUrl.set(v.url, { id: video.id, url: v.url });
    }

    if (collectionId) {
      await ensureCollectionMember(collectionId, { videoId: video.id });
    }

    const syncedDailyDates = new Set<string>();
    if (v.daily.length > 0) {
      metricsSynced += await syncDailyMetricSnapshots(video.id, v.daily, client);
      v.daily.forEach((point) => syncedDailyDates.add(snapshotDayKey(point.date)));
    }

    if (v.current) {
      if (!syncedDailyDates.has(snapshotDayKey(v.current.date))) {
        metricsSynced += await syncDailyMetricSnapshots(video.id, [v.current], client);
      }
      await syncCurrentMetricSnapshot(video.id, v.current, options.metricSource ?? "scraper", client);
      metricsSynced += 1;
    }
  }

  await client.account.update({
    where: { id: account.id },
    data: { lastRefreshAt: new Date() },
  });

  return {
    accountId: account.id,
    videosAdded,
    metricsSynced,
    created: !existing,
  };
}
