import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { MetricName } from "@/lib/datasource";

const METRIC_NAMES: MetricName[] = ["views", "likes", "comments", "shares", "saves"];

export interface MetricSnapshotInput {
  date: Date;
  capturedAt?: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  observed?: Partial<Record<MetricName, boolean>>;
}

export function utcSnapshotDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export function snapshotDayKey(date: Date): string {
  return utcSnapshotDate(date).toISOString().slice(0, 10);
}

export async function syncDailyMetricSnapshots(
  videoId: string,
  snapshots: MetricSnapshotInput[],
  client: Prisma.TransactionClient = prisma
): Promise<number> {
  const seen = new Set<string>();
  let synced = 0;

  for (const point of snapshots) {
    const date = utcSnapshotDate(point.date);
    const key = date.toISOString();
    if (seen.has(key)) continue;
    seen.add(key);

    await client.videoDailyMetric.upsert({
      where: { videoId_date: { videoId, date } },
      update: observedMetricData(point),
      create: {
        videoId,
        date,
        views: point.views,
        likes: point.likes,
        comments: point.comments,
        shares: point.shares,
        saves: point.saves,
      },
    });

    synced += 1;
  }

  return synced;
}

export async function syncCurrentMetricSnapshot(
  videoId: string,
  point: MetricSnapshotInput,
  source: string,
  client: Prisma.TransactionClient = prisma
) {
  const capturedAt = point.capturedAt ?? point.date;
  const observed = observedMetricData(point);
  if (Object.keys(observed).length === 0) return false;

  // The unique videoId protects concurrent first imports. The conditional
  // UPDATE below is evaluated by the database, so a delayed old response cannot
  // overwrite a newer capture. Equal timestamps allow explicit corrections.
  await client.videoCurrentMetric.createMany({
    data: [{
      videoId,
      capturedAt,
      views: point.views,
      likes: point.likes,
      comments: point.comments,
      shares: point.shares,
      saves: point.saves,
      source,
    }],
    skipDuplicates: true,
  });
  const result = await client.videoCurrentMetric.updateMany({
    where: { videoId, capturedAt: { lte: capturedAt } },
    data: { capturedAt, ...observed, source },
  });
  return result.count > 0;
}

/**
 * Returns only counts that the provider actually observed. This prevents a
 * structural null from replacing a previously known metric with zero.
 */
export function observedMetricData(point: MetricSnapshotInput) {
  const data: Partial<Record<MetricName, number>> = {};
  for (const name of METRIC_NAMES) {
    if (point.observed?.[name] === false) continue;
    data[name] = point[name];
  }
  return data;
}
