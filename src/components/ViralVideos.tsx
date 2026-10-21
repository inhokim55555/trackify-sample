"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, Bookmark, Eye, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { PlatformIcon, ViralBadge } from "@/components/ui";
import { VideoCreatorBadge } from "@/components/VideoCreatorBadge";
import { formatCompact, formatPercent } from "@/lib/format";
import type { Platform } from "@/lib/constants";
import type { ViralConfidence, ViralLabel } from "@/lib/metrics";

export interface ViralVideo {
  id: string;
  platform: Platform;
  caption: string;
  accountHandle?: string | null;
  url: string | null;
  totalViews: number;
  gainViews: number;
  engagementRate: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
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

export function ViralVideos({
  videos,
  loading,
}: {
  videos: ViralVideo[];
  loading: boolean;
}) {
  const [mode, setMode] = useState<"score" | "gains" | "total">("score");
  const sorted = [...videos].sort((a, b) => {
    if (mode === "total") return b.totalViews - a.totalViews;
    if (mode === "gains") return b.gainViews - a.gainViews;
    return compareViral(a, b);
  });

  return (
    <div className="rounded-xl border border-(--border) bg-white p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="w-24" />
        <h2 className="text-sm font-semibold">Most Viral Videos</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
            {(["score", "gains", "total"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-2.5 py-1 capitalize ${
                  mode === m ? "bg-white font-medium shadow-xs" : "text-gray-500"
                }`}
              >
                {m === "score" ? "Viral" : m}
              </button>
            ))}
          </div>
          <Link
            href="/videos"
            className="rounded-lg border border-(--border) px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            See All Videos
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-44 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No videos for the current filters.
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {sorted.slice(0, 3).map((v, i) => (
            <div
              key={v.id}
              className="relative grid grid-cols-[180px_1fr] overflow-hidden rounded-lg border border-(--border) bg-white"
            >
              <div className="absolute left-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white shadow-sm">
                #{i + 1}
              </div>
              <div className="relative h-[260px] bg-slate-100 p-3">
                <VideoCreatorBadge handle={v.accountHandle} size="lg" />
                <div className="absolute right-2 top-2">
                  <PlatformIcon platform={v.platform} size={18} />
                </div>
              </div>
              <div className="min-w-0 p-4">
                {v.url ? (
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-xs font-medium text-brand-700 hover:underline"
                  >
                    Open video
                  </a>
                ) : (
                  <div className="truncate text-xs font-medium text-gray-700">
                    Video
                  </div>
                )}
                <div className="mt-0.5 line-clamp-2 h-8 text-[11px] leading-tight text-gray-400">
                  {v.caption}
                </div>
                <div className="mt-2">
                  <ViralBadge
                    label={v.viralLabel}
                    score={v.viralScore}
                    title={`${v.viralReason} · ${v.viralCohortLabel}`}
                  />
                  <div className="mt-1 line-clamp-2 text-[11px] leading-tight text-slate-500">
                    {v.viralReason}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-400">
                    {typeof v.viralPercentile === "number"
                      ? `P${v.viralPercentile} · `
                      : ""}
                    {v.viralConfidence} confidence
                  </div>
                </div>
                <div className="my-3 border-t border-(--border)" />
                <div className="space-y-3 text-sm">
                  <Metric icon={<BarChart3 size={14} />} label="Views / Day" value={formatCompact(v.viralViewsPerDay)} />
                  <Metric icon={<Eye size={14} />} label="Total Views" value={formatCompact(v.totalViews)} />
                  <Metric icon={<BarChart3 size={14} />} label="Cohort Median" value={v.viralCohortMedianViewsPerDay === null ? "-" : formatCompact(v.viralCohortMedianViewsPerDay)} />
                  <Metric icon={<BarChart3 size={14} />} label="Total Engagement" value={formatCompact(v.totalLikes + v.totalComments + v.totalShares + v.totalSaves)} />
                  <Metric icon={<Heart size={14} />} label="Total Likes" value={formatCompact(v.totalLikes)} />
                  <Metric icon={<MessageCircle size={14} />} label="Total Comments" value={formatCompact(v.totalComments)} />
                  <Metric icon={<Repeat2 size={14} />} label="Total Shares" value={formatCompact(v.totalShares)} />
                  <Metric icon={<Bookmark size={14} />} label="Total Saves" value={formatCompact(v.totalSaves)} />
                  <Metric icon={<BarChart3 size={14} />} label="Engagement Rate" value={formatPercent(v.engagementRate)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function compareViral(a: ViralVideo, b: ViralVideo) {
  const labelDelta = viralRank(b.viralLabel) - viralRank(a.viralLabel);
  if (labelDelta !== 0) return labelDelta;
  if (b.viralScore !== a.viralScore) return b.viralScore - a.viralScore;
  const percentileDelta = (b.viralPercentile ?? 0) - (a.viralPercentile ?? 0);
  if (percentileDelta !== 0) return percentileDelta;
  return b.viralViewsPerDay - a.viralViewsPerDay;
}

function viralRank(label: ViralLabel) {
  if (label === "Breakout") return 4;
  if (label === "Outperforming") return 3;
  if (label === "On Track") return 2;
  if (label === "Underperforming") return 1;
  return 0;
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}
