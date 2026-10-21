import type { Prisma } from "@prisma/client";
import { getDataSource, type DataSource } from "@/lib/datasource";
import { canonicalSocialUrl, isTikTokPhotoUrl } from "@/lib/datasource/socialcrawl";
import { prisma } from "@/lib/db";
import { syncCurrentMetricSnapshot, syncDailyMetricSnapshots } from "@/lib/metric-snapshots";
import { safeErrorMessage } from "@/lib/safe-output";
import { fetchTrackedVideo } from "@/lib/tracking";
import { ingestAccount } from "@/lib/ingest";
import { claimRefreshRun, finishRefreshRun, renewRefreshRun, withOwnedRefresh, RefreshOwnershipLostError, type RefreshOwner } from "@/lib/refresh-jobs";
import { startRefreshHeartbeat } from "@/lib/refresh-heartbeat";
import { REFRESH_UPLOAD_START } from "@/lib/refresh-policy";

export interface RefreshTrackedVideoMetricsOptions {
  organisationId?: string;
  limitPerOrg?: number;
  /** Internal operator cohort; never accepted from HTTP requests. */
  videoIds?: string[];
}

export interface RefreshTrackedVideoMetricsResult {
  runId: string | null;
  runIds: string[];
  source: string;
  organisationsChecked: number;
  organisationsSkipped: number;
  skipped: { organisationId: string; runId: string }[];
  videosChecked: number;
  succeeded: number;
  failed: number;
  metricsSynced: number;
  failures: { organisationId: string; videoId?: string; error: string }[];
}

type Progress = {
  videosChecked: number; succeeded: number; failed: number; metricsSynced: number;
  failures: { videoId?: string; error: string }[];
};
type Candidate = { id: string; accountId: string; url: string };

export async function refreshTrackedVideoMetrics(
  options: RefreshTrackedVideoMetricsOptions = {}
): Promise<RefreshTrackedVideoMetricsResult> {
  if (options.videoIds !== undefined) {
    if (!options.organisationId?.trim()) throw new Error("An organisation is required for a fixed refresh cohort.");
    validateVideoIds(options.videoIds);
  }
  const requestedLimit = options.limitPerOrg ?? 250;
  if (!Number.isSafeInteger(requestedLimit)) throw new Error("Refresh limit must be a finite integer.");
  const limitPerOrg = Math.min(Math.max(requestedLimit, 1), 1000);
  const source = getDataSource();
  if (source.name !== "apify" && source.name !== "socialcrawl" && process.env.ALLOW_MOCK_METRIC_REFRESH !== "true") {
    throw new Error("Metric refresh is disabled unless DATA_SOURCE=socialcrawl or DATA_SOURCE=apify. This prevents scheduled jobs from creating mock weekly history.");
  }
  const result: RefreshTrackedVideoMetricsResult = {
    runId: null, runIds: [], source: source.name, organisationsChecked: 0,
    organisationsSkipped: 0, skipped: [], videosChecked: 0, succeeded: 0,
    failed: 0, metricsSynced: 0, failures: [],
  };
  const organisations = await prisma.organisation.findMany({
    where: options.organisationId ? { id: options.organisationId } : undefined,
    select: { id: true }, orderBy: { id: "asc" },
  });
  if (options.organisationId && !organisations.length) throw new Error("Organisation not found for metric refresh.");
  result.organisationsChecked = organisations.length;
  for (const org of organisations) {
    const claim = await claimRefreshRun(org.id, source.name);
    if (!claim.acquired) {
      result.organisationsSkipped++;
      result.skipped.push({ organisationId: org.id, runId: claim.runId });
      continue;
    }
    const orgResult = await refreshOrganisationVideos(claim.owner, source, limitPerOrg, options.videoIds);
    result.runIds.push(claim.owner.runId);
    result.videosChecked += orgResult.videosChecked;
    result.succeeded += orgResult.succeeded;
    result.failed += orgResult.failed;
    result.metricsSynced += orgResult.metricsSynced;
    result.failures.push(...orgResult.failures.map((failure) => ({ organisationId: org.id, ...failure })));
  }
  result.runId = result.runIds.length === 1 ? result.runIds[0] : null;
  return result;
}

