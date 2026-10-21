"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { PlatformIcon, ViralBadge, DeltaText, InfoHint } from "@/components/ui";
import { VideoCreatorBadge } from "@/components/VideoCreatorBadge";
import { formatCompact, formatPercent, formatDate } from "@/lib/format";
import type { ViralConfidence, ViralLabel } from "@/lib/metrics";
import type { Platform } from "@/lib/constants";

export interface VideoRow {
  id: string;
  platform: Platform;
  caption: string;
  thumbnailUrl: string | null;
  url: string | null;
  accountHandle?: string;
  totalViews: number;
  gainViews: number;
  engagementRate: number;
  totalLikes: number;
  totalComments: number;
  totalSaves: number;
  totalShares: number;
  delta24h: number;
  delta7d: number;
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
  uploadDate: string;
  metricSource: string;
  metricCapturedAt: string | null;
  hasHistoricalMetrics: boolean;
}

interface Col {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "left" | "right";
}

export const VIDEO_TABLE_COLUMNS: Col[] = [
  { key: "video", label: "Video" },
  { key: "platform", label: "" },
  { key: "creator", label: "Creator" },
  { key: "caption", label: "Caption" },
  { key: "views", label: "Views", sortable: true, align: "right" },
  { key: "viral", label: "Viral Performance", sortable: true },
  { key: "engagementRate", label: "Engagement Rate", sortable: true, align: "right" },
  { key: "likes", label: "Likes", sortable: true, align: "right" },
  { key: "comments", label: "Comments", sortable: true, align: "right" },
  { key: "saves", label: "Saves", sortable: true, align: "right" },
  { key: "shares", label: "Shares", sortable: true, align: "right" },
  { key: "delta24h", label: "1-Day Change", sortable: true, align: "right" },
  { key: "delta7d", label: "Weekly Change", sortable: true, align: "right" },
  { key: "metricSource", label: "Metric Source" },
  { key: "uploadDate", label: "Upload Date", sortable: true, align: "right" },
];

