import { Prisma } from "@prisma/client";
import type { OverviewAggregate } from "@/lib/metrics";
import { prisma } from "@/lib/db";
import {
  descendantCollectionIds,
  type Filters,
} from "@/lib/query";

type MetricSqlValue = number | bigint | Prisma.Decimal | null;

interface DailyAggregateRow {
  date: Date | string;
  views: MetricSqlValue;
  engagement: MetricSqlValue;
  likes: MetricSqlValue;
  comments: MetricSqlValue;
  shares: MetricSqlValue;
  saves: MetricSqlValue;
  videosUploaded: MetricSqlValue;
}

interface TopGainRow {
  videoId: string;
  gainViews: number | bigint | null;
}

interface VideoFilterSql {
  empty: boolean;
  where: Prisma.Sql;
}

export async function buildOverviewFromDatabase(
  organisationId: string,
  filters: Filters
): Promise<OverviewAggregate> {
  const videoFilter = await videoFilterSql(organisationId, filters);
  const dayMap = new Map(
    eachDay(filters.from, filters.to).map((date) => [
      date,
      {
        date,
        views: 0,
        engagement: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        videosUploaded: 0,
      },
    ])
  );

  if (!videoFilter.empty) {
    const rows = await prisma.$queryRaw<DailyAggregateRow[]>(Prisma.sql`
      WITH filtered_videos AS (
        SELECT v."id", DATE(v."uploadDate") AS "uploadDate"
        FROM "Video" v
        WHERE ${videoFilter.where}
      ),
      metric_points_raw AS (
        SELECT
          m."videoId",
          DATE(m."date") AS "date",
          m."views",
          m."likes",
          m."comments",
          m."shares",
          m."saves"
        FROM "VideoDailyMetric" m
        INNER JOIN filtered_videos fv ON fv."id" = m."videoId"
        WHERE DATE(m."date") >= fv."uploadDate"

        UNION ALL

        SELECT
          cm."videoId",
          DATE(cm."capturedAt") AS "date",
          cm."views",
          cm."likes",
          cm."comments",
          cm."shares",
          cm."saves"
        FROM "VideoCurrentMetric" cm
        INNER JOIN filtered_videos fv ON fv."id" = cm."videoId"
        WHERE DATE(cm."capturedAt") >= fv."uploadDate"
      ),
      metric_points AS (
        SELECT
          "videoId",
          "date",
          MAX("views") AS "views",
          MAX("likes") AS "likes",
          MAX("comments") AS "comments",
          MAX("shares") AS "shares",
          MAX("saves") AS "saves"
        FROM metric_points_raw
        GROUP BY "videoId", "date"
      ),
      ordered_points AS (
        SELECT
          mp.*,
          fv."uploadDate",
          LAG(mp."date") OVER (PARTITION BY mp."videoId" ORDER BY mp."date") AS "prevDate",
          COALESCE(LAG(mp."views") OVER (PARTITION BY mp."videoId" ORDER BY mp."date"), 0) AS "prevViews",
          COALESCE(LAG(mp."likes") OVER (PARTITION BY mp."videoId" ORDER BY mp."date"), 0) AS "prevLikes",
          COALESCE(LAG(mp."comments") OVER (PARTITION BY mp."videoId" ORDER BY mp."date"), 0) AS "prevComments",
          COALESCE(LAG(mp."shares") OVER (PARTITION BY mp."videoId" ORDER BY mp."date"), 0) AS "prevShares",
          COALESCE(LAG(mp."saves") OVER (PARTITION BY mp."videoId" ORDER BY mp."date"), 0) AS "prevSaves"
        FROM metric_points mp
        INNER JOIN filtered_videos fv ON fv."id" = mp."videoId"
      ),
      intervals AS (
        SELECT
          "videoId",
          COALESCE("prevDate", LEAST("uploadDate", "date") - 1) AS "startDate",
          "date" AS "endDate",
          GREATEST("views" - "prevViews", 0) AS "views",
          GREATEST("likes" - "prevLikes", 0) AS "likes",
          GREATEST("comments" - "prevComments", 0) AS "comments",
          GREATEST("shares" - "prevShares", 0) AS "shares",
          GREATEST("saves" - "prevSaves", 0) AS "saves"
        FROM ordered_points
      ),
      estimated_days AS (
        SELECT
          day::date AS "date",
          i."views"::numeric / GREATEST(i."endDate" - i."startDate", 1) AS "views",
          i."likes"::numeric / GREATEST(i."endDate" - i."startDate", 1) AS "likes",
          i."comments"::numeric / GREATEST(i."endDate" - i."startDate", 1) AS "comments",
          i."shares"::numeric / GREATEST(i."endDate" - i."startDate", 1) AS "shares",
          i."saves"::numeric / GREATEST(i."endDate" - i."startDate", 1) AS "saves"
        FROM intervals i
        CROSS JOIN LATERAL generate_series(
          GREATEST(i."startDate" + 1, DATE(${filters.from})),
          LEAST(i."endDate", DATE(${filters.to})),
          INTERVAL '1 day'
        ) AS day
        WHERE i."endDate" >= DATE(${filters.from})
          AND i."startDate" < DATE(${filters.to})
      ),
      daily_metrics AS (
        SELECT
          "date",
          ROUND(SUM("views")) AS "views",
          ROUND(SUM("likes")) AS "likes",
          ROUND(SUM("comments")) AS "comments",
          ROUND(SUM("shares")) AS "shares",
          ROUND(SUM("saves")) AS "saves"
        FROM estimated_days
        GROUP BY "date"
      ),
      uploads AS (
        SELECT
          fv."uploadDate" AS "date",
          COUNT(*) AS "videosUploaded"
        FROM filtered_videos fv
        WHERE fv."uploadDate" >= DATE(${filters.from})
          AND fv."uploadDate" <= DATE(${filters.to})
        GROUP BY fv."uploadDate"
      )
      SELECT
        COALESCE(dm."date", u."date") AS "date",
        COALESCE(dm."views", 0) AS "views",
        COALESCE(dm."likes", 0) + COALESCE(dm."comments", 0) + COALESCE(dm."shares", 0) + COALESCE(dm."saves", 0) AS "engagement",
        COALESCE(dm."likes", 0) AS "likes",
        COALESCE(dm."comments", 0) AS "comments",
        COALESCE(dm."shares", 0) AS "shares",
        COALESCE(dm."saves", 0) AS "saves",
        COALESCE(u."videosUploaded", 0) AS "videosUploaded"
      FROM daily_metrics dm
      FULL OUTER JOIN uploads u ON u."date" = dm."date"
      ORDER BY "date" ASC
    `);

    for (const row of rows) {
      const key = dayKey(row.date);
      const target = dayMap.get(key);
      if (!target) continue;
      target.views = toNumber(row.views);
      target.engagement = toNumber(row.engagement);
      target.likes = toNumber(row.likes);
      target.comments = toNumber(row.comments);
      target.shares = toNumber(row.shares);
      target.saves = toNumber(row.saves);
      target.videosUploaded = toNumber(row.videosUploaded);
    }
  }

  const daily = Array.from(dayMap.values());
  const kpis = daily.reduce(
    (acc, point) => {
      acc.views += point.views;
      acc.likes += point.likes;
      acc.comments += point.comments;
      acc.shares += point.shares;
      acc.saves += point.saves;
      return acc;
    },
    { views: 0, likes: 0, comments: 0, shares: 0, saves: 0, engagement: 0 }
  );
  kpis.engagement = kpis.likes + kpis.comments + kpis.shares + kpis.saves;

  let running = 0;
  const cumulative = daily.map((point) => {
    running += point.views;
    return { date: point.date, views: running };
  });

  return { kpis, daily, cumulative };
}

