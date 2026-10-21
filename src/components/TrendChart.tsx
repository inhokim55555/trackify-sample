"use client";

import { useEffect, useRef, useState } from "react";
import type { KpiMetric } from "@/components/KpiCards";
import { formatCompact, formatShortDate } from "@/lib/format";

export interface DailyPoint {
  date: string;
  views: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  videosUploaded: number;
}
export interface CumulativePoint {
  date: string;
  views: number;
}

// Dependency-free responsive area chart (no chart library needed).
export function TrendChart({
  daily,
  loading,
  metric,
}: {
  daily: DailyPoint[];
  loading: boolean;
  metric: KpiMetric;
}) {
  const [mode, setMode] = useState<ChartMode>("cumulative");
  const metricLabel = METRIC_META[metric].label;
  const data = buildChartData(daily, metric, mode);

  return (
    <div className="rounded-xl border border-(--border) bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
            {mode === "cumulative" ? "Cumulative gains" : "Daily gains"}
          </div>
          <h2 className="text-sm font-semibold text-gray-800">{metricLabel}</h2>
        </div>
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-sm">
          {(["cumulative", "daily"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 ${
                mode === m ? "bg-white font-medium shadow-xs" : "text-gray-500"
              }`}
            >
              {m === "cumulative" ? "Cumulative" : "Daily"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="skeleton h-[280px] w-full" />
      ) : data.length === 0 ? (
        <div className="flex h-[280px] items-center justify-center text-sm text-gray-400">
          No data for the current filters.
        </div>
      ) : (
        <AreaChart data={data} mode={mode} metric={metric} />
      )}
    </div>
  );
}

type ChartMode = "daily" | "cumulative";

const METRIC_META: Record<KpiMetric, { label: string; tooltip: string }> = {
  views: { label: "Views", tooltip: "views" },
  engagement: { label: "Total Engagements", tooltip: "engagements" },
  likes: { label: "Likes", tooltip: "likes" },
  comments: { label: "Comments", tooltip: "comments" },
  shares: { label: "Shares", tooltip: "shares" },
  saves: { label: "Saves", tooltip: "saves" },
};

function buildChartData(
  daily: DailyPoint[],
  metric: KpiMetric,
  mode: ChartMode
): Pt[] {
  let running = 0;
  return daily.map((d) => {
    const gain = d[metric];
    running += gain;
    return {
      date: d.date,
      value: mode === "cumulative" ? running : gain,
      dailyValue: gain,
      videosUploaded: d.videosUploaded,
    };
  });
}

interface Pt {
  date: string;
  value: number;
  dailyValue: number;
  videosUploaded: number;
}

function AreaChart({
  data,
  mode,
  metric,
}: {
  data: Pt[];
  mode: ChartMode;
  metric: KpiMetric;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(960);
  const W = chartWidth;
  const H = 280;
  const padL = 58;
  const padR = 20;
  const padT = 12;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxV = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / maxV) * innerH;

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`)
    .join(" ");
  const areaPath =
    `${linePath} L ${x(n - 1).toFixed(1)} ${padT + innerH} L ${x(0).toFixed(1)} ${
      padT + innerH
    } Z`;

  // y-axis ticks
  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => (maxV / ticks) * i);
  // x labels (about 5)
  const labelEvery = Math.max(1, Math.floor(n / 5));

  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;

    const updateWidth = () => {
      setChartWidth(Math.max(360, Math.round(element.clientWidth)));
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = (px - padL) / innerW;
    const i = Math.round(ratio * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const hv = hover != null ? data[hover] : null;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[280px] w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#7c5cff" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(t)}
              y2={y(t)}
              stroke="#f0f0f4"
              strokeWidth={1}
            />
            <text
              x={padL - 8}
              y={y(t) + 3}
              textAnchor="end"
              fontSize="11"
              fill="#9ca3af"
            >
              {formatCompact(t)}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="url(#areaGrad)" />
        <path d={linePath} fill="none" stroke="#7c5cff" strokeWidth={2.5} />

        {data.map((d, i) =>
          i % labelEvery === 0 || i === n - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize="11"
              fill="#9ca3af"
            >
              {formatShortDate(d.date)}
            </text>
          ) : null
        )}

        {hv && (
          <g>
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={padT}
              y2={padT + innerH}
              stroke="#cbb8ff"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={x(hover!)} cy={y(hv.value)} r={4} fill="#7c5cff" />
          </g>
        )}
      </svg>

      {hv && hover != null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-(--border) bg-white px-3 py-2 text-xs shadow-md"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            top: 4,
          }}
        >
          <div className="mb-1 font-medium text-gray-500">
            {new Date(hv.date).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
          {mode === "daily" && (
            <div className="text-gray-500">
              Videos uploaded:{" "}
              <span className="font-semibold text-gray-700">{hv.videosUploaded}</span>
            </div>
          )}
          <div className="text-gray-500">
            {mode === "daily"
              ? `${METRIC_META[metric].label} gained`
              : `Cumulative ${METRIC_META[metric].tooltip}`}
            :{" "}
            <span className="font-semibold text-brand-600">
              {formatCompact(hv.value)}
            </span>
          </div>
          {mode === "cumulative" && (
            <div className="text-gray-500">
              Daily gain:{" "}
              <span className="font-semibold text-gray-700">
                {formatCompact(hv.dailyValue)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
