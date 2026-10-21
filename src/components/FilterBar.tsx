"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Calendar, ChevronDown, Download, X } from "lucide-react";
import { useFilters } from "@/components/FilterContext";
import { useToast } from "@/components/Toast";
import { PlatformIcon } from "@/components/ui";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  RANGE_PRESETS,
  type Platform,
} from "@/lib/constants";

export function FilterBar() {
  const f = useFilters();
  const pathname = usePathname();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const query =
        pathname === "/"
          ? new URLSearchParams({ scope: "all" }).toString()
          : f.toQuery();
      const res = await fetch(`/api/videos/export?${query}`);
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "Failed to export videos");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pathname === "/" ? "trackify-all-videos.csv" : "trackify-videos.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : "Failed to export videos", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-white px-5 py-2.5">
      {/* Collection chip */}
      <div
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
          f.collectionName
            ? "border-brand-200 bg-brand-50 text-brand-800"
            : "border-[var(--border)] bg-white text-gray-500"
        }`}
      >
        {f.collectionName ? (
          <>
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-500">
              Collection
            </span>
            <span className="font-medium text-brand-800">{f.collectionName}</span>
            <button
              onClick={() => f.setCollection(null, null)}
              className="text-brand-400 hover:text-brand-700"
              aria-label="Clear collection"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <span>All Collections</span>
        )}
      </div>

      {/* Platform selector */}
      <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-1.5 py-1">
        <button
          onClick={() => f.setPlatform("all")}
          className={`rounded-md px-2 py-1 text-xs ${
            f.platform === "all"
              ? "bg-brand-50 font-medium text-brand-700"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          All
        </button>
        {PLATFORMS.map((p: Platform) => (
          <button
            key={p}
            title={PLATFORM_LABELS[p]}
            aria-label={`Filter by ${PLATFORM_LABELS[p]}`}
            onClick={() => f.setPlatform(f.platform === p ? "all" : p)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
              f.platform === p
                ? "bg-brand-50 font-medium text-brand-700 ring-1 ring-brand-200"
                : "text-gray-500 opacity-80 hover:bg-gray-100 hover:opacity-100"
            }`}
          >
            <PlatformIcon platform={p} size={16} />
            <span>{PLATFORM_LABELS[p]}</span>
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Date range: single button + popover (presets and custom dates in one place) */}
      <div className="relative">
        <button
          onClick={() => setRangeOpen((v) => !v)}
          aria-expanded={rangeOpen}
          aria-label="Choose date range"
          className="flex max-w-[260px] items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Calendar size={14} className="text-gray-400" />
          <span className="min-w-0 truncate">{f.rangeLabel}</span>
          <ChevronDown size={13} className="text-gray-400" />
        </button>
        {rangeOpen ? (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => setRangeOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute right-0 top-10 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--border)] bg-white p-2 shadow-xl">
              <div className="space-y-0.5">
                {RANGE_PRESETS.map((r) => {
                  const active = !f.from && !f.to && f.range === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        f.setRange(r.id);
                        setRangeOpen(false);
                      }}
                      className={`block w-full rounded-md px-2.5 py-1.5 text-left text-sm ${
                        active
                          ? "bg-brand-50 font-medium text-brand-700"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 border-t border-[var(--border)] pt-2">
                <div className="mb-1.5 px-1 text-xs font-medium text-gray-600">
                  Custom range
                </div>
                <div className="grid gap-2 px-1 pb-1">
                  <label className="grid gap-1 text-xs font-medium text-gray-500">
                    From
                    <input
                      type="date"
                      value={f.from ?? ""}
                      aria-label="From date"
                      onChange={(e) => f.setDateRange(e.target.value || null, f.to)}
                      className="min-w-0 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm font-normal text-gray-700 outline-none focus:border-brand-400"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-gray-500">
                    To
                    <input
                      type="date"
                      value={f.to ?? ""}
                      aria-label="To date"
                      onChange={(e) => f.setDateRange(f.from, e.target.value || null)}
                      className="min-w-0 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm font-normal text-gray-700 outline-none focus:border-brand-400"
                    />
                  </label>
                </div>
                {f.from || f.to ? (
                  <button
                    onClick={() => {
                      f.setDateRange(null, null);
                      setRangeOpen(false);
                    }}
                    className="mx-1 mb-1 rounded-md px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    Clear custom dates
                  </button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Export */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
      >
        <Download size={14} />
        {exporting ? "Exporting..." : "Export"}
      </button>
    </div>
  );
}