export async function loadTopGainVideoIds(
  organisationId: string,
  filters: Filters,
  limit: number
): Promise<string[]> {
  const videoFilter = await videoFilterSql(organisationId, filters);
  if (videoFilter.empty || limit <= 0) return [];

  const rows = await prisma.$queryRaw<TopGainRow[]>(Prisma.sql`
    WITH filtered_videos AS (
      SELECT v."id", DATE(v."uploadDate") AS "uploadDate"
      FROM "Video" v
      WHERE ${videoFilter.where}
    ),
    metric_points_raw AS (
      SELECT
        m."videoId",
        DATE(m."date") AS "date",
        m."views"
      FROM "VideoDailyMetric" m
      INNER JOIN filtered_videos fv ON fv."id" = m."videoId"
      WHERE DATE(m."date") >= fv."uploadDate"

      UNION ALL

      SELECT
        cm."videoId",
        DATE(cm."capturedAt") AS "date",
        cm."views"
      FROM "VideoCurrentMetric" cm
      INNER JOIN filtered_videos fv ON fv."id" = cm."videoId"
      WHERE DATE(cm."capturedAt") >= fv."uploadDate"
    ),
    metric_points AS (
      SELECT
        "videoId",
        "date",
        MAX("views") AS "views"
      FROM metric_points_raw
      GROUP BY "videoId", "date"
    ),
    ordered_points AS (
      SELECT
        mp.*,
        fv."uploadDate",
        LAG(mp."date") OVER (PARTITION BY mp."videoId" ORDER BY mp."date") AS "prevDate",
        COALESCE(LAG(mp."views") OVER (PARTITION BY mp."videoId" ORDER BY mp."date"), 0) AS "prevViews"
      FROM metric_points mp
      INNER JOIN filtered_videos fv ON fv."id" = mp."videoId"
    ),
    intervals AS (
      SELECT
        "videoId",
        COALESCE("prevDate", LEAST("uploadDate", "date") - 1) AS "startDate",
        "date" AS "endDate",
        GREATEST("views" - "prevViews", 0) AS "gainViews"
      FROM ordered_points
    ),
    estimated_days AS (
      SELECT
        i."videoId",
        day::date AS "date",
        i."gainViews"::numeric / GREATEST(i."endDate" - i."startDate", 1) AS "gainViews"
      FROM intervals i
      CROSS JOIN LATERAL generate_series(
        GREATEST(i."startDate" + 1, DATE(${filters.from})),
        LEAST(i."endDate", DATE(${filters.to})),
        INTERVAL '1 day'
      ) AS day
      WHERE i."endDate" >= DATE(${filters.from})
        AND i."startDate" < DATE(${filters.to})
    )
    SELECT
      "videoId",
      SUM("gainViews") AS "gainViews"
    FROM estimated_days
    GROUP BY "videoId"
    HAVING SUM("gainViews") > 0
    ORDER BY "gainViews" DESC, "videoId" ASC
    LIMIT ${limit}
  `);

  return rows.map((row) => row.videoId);
}