// SQL bounds transfer and application memory; the database may still scan/sort
// the workspace. Missing current metrics first, then oldest capture, with stable ties.
function validateVideoIds(videoIds: string[]) {
  if (!Array.isArray(videoIds) || videoIds.length < 1 || videoIds.length > 1000 ||
      videoIds.some((id) => typeof id !== "string" || !id.trim()) || new Set(videoIds).size !== videoIds.length) {
    throw new Error("A fixed refresh cohort must contain 1 to 1000 unique nonempty video IDs.");
  }
}

export async function selectRefreshCandidates(organisationId: string, limit: number, videoIds?: string[]): Promise<Candidate[]> {
  if (videoIds !== undefined) validateVideoIds(videoIds);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("Invalid refresh candidate limit.");
  return prisma.$queryRaw<Candidate[]>`
    SELECT v."id", v."accountId", v."url"
    FROM "Video" v LEFT JOIN "VideoCurrentMetric" m ON m."videoId" = v."id"
    WHERE v."organisationId" = ${organisationId} AND v."url" IS NOT NULL
      AND v."uploadDate" >= ${REFRESH_UPLOAD_START} AND v."uploadDate" <= CURRENT_TIMESTAMP
      AND (${videoIds ?? null}::text[] IS NULL OR v."id" = ANY(${videoIds ?? null}::text[]))
    ORDER BY CASE WHEN m."videoId" IS NULL THEN TIMESTAMP '1970-01-01'
                  WHEN m."capturedAt" = TIMESTAMP '1970-01-01' THEN v."uploadDate"
                  ELSE m."capturedAt" END ASC, v."id" ASC
    LIMIT ${limit}
  `;
}

