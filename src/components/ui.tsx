import { Info } from "lucide-react";
import { PLATFORM_COLORS, PLATFORM_LABELS, type Platform } from "@/lib/constants";
import { formatSignedPercent } from "@/lib/format";
import type { ViralLabel } from "@/lib/metrics";

export function PlatformIcon({
  platform,
  size = 20,
}: {
  platform: Platform;
  size?: number;
}) {
  const color = PLATFORM_COLORS[platform] ?? "#888";
  const label = PLATFORM_LABELS[platform] ?? platform;
  const letter = label.charAt(0).toUpperCase();
  const textColor = platform === "snapchat" ? "#1c1c28" : "#fff";
  return (
    <span
      title={label}
      style={{ width: size, height: size, background: color, color: textColor }}
      className="inline-flex items-center justify-center rounded-[6px] text-[11px] font-bold leading-none"
    >
      {letter}
    </span>
  );
}

const VIRAL_STYLES: Record<ViralLabel, string> = {
  Breakout: "bg-brand-100 text-brand-700",
  Outperforming: "bg-emerald-50 text-emerald-700",
  "On Track": "bg-gray-100 text-gray-600",
  Underperforming: "bg-amber-50 text-amber-700",
  "Needs Data": "bg-gray-50 text-gray-400",
};

export function ViralBadge({
  label,
  score,
  title,
}: {
  label: ViralLabel;
  score?: number;
  title?: string;
}) {
  const scoreLabel =
    typeof score === "number" && Number.isFinite(score) && label !== "Needs Data"
      ? ` · ${score.toFixed(1)}x`
      : "";
  return (
    <span
      title={
        title ??
        "Compares this video's views per day against similar tracked videos."
      }
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${VIRAL_STYLES[label]}`}
    >
      {label}
      {scoreLabel}
    </span>
  );
}

export function DeltaText({ value }: { value: number }) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) {
    return <span className="text-gray-400">0%</span>;
  }
  const positive = value > 0;
  return (
    <span className={positive ? "text-emerald-600" : "text-rose-500"}>
      {formatSignedPercent(value)}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function InfoHint({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex cursor-help items-center text-gray-300 hover:text-gray-500 ${className}`}
    >
      <Info size={13} />
    </span>
  );
}
