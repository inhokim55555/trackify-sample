// Pure aggregation helpers. Given append-only cumulative snapshots, these
// derive everything the UI shows: KPI totals, gained/cumulative trends, 24h/7d
// deltas, engagement rate, and cohort-based viral performance fields.
//
// Keeping this logic pure (no DB, no I/O) makes it unit-testable and keeps the
// API routes thin.

export interface MetricRow {
  date: Date;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

export type ViralLabel =
  | "Breakout"
  | "Outperforming"
  | "On Track"
  | "Underperforming"
  | "Needs Data";

export type ViralConfidence = "High" | "Medium" | "Low";

export interface ViralScoreFields {
  viralLabel: ViralLabel;
  viralScore: number; // views/day divided by comparable cohort median views/day
  viralPercentile: number | null;
  viralViewsPerDay: number;
  viralCohortMedianViewsPerDay: number | null;
  viralCohortSize: number;
  viralCohortLabel: string;
  viralReason: string;
  viralConfidence: ViralConfidence;
  viralEngagementIndex: number | null;
}

export interface ViralCohortSource {
  id: string;
  platform: string;
  uploadDate: string | Date;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  engagementRate?: number;
  metricSource?: string;
  metricCapturedAt?: string | Date | null;
  hasHistoricalMetrics?: boolean;
  viralSegment?: string;
}

export interface VideoComputed {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  gainViews: number; // views gained inside [from, to]
  engagementRate: number; // percent
  delta24h: number; // percent change in views over the last day of range
  delta7d: number; // percent change in views over the last 7 days of range
  viralLabel: ViralLabel;
  viralScore: number;
  viralPercentile: number | null;
  viralViewsPerDay: number;
  viralCohortMedianViewsPerDay: number | null;
  viralCohortSize: number;
  viralCohortLabel: string;
  viralReason: string;
  viralConfidence: ViralConfidence;
  viralEngagementIndex: number | null;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sortAsc(rows: MetricRow[]): MetricRow[] {
  return [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Cumulative snapshot as of the latest day on or before `cutoff`.
function asOf(rows: MetricRow[], cutoff: Date): MetricRow | null {
  let result: MetricRow | null = null;
  for (const r of rows) {
    if (r.date.getTime() <= cutoff.getTime()) result = r;
    else break;
  }
  return result;
}

function emptyComputed(): VideoComputed {
  return {
    totalViews: 0,
    totalLikes: 0,
    totalComments: 0,
    totalShares: 0,
    totalSaves: 0,
    gainViews: 0,
    engagementRate: 0,
    delta24h: 0,
    delta7d: 0,
    ...emptyViralScore(),
  };
}

function emptyViralScore(reason = "No metric history is available yet."): ViralScoreFields {
  return {
    viralLabel: "Needs Data",
    viralScore: 0,
    viralPercentile: null,
    viralViewsPerDay: 0,
    viralCohortMedianViewsPerDay: null,
    viralCohortSize: 0,
    viralCohortLabel: "Comparable videos",
    viralReason: reason,
    viralConfidence: "Low",
    viralEngagementIndex: null,
  };
}

function pctChange(now: number, then: number): number {
  if (then <= 0) return now > 0 ? 100 : 0;
  return ((now - then) / then) * 100;
}

/**
 * Compute a single video's derived metrics over the window [from, to].
 * `rows` must be that video's cumulative dated snapshots (any order).
 */
export function computeVideo(
  rowsInput: MetricRow[],
  from: Date,
  to: Date
): VideoComputed {
  const rows = sortAsc(rowsInput);
  if (rows.length === 0) return emptyComputed();

  const latest = asOf(rows, to) ?? rows[rows.length - 1];
  const baseline = asOf(rows, new Date(from.getTime() - 86_400_000)); // day before range
  const gainViews = baseline ? Math.max(0, latest.views - baseline.views) : 0;

  const engagementAbs =
    latest.likes + latest.comments + latest.shares + latest.saves;
  const engagementRate =
    latest.views > 0 ? (engagementAbs / latest.views) * 100 : 0;

  const dayBefore = asOf(rows, new Date(to.getTime() - 86_400_000));
  const weekBefore = asOf(rows, new Date(to.getTime() - 7 * 86_400_000));
  const delta24h = pctChange(latest.views, dayBefore?.views ?? latest.views);
  const delta7d = pctChange(latest.views, weekBefore?.views ?? latest.views);

  return {
    totalViews: latest.views,
    totalLikes: latest.likes,
    totalComments: latest.comments,
    totalShares: latest.shares,
    totalSaves: latest.saves,
    gainViews,
    engagementRate,
    delta24h,
    delta7d,
    ...emptyViralScore("Needs comparable current metrics to score performance."),
  };
}

const MS_PER_DAY = 86_400_000;
const MIN_COHORT_SIZE = 3;

interface ComparableVideo {
  id: string;
  platform: string;
  segment: string;
  ageBucket: string;
  ageDays: number;
  viewsPerDay: number;
  engagementRate: number;
  hasMetric: boolean;
}

interface CohortChoice {
  label: string;
  items: ComparableVideo[];
}

/**
 * Score videos against comparable cohorts so imported one-snapshot videos still
 * receive useful labels. Cohorts prefer same platform + collection segment +
 * age bucket, then fall back to broader groups when the exact cohort is small.
 */
export function applyViralCohortScores<T extends ViralCohortSource>(
  videos: T[],
  options: {
    now?: Date;
    cohortRows?: ViralCohortSource[];
  } = {}
): Array<T & ViralScoreFields> {
  const now = options.now ?? new Date();
  const cohortRows = options.cohortRows?.length ? options.cohortRows : videos;
  const cohortMetrics = cohortRows
    .map((row) => toComparableVideo(row, now))
    .filter((row) => row.hasMetric);
  const groups = new Map<string, ComparableVideo[]>();

  for (const metric of cohortMetrics) {
    for (const key of cohortKeys(metric)) {
      const group = groups.get(key) ?? [];
      group.push(metric);
      groups.set(key, group);
    }
  }

  return videos.map((video) => {
    const metric = toComparableVideo(video, now);
    if (!metric.hasMetric) {
      return {
        ...video,
        ...emptyViralScore("No current or historical metric source is available."),
      };
    }

    const cohort = chooseCohort(metric, groups);
    if (!cohort) {
      return {
        ...video,
        ...emptyViralScore("Needs at least 3 comparable tracked videos."),
        viralViewsPerDay: metric.viewsPerDay,
      };
    }

    const velocities = cohort.items.map((item) => item.viewsPerDay);
    const medianViewsPerDay = median(velocities);
    const percentile = percentileOf(velocities, metric.viewsPerDay);
    const score =
      medianViewsPerDay > 0
        ? metric.viewsPerDay / medianViewsPerDay
        : metric.viewsPerDay > 0
          ? metric.viewsPerDay
          : 0;
    const engagementRates = cohort.items
      .map((item) => item.engagementRate)
      .filter((rate) => Number.isFinite(rate) && rate > 0);
    const medianEngagementRate =
      engagementRates.length > 0 ? median(engagementRates) : 0;
    const engagementIndex =
      medianEngagementRate > 0 ? metric.engagementRate / medianEngagementRate : null;
    const label = viralLabelFor(score, percentile);
    const confidence = viralConfidenceFor(cohort.items.length);

    return {
      ...video,
      viralLabel: label,
      viralScore: round(score, 2),
      viralPercentile: Math.round(percentile),
      viralViewsPerDay: Math.round(metric.viewsPerDay),
      viralCohortMedianViewsPerDay: Math.round(medianViewsPerDay),
      viralCohortSize: cohort.items.length,
      viralCohortLabel: cohort.label,
      viralReason: `${formatCompactMetric(metric.viewsPerDay)}/day vs ${formatCompactMetric(medianViewsPerDay)}/day median`,
      viralConfidence: confidence,
      viralEngagementIndex:
        engagementIndex === null || !Number.isFinite(engagementIndex)
          ? null
          : round(engagementIndex, 2),
    };
  });
}

function toComparableVideo(row: ViralCohortSource, now: Date): ComparableVideo {
  const uploadDate = parseDate(row.uploadDate) ?? now;
  const capturedAt = parseDate(row.metricCapturedAt ?? null) ?? now;
  const ageDays = dayDiff(uploadDate, capturedAt);
  const totalEngagement =
    row.totalLikes + row.totalComments + row.totalShares + row.totalSaves;
  const engagementRate =
    typeof row.engagementRate === "number"
      ? row.engagementRate
      : row.totalViews > 0
        ? (totalEngagement / row.totalViews) * 100
        : 0;
  const source = (row.metricSource ?? "").toLowerCase();
  const hasRecordedSource = source.length > 0 && source !== "none";
  const hasMetric =
    hasRecordedSource ||
    !!row.metricCapturedAt ||
    !!row.hasHistoricalMetrics ||
    row.totalViews > 0 ||
    totalEngagement > 0;

  return {
    id: row.id,
    platform: row.platform || "all",
    segment: normalizeSegment(row.viralSegment),
    ageBucket: ageBucketFor(ageDays),
    ageDays,
    viewsPerDay: row.totalViews / Math.max(ageDays, 1),
    engagementRate,
    hasMetric,
  };
}

function chooseCohort(
  metric: ComparableVideo,
  groups: Map<string, ComparableVideo[]>
): CohortChoice | null {
  for (const key of cohortKeys(metric)) {
    const items = groups.get(key) ?? [];
    if (items.length >= MIN_COHORT_SIZE) {
      return { label: cohortLabel(key), items };
    }
  }
  return null;
}

function cohortKeys(metric: ComparableVideo): string[] {
  const platform = metric.platform;
  const segment = metric.segment;
  const ageBucket = metric.ageBucket;
  const keys = [
    keyFor(platform, segment, ageBucket),
    keyFor(platform, "All", ageBucket),
    keyFor("All", segment, ageBucket),
    keyFor("All", "All", ageBucket),
    keyFor(platform, segment, "All ages"),
    keyFor(platform, "All", "All ages"),
    keyFor("All", "All", "All ages"),
  ];
  return Array.from(new Set(keys));
}

function keyFor(platform: string, segment: string, ageBucket: string) {
  return `${platform}::${segment}::${ageBucket}`;
}

function cohortLabel(key: string) {
  const [platform, segment, ageBucket] = key.split("::");
  const parts = [];
  if (segment && segment !== "All") parts.push(segment);
  if (platform && platform !== "All") parts.push(platform);
  else parts.push("All-platform");
  parts.push("videos");
  if (ageBucket && ageBucket !== "All ages") parts.push(`${ageBucket} old`);
  return parts.join(" ");
}

function normalizeSegment(value?: string) {
  const segment = value?.trim();
  return segment && segment.length > 0 ? segment : "All";
}

function ageBucketFor(ageDays: number) {
  if (ageDays <= 3) return "0-3d";
  if (ageDays <= 7) return "4-7d";
  if (ageDays <= 14) return "8-14d";
  if (ageDays <= 30) return "15-30d";
  if (ageDays <= 90) return "31-90d";
  return "90d+";
}

function viralLabelFor(score: number, percentile: number): ViralLabel {
  if (score >= 3 || percentile >= 90) return "Breakout";
  if (score >= 1.5 || percentile >= 75) return "Outperforming";
  if (score < 0.75 || percentile <= 25) return "Underperforming";
  return "On Track";
}

function viralConfidenceFor(cohortSize: number): ViralConfidence {
  if (cohortSize >= 10) return "High";
  if (cohortSize >= 5) return "Medium";
  return "Low";
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function percentileOf(values: number[], value: number) {
  if (values.length === 0) return 0;
  let less = 0;
  let equal = 0;
  for (const candidate of values) {
    if (candidate < value) less += 1;
    else if (candidate === value) equal += 1;
  }
  return ((less + equal * 0.5) / values.length) * 100;
}

function dayDiff(from: Date, to: Date) {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.max(1, Math.round((end - start) / MS_PER_DAY) || 1);
}

function parseDate(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatCompactMetric(value: number) {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  if (abs >= 1_000_000) return `${round(rounded / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `${round(rounded / 1_000, 1)}K`;
  return String(rounded);
}

export interface DailyTrendPoint {
  date: string; // yyyy-mm-dd
  views: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  videosUploaded: number;
}

export interface OverviewAggregate {
  kpis: {
    views: number;
    engagement: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
  };
  daily: DailyTrendPoint[];
  cumulative: { date: string; views: number }[];
}

export interface VideoRowsBundle {
  videoId: string;
  uploadDate: Date;
  rows: MetricRow[];
}

function eachDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cur = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  );
  while (cur.getTime() <= end.getTime()) {
    days.push(dayKey(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

/**
 * Aggregate many videos into the Overview payload: summed gains by snapshot day,
 * a cumulative running total, and KPI sums over [from, to].
 *
 * The first snapshot for a video is treated as its baseline. We only count gains
 * once a previous snapshot exists, so a video's pre-tracking lifetime views do
 * not appear as new growth on the first tracking day.
 */
export function aggregateOverview(
  bundles: VideoRowsBundle[],
  from: Date,
  to: Date
): OverviewAggregate {
  const days = eachDay(from, to);
  const map = new Map<string, DailyTrendPoint>();
  for (const d of days) {
    map.set(d, {
      date: d,
      views: 0,
      engagement: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      videosUploaded: 0,
    });
  }

  for (const bundle of bundles) {
    const rows = sortAsc(bundle.rows);
    // snapshot gains within range
    for (let i = 0; i < rows.length; i++) {
      const key = dayKey(rows[i].date);
      const target = map.get(key);
      if (!target) continue;
      const previous = rows[i - 1];
      if (!previous) continue;
      target.views += Math.max(0, rows[i].views - (previous?.views ?? 0));
      target.likes += Math.max(0, rows[i].likes - (previous?.likes ?? 0));
      const commentGain = Math.max(
        0,
        rows[i].comments - (previous?.comments ?? 0)
      );
      const shareGain = Math.max(0, rows[i].shares - (previous?.shares ?? 0));
      const saveGain = Math.max(0, rows[i].saves - (previous?.saves ?? 0));
      target.comments += commentGain;
      target.shares += shareGain;
      target.saves += saveGain;
      target.engagement +=
        Math.max(0, rows[i].likes - (previous?.likes ?? 0)) +
        commentGain +
        shareGain +
        saveGain;
    }
    // uploads counted on their upload day if it falls in range
    const uKey = dayKey(bundle.uploadDate);
    const uTarget = map.get(uKey);
    if (uTarget) uTarget.videosUploaded += 1;
  }

  const daily = days.map((d) => map.get(d)!);
  const kpis = daily.reduce(
    (acc, p) => {
      acc.views += p.views;
      acc.likes += p.likes;
      acc.comments += p.comments;
      acc.shares += p.shares;
      acc.saves += p.saves;
      return acc;
    },
    { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, engagement: 0 }
  );
  kpis.engagement = kpis.likes + kpis.comments + kpis.shares + kpis.saves;

  let running = 0;
  const cumulative = daily.map((p) => {
    running += p.views;
    return { date: p.date, views: running };
  });

  return { kpis, daily, cumulative };
}