async function refreshOrganisationVideos(owner: RefreshOwner, source: DataSource, limit: number, videoIds?: string[]): Promise<Progress> {
  let progress: Progress = { videosChecked: 0, succeeded: 0, failed: 0, metricsSynced: 0, failures: [] };
  const heartbeat = startRefreshHeartbeat(owner);

  // Metric persistence and its progress receipt commit together. In-memory
  // counters advance only after commit, including for the legacy ingest path.
  async function record(videoIds: string[], persist?: (tx: Prisma.TransactionClient) => Promise<number>, error?: unknown) {
    heartbeat.assertOwned();
    const next = await withOwnedRefresh(owner, async (tx) => {
      const synced = persist ? await persist(tx) : 0;
      const failures = persist ? [] : videoIds.map((videoId) => ({ videoId, error: safeErrorMessage(error, "Unknown refresh error") }));
      const updated: Progress = {
        videosChecked: progress.videosChecked + videoIds.length,
        succeeded: progress.succeeded + (persist ? videoIds.length : 0),
        failed: progress.failed + (persist ? 0 : videoIds.length),
        metricsSynced: progress.metricsSynced + synced,
        failures: [...progress.failures, ...failures].slice(0, 50),
      };
      await saveProgress(tx, owner.runId, updated);
      return updated;
    });
    progress = next;
  }

  async function beforeProvider() {
    heartbeat.assertOwned();
    await renewRefreshRun(owner);
    heartbeat.assertOwned();
  }

  try {
    const videos = await selectRefreshCandidates(owner.organisationId, limit, videoIds);
    const fetchBatch = source.fetchVideoMetricsBatch;
    if (fetchBatch) {
      const batchSize = Math.min(positiveInt(source.maxBatchSize, 1), positiveInt(process.env.SOCIALCRAWL_BATCH_SIZE, 100), 100);
      for (const batch of refreshBatches(videos, batchSize)) {
        await beforeProvider();
        let responses;
        try { responses = await fetchBatch.call(source, batch.map((video) => video.url)); }
        catch (error) {
          await record(batch.map((video) => video.id), undefined, error);
          continue;
        }
        heartbeat.assertOwned();
        for (let index = 0; index < batch.length; index++) {
          const video = batch[index];
          const response = responses[index];
          if (!response || response.status !== "ok" || !response.metric) {
            await record([video.id], undefined, response?.error ?? `Provider returned no usable result${response?.requestId ? ` (request ${response.requestId})` : ""}.`);
            continue;
          }
          const metric = response.metric;
          try {
            await record([video.id], async (tx) => {
              const daily = await syncDailyMetricSnapshots(video.id, [metric], tx);
              await syncCurrentMetricSnapshot(video.id, metric, source.name, tx);
              await tx.account.updateMany({ where: { id: video.accountId, organisationId: owner.organisationId }, data: { lastRefreshAt: new Date() } });
              return daily + 1;
            });
          } catch (error) {
            if (error instanceof RefreshOwnershipLostError) throw error;
            await record([video.id], undefined, error);
          }
        }
      }
    } else {
      for (const video of videos) {
        await beforeProvider();
        try {
          const refreshed = await fetchTrackedVideo({ videoUrl: video.url, collectionId: null });
          await record([video.id], async (tx) => {
            const saved = await ingestAccount(owner.organisationId, refreshed.scraped, { collectionId: null, metricSource: refreshed.source.name }, tx);
            return saved.metricsSynced;
          });
        } catch (error) {
          if (error instanceof RefreshOwnershipLostError) throw error;
          await record([video.id], undefined, error);
        }
      }
    }
    heartbeat.assertOwned();
    await heartbeat.stop();
    heartbeat.assertOwned();
    await finishRefreshRun(owner, progress.failed === 0 ? "success" : progress.succeeded > 0 ? "partial" : "failed");
  } catch (error) {
    await heartbeat.stop();
    // If the database is unavailable or ownership changed, leave the durable
    // lease to expire. Never let an old worker finalize a replacement's run.
    const interrupted: Progress = {
      ...progress, failed: Math.max(1, progress.failed),
      failures: [{ error: safeErrorMessage(error, "Refresh interrupted. Saved progress is retained.") }, ...progress.failures].slice(0, 50),
    };
    try {
      await withOwnedRefresh(owner, async (tx) => { await saveProgress(tx, owner.runId, interrupted); });
      await finishRefreshRun(owner, "failed");
    } catch { /* Next invocation recovers the expired lease; no unfenced writes. */ }
    return interrupted;
  } finally { await heartbeat.stop(); }
  return progress;
}

async function saveProgress(tx: Prisma.TransactionClient, runId: string, progress: Progress) {
  const { failures, ...counts } = progress;
  await tx.metricRefreshRun.update({ where: { id: runId }, data: { ...counts, failureSummary: failures } });
}

function positiveInt(value: string | number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

// Photos use sequential single-post calls inside the provider adapter. Isolate
// them so the refresh owner is checked between photos, while ordinary URLs batch.
export function refreshBatches(videos: Candidate[], batchSize: number): Candidate[][] {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("Invalid refresh batch size.");
  const batches: Candidate[][] = [];
  let ordinary: Candidate[] = [];
  for (const video of videos) {
    let photo = false;
    try { photo = isTikTokPhotoUrl(canonicalSocialUrl(video.url)); } catch { /* Provider reports invalid URLs normally. */ }
    if (photo) {
      if (ordinary.length) batches.push(ordinary);
      ordinary = [];
      batches.push([video]);
    } else {
      ordinary.push(video);
      if (ordinary.length === batchSize) { batches.push(ordinary); ordinary = []; }
    }
  }
  if (ordinary.length) batches.push(ordinary);
  return batches;
}
