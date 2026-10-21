"use client";

import { useMemo, useState } from "react";
import { FileUp, X } from "lucide-react";

interface MetricUpdate {
  url?: string;
  videoId?: string;
  views?: string;
  likes?: string;
  comments?: string;
  shares?: string;
  saves?: string;
  capturedAt?: string;
}

export function ManualMetricsDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [failures, setFailures] = useState<{ row: number; error: string }[]>([]);
  const updates = useMemo(() => parseMetricCsv(input), [input]);

  if (!open) return null;

  async function submit() {
    if (updates.length === 0) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    setFailures([]);
    try {
      const res = await fetch("/api/videos/current-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "csv", updates }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to update metrics");
      const data = payload.data as { updated: number; currentUpdated?: number; historyOnly?: number; failed: number; failures?: { row: number; error: string }[] };
      const historyOnly = data.historyOnly ?? 0;
      const currentUpdated = data.currentUpdated ?? data.updated;
      setResult([
        `Imported ${data.updated} row${data.updated === 1 ? "" : "s"}.`,
        `Current metrics updated for ${currentUpdated} row${currentUpdated === 1 ? "" : "s"}.`,
        historyOnly ? `${historyOnly} older row${historyOnly === 1 ? "" : "s"} saved to history; newer current metrics were kept.` : "",
      ].filter(Boolean).join(" "));
      setFailures(data.failures ?? []);
      if (data.failed > 0) {
        setError(`${data.failed} row${data.failed === 1 ? "" : "s"} failed.`);
      }
      if (data.updated > 0) onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update metrics");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCsv(file: File | null) {
    if (!file) return;
    setInput(await file.text());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-(--border) px-5 py-3">
          <div>
            <h3 className="text-base font-semibold">Update current metrics</h3>
            <p className="text-xs text-gray-400">
              CSV columns: url, views, likes, comments, saves, shares, date.
              Blank metric cells leave existing counts unchanged; enter 0 only for a measured zero.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-(--border) px-4 py-3 text-sm text-gray-600 hover:bg-gray-50">
              <FileUp size={16} />
              Upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleCsv(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
              {updates.length} row{updates.length === 1 ? "" : "s"} detected
            </div>
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"url,views,likes,comments,saves,shares,date\nhttps://www.instagram.com/reel/abc,12000,700,20,55,40,2026-06-05"}
            className="h-56 w-full resize-none rounded-lg border border-(--border) px-3 py-2 font-mono text-xs outline-hidden focus:border-brand-400"
          />

          {updates.length > 0 ? (
            <div className="mt-3 rounded-lg border border-(--border) bg-gray-50 px-3 py-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Import preview
              </div>
              <div className="max-h-28 overflow-y-auto text-xs text-gray-600 scroll-thin">
                {updates.slice(0, 6).map((row, index) => (
                  <div key={`${row.url || row.videoId}-${index}`} className="truncate">
                    Row {index + 2}: {row.url || row.videoId} - {row.views || 0} views
                  </div>
                ))}
                {updates.length > 6 ? (
                  <div className="text-gray-400">+{updates.length - 6} more rows</div>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">
              {error}
            </p>
          ) : null}
          {result ? (
            <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {result}
            </p>
          ) : null}
          {failures.length > 0 ? (
            <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
              <div className="mb-1 text-xs font-semibold text-rose-700">
                Failed rows
              </div>
              <div className="max-h-28 overflow-y-auto text-xs text-rose-700 scroll-thin">
                {failures.map((failure) => (
                  <div key={`${failure.row}-${failure.error}`}>
                    Row {failure.row + 1}: {failure.error}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-(--border) px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-(--border) px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={submit}
            disabled={submitting || updates.length === 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "Updating..." : "Update Metrics"}
          </button>
        </div>
      </div>
    </div>
  );
}

function parseMetricCsv(text: string): MetricUpdate[] {
  const rows = parseCsv(text).filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).flatMap((cells) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index]?.trim() ?? "";
    });
    const update: MetricUpdate = {
      url: row.url || row.video_url || row.video || row.link,
      videoId: row.video_id || row.id,
      views: row.views,
      likes: row.likes,
      comments: row.comments || row.cmts,
      saves: row.saves,
      shares: row.shares,
      capturedAt: row.date || row.captured_at || row.updated_at,
    };
    return update.url || update.videoId ? [update] : [];
  });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