async function videoFilterSql(
  organisationId: string,
  filters: Filters
): Promise<VideoFilterSql> {
  const platformFilter = filters.platform
    ? Prisma.sql`AND v."platform" = ${filters.platform}`
    : Prisma.empty;

  if (!filters.collectionId) {
    return {
      empty: false,
      where: Prisma.sql`v."organisationId" = ${organisationId} ${platformFilter}`,
    };
  }

  const collectionIds = await descendantCollectionIds(
    organisationId,
    filters.collectionId
  );
  if (collectionIds.length === 0) {
    return { empty: true, where: Prisma.sql`FALSE` };
  }

  const collectionIdList = Prisma.join(collectionIds);
  return {
    empty: false,
    where: Prisma.sql`
      v."organisationId" = ${organisationId}
      ${platformFilter}
      AND v."id" IN (
        SELECT ci."videoId"
        FROM "CollectionItem" ci
        INNER JOIN "Collection" c ON c."id" = ci."collectionId"
        WHERE ci."collectionId" IN (${collectionIdList})
          AND c."organisationId" = ${organisationId}
          AND ci."videoId" IS NOT NULL
      )
    `,
  };
}

function eachDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  const current = utcMidnight(from);
  const end = utcMidnight(to);
  while (current.getTime() <= end.getTime()) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

function utcMidnight(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function dayKey(value: Date | string) {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

function toNumber(value: MetricSqlValue) {
  if (typeof value === "bigint") return Number(value);
  return Number(value ?? 0);
}
