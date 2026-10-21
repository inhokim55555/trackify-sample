"use client";

import { useMemo, useState } from "react";
import { Download, TrendingUp } from "lucide-react";
import { InfoHint } from "@/components/ui";
import { formatCompact } from "@/lib/format";
import type { DailyPoint } from "@/components/TrendChart";

type Tab = "averages" | "byDay" | "uploads";
type WeeklyPoint = DailyPoint & {
  weekStart: string;
  weekEnd: string;
  label: string;
};

const WEEK_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

export function MetricsBreakdown({
  daily,
  loading,
}: {
  daily: DailyPoint[];
  loading: boolean;
}) {
  const [tab, setTab] = useState<Tab>("averages");
  const weekly = useMemo(() => buildWeeklyPoints(daily), [daily]);
  const rows = useMemo(() => buildRows(daily), [daily]);

  function exportCsv() {
    const headers = [
      "date",
      "views",
      "engagements",
      "likes",
      "comments",
      "shares",
      "saves",
      "videosUploaded",
    ];
    const csv = [
      headers.join(","),
      ...daily.map((d) =>
        [
          d.date,
          d.views,
          d.engagement,
          d.likes,
          d.comments,
          d.shares,
          d.saves,
          d.videosUploaded,
        ].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "metrics-breakdown.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-[var(--border)] text-xs">
          {[
            ["averages", "Averages"],
            ["byDay", "By Day"],
            ["uploads", "Upload Activity"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key as Tab)}
              className={`px-3 py-1.5 ${
                tab === key ? "bg-brand-50 font-medium text-brand-700" : "text-gray-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <h2 className="inline-flex items-center gap-1 text-sm font-semibold">
          Metrics Breakdown
          <InfoHint label="Day-level gains are estimated from current metric uploads and saved refresh snapshots." />
        </h2>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download size={13} /> Export Table Data
        </button>
      </div>

      {loading ? (
        <div className="p-4">
          <div className="skeleton h-28 w-full" />
        </div>
      ) : tab === "averages" ? (
        <AveragesTable rows={rows.averages} />
      ) : tab === "byDay" ? (
        <DayTable daily={daily} />
      ) : (
        <UploadTable weekly={weekly} />
      )}
    </section>
  );
}

function buildRows(daily: DailyPoint[]) {
  const days = Math.max(1, daily.length);
  const total = daily.reduce(
    (acc, d) => {
      acc.views += d.views;
      acc.engagement += d.engagement;
      acc.likes += d.likes;
      acc.comments += d.comments;
      acc.shares += d.shares;
      acc.saves += d.saves;
      acc.videos += d.videosUploaded;
      return acc;
    },
    {
      views: 0,
      engagement: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      videos: 0,
    }
  );

  return {
    averages: [
      {
        label: "Daily Average",
        badge: "D",
        views: total.views / days,
        engagement: total.engagement / days,
        likes: total.likes / days,
        comments: total.comments / days,
        shares: total.shares / days,
        saves: total.saves / days,
        videosUploaded: total.videos / days,
      },
      {
        label: "Selected Range Total",
        badge: "T",
        views: total.views,
        engagement: total.engagement,
        likes: total.likes,
        comments: total.comments,
        shares: total.shares,
        saves: total.saves,
        videosUploaded: total.videos,
      },
    ],
  };
}

function buildWeeklyPoints(daily: DailyPoint[]): WeeklyPoint[] {
  const buckets = new Map<string, WeeklyPoint>();

  for (const point of daily) {
    const start = startOfWeek(point.date);
    const end = addDays(start, 6);
    const weekStart = isoDate(start);
    const existing = buckets.get(weekStart);
    const target =
      existing ??
      {
        weekStart,
        weekEnd: isoDate(end),
        label: `${WEEK_DATE_FORMATTER.format(start)} - ${WEEK_DATE_FORMATTER.format(end)}`,
        date: weekStart,
        views: 0,
        engagement: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        videosUploaded: 0,
      };

    target.views += point.views;
    target.engagement += point.engagement;
    target.likes += point.likes;
    target.comments += point.comments;
    target.shares += point.shares;
    target.saves += point.saves;
    target.videosUploaded += point.videosUploaded;
    buckets.set(weekStart, target);
  }

  return Array.from(buckets.values()).sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart)
  );
}

function startOfWeek(dateString: string): Date {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function AveragesTable({
  rows,
}: {
  rows: ReturnType<typeof buildRows>["averages"];
}) {
  return (
    <div className="overflow-x-auto p-3">
      <table className="w-full min-w-[900px] overflow-hidden rounded-lg border border-[var(--border)] text-sm">
        <thead className="bg-gray-50 text-left text-xs text-slate-600">
          <tr>
            <th className="px-4 py-3 font-medium">Period</th>
            <th className="px-4 py-3 font-medium">Views</th>
            <th className="px-4 py-3 font-medium">Engagements</th>
            <th className="px-4 py-3 font-medium">Likes</th>
            <th className="px-4 py-3 font-medium">Comments</th>
            <th className="px-4 py-3 font-medium">Shares</th>
            <th className="px-4 py-3 font-medium">Saves</th>
            <th className="px-4 py-3 font-medium">Videos Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-[var(--border)]">
              <td className="px-4 py-4">
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  {r.badge}
                </span>
                <span className="font-medium">{r.label}</span>
              </td>
              <td className="px-4 py-4">
                <div className="font-semibold">{formatCompact(r.views)}</div>
                <div className="text-xs text-gray-400">estimated views</div>
              </td>
              <GainCell value={r.engagement} />
              <GainCell value={r.likes} />
              <GainCell value={r.comments} />
              <GainCell value={r.shares} />
              <GainCell value={r.saves} />
              <td className="px-4 py-4">
                <span className="rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
                  {formatCompact(r.videosUploaded)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GainCell({ value }: { value: number }) {
  return (
    <td className="px-4 py-4 text-emerald-600">
      <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded bg-emerald-50">
        <TrendingUp size={12} />
      </span>
      +{formatCompact(value)}
    </td>
  );
}

function DayTable({ daily }: { daily: DailyPoint[] }) {
  return (
    <div className="max-h-[360px] overflow-auto p-3 scroll-thin">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-gray-50 text-left text-xs text-slate-600">
          <tr>
            <th className="px-3 py-2 font-medium">Day</th>
            <th className="px-3 py-2 text-right font-medium">Views</th>
            <th className="px-3 py-2 text-right font-medium">Engagements</th>
            <th className="px-3 py-2 text-right font-medium">Likes</th>
            <th className="px-3 py-2 text-right font-medium">Comments</th>
            <th className="px-3 py-2 text-right font-medium">Shares</th>
            <th className="px-3 py-2 text-right font-medium">Saves</th>
            <th className="px-3 py-2 text-right font-medium">Videos Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.date} className="border-b border-[var(--border)]">
              <td className="px-3 py-2">{formatDay(d.date)}</td>
              <td className="px-3 py-2 text-right">{formatCompact(d.views)}</td>
              <td className="px-3 py-2 text-right">{formatCompact(d.engagement)}</td>
              <td className="px-3 py-2 text-right">{formatCompact(d.likes)}</td>
              <td className="px-3 py-2 text-right">{formatCompact(d.comments)}</td>
              <td className="px-3 py-2 text-right">{formatCompact(d.shares)}</td>
              <td className="px-3 py-2 text-right">{formatCompact(d.saves)}</td>
              <td className="px-3 py-2 text-right">
                {formatCompact(d.videosUploaded)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDay(date: string) {
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function UploadTable({ weekly }: { weekly: WeeklyPoint[] }) {
  const activeWeeks = weekly.filter((d) => d.videosUploaded > 0);
  return (
    <div className="p-3">
      {activeWeeks.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No uploads in this date range.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {activeWeeks.map((d) => (
            <div
              key={d.weekStart}
              className="rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <div className="text-xs text-gray-400">{d.label}</div>
              <div className="mt-1 text-lg font-semibold">
                {formatCompact(d.videosUploaded)} uploaded this week
              </div>
              <div className="text-xs text-gray-500">
                {formatCompact(d.views)} views gained this week
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
