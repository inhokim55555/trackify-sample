"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PlatformIcon } from "@/components/ui";
import { VideoCreatorBadge } from "@/components/VideoCreatorBadge";
import { useApi } from "@/lib/useApi";
import {
  formatCompact,
  formatDate,
  formatPercent,
  formatShortDate,
} from "@/lib/format";
import type { Platform } from "@/lib/constants";

interface VideoDetailResponse {
  data: {
    id: string;
    platform: Platform;
    caption: string;
    thumbnailUrl: string | null;
    url: string | null;
    uploadDate: string;
    account: {
      id: string;
      handle: string;
      displayName: string;
      avatarUrl: string | null;
    };
    current: {
      capturedAt: string;
      views: number;
      likes: number;
      comments: number;
      shares: number;
      saves: number;
      engagementRate: number;
      source: string;
    } | null;
    snapshots: SnapshotRow[];
  };
}

interface SnapshotRow {
  id: string;
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  viewDelta: number | null;
  likeDelta: number | null;
  commentDelta: number | null;
  shareDelta: number | null;
  saveDelta: number | null;
}

export default function VideoDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useApi<VideoDetailResponse>(
    `/api/videos/${params.id}`
  );
  const video = data?.data;
  const current = video?.current;

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/videos"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={15} /> All Videos
        </Link>
        {video?.url ? (
          <a
            href={video.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink size={15} /> Open source video
          </a>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-28 w-full rounded-xl" />
          <div className="skeleton h-64 w-full rounded-xl" />
        </div>
      ) : error || !video ? (
        <div className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-gray-500">
          {error || "Video not found."}
        </div>
      ) : (
        <>
          <section className="mb-4 rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="flex flex-wrap items-start gap-4">
              <VideoCreatorBadge handle={video.account.handle} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformIcon platform={video.platform} size={20} />
                  <h1 className="text-lg font-semibold text-gray-900">
                    {video.account.displayName || video.account.handle}
                  </h1>
                  <span className="text-sm text-gray-400">
                    {video.account.handle}
                  </span>
                </div>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-600">
                  {video.caption || "No caption saved."}
                </p>
                <div className="mt-2 text-xs text-gray-400">
                  Uploaded {formatDate(video.uploadDate)}
                </div>
              </div>
            </div>
          </section>

          <section className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard label="Views" value={current?.views} />
            <MetricCard label="Likes" value={current?.likes} />
            <MetricCard label="Comments" value={current?.comments} />
            <MetricCard label="Saves" value={current?.saves} />
            <MetricCard label="Shares" value={current?.shares} />
            <MetricCard
              label="Engagement Rate"
              value={
                current ? formatPercent(current.engagementRate) : "No current data"
              }
              raw
            />
          </section>

          <section className="mb-4 rounded-xl border border-[var(--border)] bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Saved Snapshot History</h2>
                <p className="text-xs text-gray-400">
                  {video.snapshots.length} saved snapshot
                  {video.snapshots.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="text-xs text-gray-400">
                Current source: {current ? sourceLabel(current.source) : "None"}
                {current?.capturedAt ? ` / ${formatDate(current.capturedAt)}` : ""}
              </div>
            </div>
            <HistoryBars rows={video.snapshots} />
          </section>

          <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <h2 className="text-sm font-semibold">Snapshot Rows</h2>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-gray-50 text-xs text-gray-500">
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-right font-medium">Views</th>
                    <th className="px-4 py-3 text-right font-medium">View Delta</th>
                    <th className="px-4 py-3 text-right font-medium">Likes</th>
                    <th className="px-4 py-3 text-right font-medium">Comments</th>
                    <th className="px-4 py-3 text-right font-medium">Saves</th>
                    <th className="px-4 py-3 text-right font-medium">Shares</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Engagement Rate
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {video.snapshots.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatCompact(row.views)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DeltaValue value={row.viewDelta} />
                      </td>
                      <td className="px-4 py-3 text-right">{formatCompact(row.likes)}</td>
                      <td className="px-4 py-3 text-right">
                        {formatCompact(row.comments)}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCompact(row.saves)}</td>
                      <td className="px-4 py-3 text-right">
                        {formatCompact(row.shares)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatPercent(row.engagementRate)}
                      </td>
                    </tr>
                  ))}
                  {video.snapshots.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-sm text-gray-400"
                      >
                        No saved history snapshots yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  raw,
}: {
  label: string;
  value: number | string | undefined;
  raw?: boolean;
}) {
  const display =
    value === undefined
      ? "No current data"
      : raw
        ? String(value)
        : formatCompact(Number(value));
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-3">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold text-gray-900">
        {display}
      </div>
    </div>
  );
}

function HistoryBars({ rows }: { rows: SnapshotRow[] }) {
  const chartRows = [...rows].reverse().slice(-24);
  const maxViews = Math.max(...chartRows.map((row) => row.views), 1);
  if (chartRows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-gray-400">
        No saved snapshots available.
      </div>
    );
  }

  return (
    <div className="flex h-44 items-end gap-1 rounded-lg bg-gray-50 px-3 py-3">
      {chartRows.map((row) => (
        <div
          key={row.id}
          className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
          title={`${formatDate(row.date)}: ${formatCompact(row.views)} views`}
        >
          <div
            className="w-full rounded-t bg-brand-500"
            style={{ height: `${Math.max(8, (row.views / maxViews) * 130)}px` }}
          />
          <span className="hidden text-[10px] text-gray-400 sm:block">
            {formatShortDate(row.date)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DeltaValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">-</span>;
  if (value === 0) return <span className="text-gray-400">0</span>;
  return (
    <span className={value > 0 ? "text-emerald-600" : "text-rose-500"}>
      {value > 0 ? "+" : ""}
      {formatCompact(value)}
    </span>
  );
}

function sourceLabel(source: string) {
  if (source === "history") return "History";
  if (source === "csv") return "CSV";
  if (source === "manual") return "Manual";
  if (source === "socialcrawl") return "SocialCrawl";
  if (source === "apify" || source === "scraper") return "Apify";
  if (source === "youtube") return "YouTube";
  return "None";
}
