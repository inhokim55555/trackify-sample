// Compact number formatting like the real app (3.6M, 148.6K, 923).
export function formatCompact(n: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000)
    return trim(n / 1_000_000_000) + "B";
  if (abs >= 1_000_000) return trim(n / 1_000_000) + "M";
  if (abs >= 1_000) return trim(n / 1_000) + "K";
  return String(Math.round(n));
}

function trim(n: number): string {
  // 1 decimal place, but drop a trailing ".0"
  const s = n.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export function formatPercent(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(digits)}%`;
}

export function formatSignedPercent(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "0%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function formatDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

export function formatShortDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}

export function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}
