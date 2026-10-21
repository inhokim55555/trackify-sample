"use client";

import Link from "next/link";
import { ArrowDown, ExternalLink } from "lucide-react";
import { InfoHint, PlatformIcon, ViralBadge } from "@/components/ui";
import { VideoCreatorBadge } from "@/components/VideoCreatorBadge";
import { formatCompact, formatDate, formatPercent } from "@/lib/format";
import type { VideoRow } from "@/components/VideosTable";

export function VideoStatsSection({
  rows,
  loading,
}: {
  rows: VideoRow[];
  loading: boolean;
}) {
  const displayRows = rows.slice(0, 8);

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="w-32" />
        <h2 className="text-sm font-semibold">Video Stats</h2>
        <Link
          href="/videos"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          See All Videos
        </Link>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full min-w-[1180px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-gray-50 text-left text-xs text-slate-600">
              <th className="w-[360px] px-4 py-3 font-medium">Video</th>
              <th className="bg-slate-100 px-4 py-3 font-medium">
                <span className="inline-flex items-center gap-2">
                  Views <ArrowDown size={13} className="text-brand-600" />
                </span>
              </th>
              <th className="px-4 py-3 font-medium">
                <span className="inline-flex items-center gap-1">
                  Viral Performance
                  <InfoHint label="Compares this video's views per day against similar tracked videos by platform, collection segment, and video age." />
                </span>
              </th>
              <th className="px-4 py-3 text-right font-medium">
                <span className="inline-flex items-center justify-end gap-1">
                  Engagement Rate
                  <InfoHint label="Engagement rate is total likes, comments, shares, and saves divided by views." />
                </span>
              </th>
              <th className="px-4 py-3 text-right font-medium">Likes</th>
              <th className="px-4 py-3 text-right font-medium">Comments</th>
              <th className="px-4 py-3 text-right font-medium">Saves</th>
              <th className="px-4 py-3 text-right font-medium">Shares</th>
              <th className="px-4 py-3 text-right font-medium">Upload Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-[var(--border)]">
                  <td colSpan={9} className="px-4 py-4">
                    <div className="skeleton h-12 w-full" />
                  </td>
                </tr>
              ))
            ) : displayRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                  No videos for the current filters.
                </td>
              </tr>
            ) : (
              displayRows.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-[var(--border)] last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <VideoCreatorBadge handle={v.accountHandle} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                          <PlatformIcon platform={v.platform} size={18} />
                          <span>{v.url ? "Open video" : "Tracked video"}</span>
                          {v.url && (
                            <a
                              href={v.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-gray-400 hover:text-brand-700"
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs leading-snug text-slate-500">
                          {v.caption}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          Uploaded on: {formatDate(v.uploadDate)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-brand-300 px-2 py-1 text-xs font-semibold text-brand-700 shadow-[0_0_12px_rgba(139,92,246,0.35)]">
                      {formatCompact(v.totalViews)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ViralBadge
                      label={v.viralLabel}
                      score={v.viralScore}
                      title={`${v.viralReason} · ${v.viralCohortLabel}`}
                    />
                    <div className="mt-1 max-w-[220px] truncate text-[11px] text-slate-500">
                      {v.viralReason}
                    </div>
                    <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-slate-400">
                      {typeof v.viralPercentile === "number"
                        ? `P${v.viralPercentile} · `
                        : ""}
                      {v.viralConfidence} confidence
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatPercent(v.engagementRate)}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCompact(v.totalLikes)}</td>
                  <td className="px-4 py-3 text-right">
                    {formatCompact(v.totalComments)}
                  </td>
                  <td className="px-4 py-3 text-right">{formatCompact(v.totalSaves)}</td>
                  <td className="px-4 py-3 text-right">{formatCompact(v.totalShares)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                      {formatDate(v.uploadDate)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
