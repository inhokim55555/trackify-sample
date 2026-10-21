"use client";

import { Settings } from "lucide-react";
import { InfoHint } from "@/components/ui";
import { formatCompact } from "@/lib/format";

export interface Kpis {
  views: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

export type KpiMetric = keyof Kpis;

const CARDS: { key: KpiMetric | "spend"; label: string; tint: string }[] = [
  { key: "views", label: "Views", tint: "bg-brand-50" },
  { key: "engagement", label: "Total Engagements", tint: "bg-pastel-sage" },
  { key: "likes", label: "Likes", tint: "bg-pastel-lavender" },
  { key: "comments", label: "Comments", tint: "bg-pastel-peach" },
  { key: "shares", label: "Shares", tint: "bg-pastel-periwinkle" },
  { key: "saves", label: "Saves", tint: "bg-pastel-mist" },
  { key: "spend", label: "Spend", tint: "bg-pastel-mist" },
];

export function KpiCards({
  kpis,
  loading,
  showSpend = false,
  activeMetric = "views",
  onMetricSelect,
}: {
  kpis: Kpis | null;
  loading: boolean;
  showSpend?: boolean;
  activeMetric?: KpiMetric;
  onMetricSelect?: (metric: KpiMetric) => void;
}) {
  const cards = showSpend ? CARDS : CARDS.filter((c) => c.key !== "spend");
  const gridCols = showSpend ? "lg:grid-cols-7" : "lg:grid-cols-6";
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${gridCols}`}>
      {cards.map((c) => {
        const isSpend = c.key === "spend";
        const isActive = !isSpend && c.key === activeMetric;
        const value = !isSpend && kpis ? kpis[c.key as KpiMetric] : null;
        const className = `rounded-2xl p-3.5 text-left transition ${
          c.tint
        } ${
          isActive
            ? "ring-2 ring-brand-500 ring-offset-2"
            : !isSpend
              ? "hover:-translate-y-0.5 hover:shadow-xs"
              : ""
        }`;

        const content = (
          <>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-600">
              {c.label}
              {c.key === "engagement" ? (
                <InfoHint label="Total likes, comments, shares, and saves for the videos currently in view." />
              ) : null}
            </span>
            {isSpend ? (
              <div
                title="Spend tracking is not connected yet. Add a spend source or enter spend manually before this KPI is shown."
                className="mt-2 flex items-center gap-1 text-gray-500"
              >
                <Settings size={18} />
                <span className="text-xs">Not configured</span>
              </div>
            ) : loading || value === null ? (
              <div className="skeleton mt-2 h-6 w-16" />
            ) : (
              <div className="mt-1 text-2xl font-bold tracking-tight">
                {formatCompact(value)}
              </div>
            )}
          </>
        );

        if (isSpend) {
          return (
            <div key={c.key} className={className}>
              {content}
            </div>
          );
        }

        return (
          <button
            key={c.key}
            type="button"
            onClick={() => onMetricSelect?.(c.key as KpiMetric)}
            aria-pressed={isActive}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