export function VideosTable({
  rows,
  loading,
  sort,
  dir,
  onSort,
  selectedIds = [],
  onToggleRow,
  onToggleAll,
  visibleColumnKeys,
  emptyAction,
}: {
  rows: VideoRow[];
  loading: boolean;
  sort: string;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
  selectedIds?: string[];
  onToggleRow?: (id: string) => void;
  onToggleAll?: (ids: string[], selected: boolean) => void;
  visibleColumnKeys?: string[];
  emptyAction?: ReactNode;
}) {
  const visibleKeySet = new Set(visibleColumnKeys ?? VIDEO_TABLE_COLUMNS.map((c) => c.key));
  const cols = VIDEO_TABLE_COLUMNS.filter((c) => visibleKeySet.has(c.key));
  const selectedSet = new Set(selectedIds);
  const selectable = !!onToggleRow;
  const pageIds = rows.map((row) => row.id);
  const selectedOnPage = pageIds.filter((id) => selectedSet.has(id)).length;
  const allSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const someSelected = selectedOnPage > 0 && !allSelected;

  return (
    <div className="overflow-x-auto scroll-thin rounded-xl border border-[var(--border)] bg-white">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-gray-500">
            {selectable ? (
              <th className="w-10 px-3 py-2.5">
                <HeaderCheckbox
                  checked={allSelected}
                  indeterminate={someSelected}
                  onChange={() => onToggleAll?.(pageIds, !allSelected)}
                />
              </th>
            ) : null}
            {cols.map((c) => (
              <th
                key={c.key}
                className={`whitespace-nowrap px-3 py-2.5 font-medium ${
                  c.align === "right" ? "text-right" : ""
                } ${c.sortable ? "cursor-pointer select-none hover:text-gray-800" : ""}`}
                onClick={() => c.sortable && onSort(c.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {c.key === "viral" ? (
                    <InfoHint label="Compares this video's views per day against similar tracked videos by platform, collection segment, and video age." />
                  ) : null}
                  {c.key === "metricSource" ? (
                    <InfoHint label="Shows where the latest metrics came from: SocialCrawl, manual entry, CSV import, a legacy connector, or a saved historical snapshot." />
                  ) : null}
                  {c.sortable && sort === c.key ? (
                    dir === "asc" ? (
                      <ArrowUp size={12} />
                    ) : (
                      <ArrowDown size={12} />
                    )
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--border)]">
                  {selectable ? (
                    <td className="px-3 py-3">
                      <div className="skeleton h-4 w-4" />
                    </td>
                  ) : null}
                  {cols.map((c) => (
                    <td key={c.key} className="px-3 py-3">
                      <div className="skeleton h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50"
                >
                  {selectable ? (
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(r.id)}
                        onChange={() => onToggleRow?.(r.id)}
                        aria-label={`Select ${r.accountHandle ?? "video"}`}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600"
                      />
                    </td>
                  ) : null}
                  {cols.map((c) => (
                    <td key={c.key} className={cellClass(c)}>
                      {renderCell(c.key, r)}
                    </td>
                  ))}
                </tr>
              ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td
                colSpan={cols.length + (selectable ? 1 : 0)}
                className="px-3 py-12 text-center"
              >
                <div className="text-sm font-medium text-gray-600">
                  No videos for the current filters.
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Try widening the date range, clearing the collection filter,
                  or importing new video links.
                </div>
                {emptyAction ? <div className="mt-3">{emptyAction}</div> : null}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function cellClass(c: Col) {
  const base = "px-3 py-2.5";
  const align = c.align === "right" ? " text-right" : "";
  const width =
    c.key === "caption"
      ? " max-w-[280px]"
      : c.key === "video"
        ? " min-w-[260px]"
        : c.key === "viral"
          ? " min-w-[220px]"
          : "";
  const nowrap =
    c.key === "metricSource" || c.key === "uploadDate"
      ? " whitespace-nowrap"
      : "";
  return `${base}${align}${width}${nowrap}`;
}

function HeaderCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label="Select all visible videos"
      className="h-4 w-4 rounded border-gray-300 text-brand-600"
    />
  );
}

function renderCell(key: string, r: VideoRow) {
  if (key === "video") {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <Link
          href={`/videos/${r.id}`}
          className="group flex min-w-0 items-center gap-2.5"
        >
          <span className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-gray-100">
            {r.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.thumbnailUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[9px] text-gray-400">
                —
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block max-w-[220px] truncate text-sm font-medium text-gray-800 group-hover:text-brand-700">
              {r.caption || "Untitled video"}
            </span>
            <span className="block truncate text-xs text-gray-500">
              {r.accountHandle ?? "Unknown creator"}
            </span>
          </span>
        </Link>
        {r.url ? (
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 text-gray-400 hover:text-brand-700"
            aria-label="Open source video"
          >
            <ExternalLink size={13} />
          </a>
        ) : null}
      </div>
    );
  }
  if (key === "platform") return <PlatformIcon platform={r.platform} size={18} />;
  if (key === "creator") return <VideoCreatorBadge handle={r.accountHandle} />;
  if (key === "caption") {
    return <div className="truncate text-gray-600">{r.caption}</div>;
  }
  if (key === "views") {
    return <span className="font-semibold">{formatCompact(r.totalViews)}</span>;
  }
  if (key === "viral") return <ViralPerformanceCell row={r} />;
  if (key === "engagementRate") return formatPercent(r.engagementRate);
  if (key === "likes") return formatCompact(r.totalLikes);
  if (key === "comments") return formatCompact(r.totalComments);
  if (key === "saves") return formatCompact(r.totalSaves);
  if (key === "shares") return formatCompact(r.totalShares);
  if (key === "delta24h") return <DeltaText value={r.delta24h} />;
  if (key === "delta7d") return <DeltaText value={r.delta7d} />;
  if (key === "metricSource") {
    return (
      <>
        <span
          title={sourceDescription(r.metricSource)}
          className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium uppercase text-gray-500"
        >
          {sourceLabel(r.metricSource)}
        </span>
        {r.metricCapturedAt ? (
          <div className="mt-1 text-[11px] text-gray-400">
            {formatDate(r.metricCapturedAt)}
          </div>
        ) : null}
      </>
    );
  }
  if (key === "uploadDate") return formatDate(r.uploadDate);
  return null;
}

function ViralPerformanceCell({ row }: { row: VideoRow }) {
  const percentile =
    typeof row.viralPercentile === "number" ? `P${row.viralPercentile}` : null;
  const details = [
    percentile,
    row.viralCohortSize > 0 ? `${row.viralCohortSize} videos` : null,
    `${row.viralConfidence} confidence`,
  ].filter(Boolean);
  const title = [
    row.viralReason,
    row.viralCohortLabel,
    row.viralEngagementIndex
      ? `Engagement is ${row.viralEngagementIndex.toFixed(1)}x cohort median`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-w-0">
      <ViralBadge label={row.viralLabel} score={row.viralScore} title={title} />
      <div className="mt-1 truncate text-[11px] text-gray-500">
        {row.viralReason}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-gray-400">
        {details.join(" · ")}
      </div>
    </div>
  );
}

function sourceLabel(source: string) {
  if (source === "history") return "History";
  if (source === "csv") return "CSV";
  if (source === "manual") return "Manual";
  if (source === "socialcrawl") return "SocialCrawl";
  if (source === "apify" || source === "scraper") return "Apify";
  if (source === "youtube") return "YouTube";
  if (source === "mock") return "Mock";
  return "None";
}

function sourceDescription(source: string) {
  if (source === "history") return "Saved historical snapshot from a prior metric refresh.";
  if (source === "csv") return "Metrics imported from a CSV file.";
  if (source === "manual") return "Metrics entered manually by the team.";
  if (source === "socialcrawl") return "Live public metrics refreshed through SocialCrawl.";
  if (source === "apify" || source === "scraper") return "Metrics refreshed through the scraper integration.";
  if (source === "youtube") return "Metrics refreshed through the YouTube Data API.";
  if (source === "mock") return "Synthetic demo metrics.";
  return "No metric source has been recorded yet.";
}
