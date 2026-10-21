"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { PlatformIcon } from "@/components/ui";
import { formatCompact, formatPercent } from "@/lib/format";
import type { Platform } from "@/lib/constants";

export interface AccountRow {
  id: string;
  platform: Platform;
  handle: string;
  videosTracked: number;
  viralRate: number;
  highViralRate: number;
  avgEngagementRate: number;
  totalViews: number;
  totalEngagement: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  avgViewsPerVideo: number;
  highestVideoViews: number;
  firstTrackedAt: string;
  lastRefreshAt: string;
}

interface Col {
  key: string;
  label: string;
  sortable?: boolean;
  align?: "right";
  render: (a: AccountRow) => ReactNode;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const COLS: Col[] = [
  { key: "platform", label: "", render: (a) => <PlatformIcon platform={a.platform} size={18} /> },
  { key: "videosTracked", label: "Videos", sortable: true, align: "right", render: (a) => a.videosTracked },
  { key: "viralRate", label: "Outperforming", sortable: true, align: "right", render: (a) => formatPercent(a.viralRate) },
  { key: "highViralRate", label: "Breakout", sortable: true, align: "right", render: (a) => formatPercent(a.highViralRate) },
  { key: "avgEngagementRate", label: "Avg Eng.", sortable: true, align: "right", render: (a) => formatPercent(a.avgEngagementRate) },
  { key: "totalViews", label: "Total Views", sortable: true, align: "right", render: (a) => formatCompact(a.totalViews) },
  { key: "totalEngagement", label: "Total Eng.", sortable: true, align: "right", render: (a) => formatCompact(a.totalEngagement) },
  { key: "totalLikes", label: "Likes", sortable: true, align: "right", render: (a) => formatCompact(a.totalLikes) },
  { key: "totalComments", label: "Comments", sortable: true, align: "right", render: (a) => formatCompact(a.totalComments) },
  { key: "totalShares", label: "Shares", align: "right", render: (a) => formatCompact(a.totalShares) },
  { key: "totalSaves", label: "Saves", align: "right", render: (a) => formatCompact(a.totalSaves) },
  { key: "avgViewsPerVideo", label: "Avg/Video", sortable: true, align: "right", render: (a) => formatCompact(a.avgViewsPerVideo) },
  { key: "highestVideoViews", label: "Top Video", sortable: true, align: "right", render: (a) => formatCompact(a.highestVideoViews) },
  { key: "lastRefreshAt", label: "Last Refresh", align: "right", render: (a) => timeAgo(a.lastRefreshAt) },
];

export function AccountsTable({
  rows,
  loading,
  sort,
  dir,
  onSort,
}: {
  rows: AccountRow[];
  loading: boolean;
  sort: string;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  return (
    <div className="overflow-x-auto scroll-thin rounded-xl border border-[var(--border)] bg-white">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-gray-500">
            <th className="px-3 py-2.5 font-medium">Creator</th>
            {COLS.map((c) => (
              <th
                key={c.key}
                className={`whitespace-nowrap px-3 py-2.5 font-medium ${
                  c.align === "right" ? "text-right" : ""
                } ${c.sortable ? "cursor-pointer select-none hover:text-gray-800" : ""}`}
                onClick={() => c.sortable && onSort(c.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {c.sortable && sort === c.key ? (
                    dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--border)]">
                  <td className="px-3 py-3" colSpan={COLS.length + 1}>
                    <div className="skeleton h-4 w-full" />
                  </td>
                </tr>
              ))
            : rows.map((a) => (
                <tr key={a.id} className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50">
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium">@{a.handle}</td>
                  {COLS.map((c) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-3 py-2.5 ${
                        c.align === "right" ? "text-right" : ""
                      } ${c.key === "totalViews" ? "font-semibold" : "text-gray-600"}`}
                    >
                      {c.render(a)}
                    </td>
                  ))}
                </tr>
              ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={COLS.length + 1} className="px-3 py-10 text-center text-gray-400">
                No creators for the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
