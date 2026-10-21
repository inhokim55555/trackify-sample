"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FolderPlus,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { useFilters } from "@/components/FilterContext";
import { useApi } from "@/lib/useApi";
import {
  VIDEO_TABLE_COLUMNS,
  VideosTable,
  type VideoRow,
} from "@/components/VideosTable";
import { TrackDialog } from "@/components/TrackDialog";
import { ManualMetricsDialog } from "@/components/ManualMetricsDialog";
import { ConfirmDialog, NameDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { formatCompact, formatCountLabel } from "@/lib/format";
import type { CollectionNode } from "@/app/api/collections/route";
import { ReadError } from "@/components/ReadError";
import { createBrowserPreference, useBrowserPreference } from "@/lib/browser-preference";

interface VideosResponse {
  meta: { total: number; limit: number; offset: number };
  data: VideoRow[];
}

interface RefreshRunsResponse {
  data: {
    id: string;
    source: string;
    status: string;
    videosChecked: number;
    succeeded: number;
    failed: number;
    startedAt: string;
    finishedAt: string | null;
    failureSummary?: { error?: string }[];
  }[];
}

interface SavedColumnView {
  id: string;
  name: string;
  columns: string[];
}

const COLUMN_VIEW_STORAGE_KEY = "trackify-video-column-views-v1";
const ACTIVE_COLUMN_VIEW_STORAGE_KEY = "trackify-active-video-column-view-v1";
const INSIGHTS_OPEN_STORAGE_KEY = "trackify-video-insights-open-v1";
const PAGE_SIZE = 50;
const columnViewsPreference = createBrowserPreference<SavedColumnView[]>(COLUMN_VIEW_STORAGE_KEY, [], (raw) => {
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed.filter((view): view is SavedColumnView =>
    typeof view?.id === "string" && typeof view?.name === "string" &&
    Array.isArray(view?.columns) && view.columns.every((column: unknown) => typeof column === "string")) : [];
});
const activeColumnViewPreference = createBrowserPreference(ACTIVE_COLUMN_VIEW_STORAGE_KEY, "default", (raw) => raw, String);
const insightsPreference = createBrowserPreference(INSIGHTS_OPEN_STORAGE_KEY, false, (raw) => raw === "true", String);

const BUILT_IN_COLUMN_VIEWS: SavedColumnView[] = [
  {
    id: "default",
    name: "Default",
    columns: VIDEO_TABLE_COLUMNS.map((column) => column.key).filter(
      (key) => !["delta24h", "creator", "caption"].includes(key)
    ),
  },
  {
    id: "performance",
    name: "Performance",
    columns: [
      "video",
      "platform",
      "views",
      "viral",
      "engagementRate",
      "likes",
      "comments",
      "saves",
      "shares",
      "metricSource",
    ],
  },
  {
    id: "history",
    name: "History",
    columns: ["video", "views", "delta7d", "metricSource", "uploadDate"],
  },
];

export default function VideosPage() {
  const f = useFilters();
  const toast = useToast();
  const [sort, setSort] = useState("");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [trackOpen, setTrackOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targetCollectionId, setTargetCollectionId] = useState("");
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [customColumnViews, setCustomColumnViews] = useBrowserPreference(columnViewsPreference);
  const [savedColumnViewId, setSavedColumnViewId] = useBrowserPreference(activeColumnViewPreference);
  const [draftColumnKeys, setDraftColumnKeys] = useState<string[] | null>(null);
  const [insightsOpen, setInsightsOpen] = useBrowserPreference(insightsPreference);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [stopTrackingOpen, setStopTrackingOpen] = useState(false);

  const filterKey = f.toQuery();
  const pageScope = JSON.stringify([filterKey, sort, dir]);
  const [pagination, setPagination] = useState({ scope: pageScope, page: 0 });
  if (pagination.scope !== pageScope) setPagination({ scope: pageScope, page: 0 });
  const page = pagination.scope === pageScope ? pagination.page : 0;
  const setPage = (next: number | ((page: number) => number)) => setPagination((current) => ({
    scope: pageScope,
    page: typeof next === "function" ? next(current.scope === pageScope ? current.page : 0) : next,
  }));
  const { data, error, loading, refreshing, reload } = useApi<VideosResponse>(
    `/api/videos?${f.toQuery({
      ...(sort ? { sort } : {}),
      dir,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    })}`,
    { cache: false }
  );
  const refreshRuns = useApi<RefreshRunsResponse>("/api/metric-refresh-runs?limit=3");
  const collections = useApi<{ data: CollectionNode[] }>("/api/collections");
  const rows = useMemo(() => data?.data ?? [], [data?.data]);
  const rowKey = JSON.stringify(rows.map((row) => row.id));
  const [selectionRowKey, setSelectionRowKey] = useState(rowKey);
  if (selectionRowKey !== rowKey) {
    setSelectionRowKey(rowKey);
    const currentIds = new Set(rows.map((row) => row.id));
    setSelectedIds((current) => current.filter((id) => currentIds.has(id)));
  }
  const total = data?.meta.total ?? 0;
  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min(total, page * PAGE_SIZE + rows.length);
  const hasPrev = page > 0;
  const hasNext = (page + 1) * PAGE_SIZE < total;

  const allColumnViews = useMemo(
    () => [...BUILT_IN_COLUMN_VIEWS, ...customColumnViews],
    [customColumnViews]
  );
  const activeColumnView = allColumnViews.find((view) => view.id === savedColumnViewId) ?? BUILT_IN_COLUMN_VIEWS[0];
  const activeColumnViewId = draftColumnKeys ? "custom-unsaved" : activeColumnView.id;
  const visibleColumnKeys = draftColumnKeys ?? normalizeColumnKeys(activeColumnView.columns);
  const flatCollections = useMemo(
    () => flattenCollections(collections.data?.data ?? []),
    [collections.data]
  );
  const videoInsights = useMemo(() => {
    const latestRun = refreshRuns.data?.data[0] ?? null;
    const topGainer = rows.reduce<VideoRow | null>(
      (best, row) => (!best || row.delta7d > best.delta7d ? row : best),
      null
    );
    const viralWatch = rows.filter(
      (row) => row.viralLabel === "Breakout" || row.viralLabel === "Outperforming"
    ).length;
    const missingCurrentMetrics = rows.filter(
      (row) => !row.metricCapturedAt || row.metricSource === "none"
    ).length;
    return { latestRun, topGainer, viralWatch, missingCurrentMetrics };
  }, [rows, refreshRuns.data]);

  function toggleInsights() {
    setInsightsOpen((open) => !open);
  }

  function handleSort(key: string) {
    if (key !== sort) {
      setSort(key);
      setDir("desc");
      return;
    }

    if (dir === "desc") {
      setDir("asc");
      return;
    }

    setSort("");
    setDir("desc");
  }

  function applyColumnView(id: string) {
    const view = allColumnViews.find((item) => item.id === id);
    if (!view) return;
    setSavedColumnViewId(view.id);
    setDraftColumnKeys(null);
  }

  function toggleColumn(key: string) {
    if (key === "video") return;
    setDraftColumnKeys((current) => {
      const set = new Set(current ?? visibleColumnKeys);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return normalizeColumnKeys(Array.from(set));
    });
  }

  function saveColumnView(name: string) {
    const id = `custom-${Date.now()}`;
    const view = { id, name, columns: visibleColumnKeys };
    setCustomColumnViews((current) => [...current, view]);
    setSavedColumnViewId(id);
    setDraftColumnKeys(null);
    toast.push(`Saved column view "${name}".`, "success");
  }

  function toggleRow(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function toggleAll(ids: string[], selected: boolean) {
    setSelectedIds((current) => {
      const set = new Set(current);
      ids.forEach((id) => {
        if (selected) set.add(id);
        else set.delete(id);
      });
      return Array.from(set);
    });
  }

  async function addSelectedToCollection() {
    if (!targetCollectionId || selectedIds.length === 0) return;
    await runBulkAction("add", async () => {
      let added = 0;
      for (const videoId of selectedIds) {
        const res = await fetch(`/api/collections/${targetCollectionId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to add selected videos");
        }
        added += 1;
      }
      toast.push(
        `Added ${formatCountLabel(added, "video")} to collection.`,
        "success"
      );
      setSelectedIds([]);
      reload();
    });
  }

  async function removeSelectedFromCurrentCollection() {
    if (!f.collectionId || selectedIds.length === 0) return;
    await runBulkAction("remove", async () => {
      let removed = 0;
      for (const videoId of selectedIds) {
        const res = await fetch(`/api/collections/${f.collectionId}/items`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to remove selected videos");
        }
        const payload = await res.json().catch(() => ({ data: { removed: 0 } }));
        removed += Number(payload.data?.removed ?? 0);
      }
      toast.push(
        `Removed ${formatCountLabel(removed, "video")} from collection.`,
        "success"
      );
      setSelectedIds([]);
      reload();
    });
  }

  async function stopTrackingSelected() {
    if (selectedIds.length === 0) return;
    await runBulkAction("delete", async () => {
      const res = await fetch("/api/videos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to stop tracking videos");
      toast.push(
        `Stopped tracking ${formatCountLabel(payload.data?.deleted ?? 0, "video")}.`,
        "success"
      );
      setSelectedIds([]);
      reload();
    });
  }

  async function runBulkAction(name: string, action: () => Promise<void>) {
    setBulkBusy(name);
    try {
      await action();
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Bulk action failed",
        "error"
      );
    } finally {
      setBulkBusy(null);
    }
  }

  async function exportSelectedCsv() {
    if (selectedIds.length === 0) return;
    const params = new URLSearchParams({ ids: selectedIds.join(",") });
    const res = await fetch(`/api/videos/export?${params.toString()}`);
    const blob = res.ok
      ? await res.blob()
      : null;
    if (!res.ok || !blob) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || "Failed to export selected videos");
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trackify-selected-videos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const latestRun = videoInsights.latestRun;

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            All Videos
          </h1>
          <p className="text-xs text-gray-500">
            {data ? formatCountLabel(data.meta.total, "tracked video") : "..."}
            {refreshing ? " · refreshing" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMetricsOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Upload size={15} /> Enter Metrics
          </button>
          <button
            onClick={() => setTrackOpen(true)}
            className="flex items-center gap-2 rounded-full bg-brand-600 py-1.5 pl-4 pr-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Import Videos
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
              <Plus size={14} />
            </span>
          </button>
        </div>
      </div>

      {error ? <ReadError message={`Videos could not be loaded. ${error}`} onRetry={reload} /> : (
      <>
      {refreshRuns.error ? <ReadError message={`Refresh history could not be loaded. ${refreshRuns.error}`} onRetry={refreshRuns.reload} /> : null}
      {collections.error ? <ReadError message={`Collections could not be loaded. ${collections.error}`} onRetry={collections.reload} /> : null}
      {/* Collapsible insights: summary line when closed, full detail when open */}
      <div className="mb-3 rounded-xl border border-[var(--border)] bg-white">
        <button
          onClick={toggleInsights}
          aria-expanded={insightsOpen}
          className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-left"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Clock3 size={13} /> Insights
            <ChevronDown
              size={14}
              className={`transition-transform ${insightsOpen ? "rotate-180" : ""}`}
            />
          </span>
          {!insightsOpen ? (
            <span className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-gray-600">
              <span>
                Refresh:{" "}
                {latestRun
                  ? `${latestRun.succeeded}/${latestRun.videosChecked} (${latestRun.status})`
                  : "no runs"}
              </span>
              <span>
                Top gainer:{" "}
                {videoInsights.topGainer
                  ? `+${formatCompact(videoInsights.topGainer.delta7d)}`
                  : "—"}
              </span>
              <span>Viral watch: {videoInsights.viralWatch}</span>
              <span>
                Missing metrics: {videoInsights.missingCurrentMetrics}
              </span>
            </span>
          ) : null}
        </button>

        {insightsOpen ? (
          <div className="border-t border-[var(--border)] p-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InsightCard
                label="Refresh health"
                value={
                  latestRun
                    ? `${latestRun.succeeded}/${latestRun.videosChecked}`
                    : "No runs"
                }
                detail={
                  latestRun
                    ? `${latestRun.status} - ${new Date(latestRun.startedAt).toLocaleString()}`
                    : "Use Enter Metrics or the scheduled refresh to create a run."
                }
                tone={latestRun?.failed ? "rose" : "emerald"}
              />
              <InsightCard
                label="Top weekly gainer"
                value={
                  videoInsights.topGainer
                    ? `+${formatCompact(videoInsights.topGainer.delta7d)}`
                    : "-"
                }
                detail={videoInsights.topGainer?.accountHandle ?? "No videos in view"}
              />
              <InsightCard
                label="Viral watch"
                value={String(videoInsights.viralWatch)}
                detail="Breakout or outperforming videos by cohort."
                tone={videoInsights.viralWatch ? "amber" : "gray"}
              />
              <InsightCard
                label="Missing current metrics"
                value={String(videoInsights.missingCurrentMetrics)}
                detail="Rows without a current metric source or capture date."
                tone={videoInsights.missingCurrentMetrics ? "rose" : "gray"}
              />
            </div>

            <div className="mt-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Recent metric refresh runs
              </div>
              {refreshRuns.data?.data.length ? (
                <div className="grid gap-2 md:grid-cols-3">
                  {refreshRuns.data.data.map((run) => (
                    <div
                      key={run.id}
                      className="rounded-lg border border-[var(--border)] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold uppercase text-gray-500">
                          {run.source}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${run.status === "success" ? "bg-emerald-50 text-emerald-700" : run.status === "failed" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}
                        >
                          {run.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {run.succeeded}/{run.videosChecked} updated
                        {run.failed ? `, ${run.failed} failed` : ""}
                      </div>
                      {run.status === "interrupted" || (Array.isArray(run.failureSummary) && run.failureSummary.some((failure) => typeof failure?.error === "string" && /interrupt/i.test(failure.error))) ? (
                        <p className="mt-1 text-xs text-amber-800">
                          Refresh stopped before completion. Completed updates were retained. The next scheduled refresh can start a new run.
                        </p>
                      ) : null}
                      <div className="mt-1 text-[11px] text-gray-500">
                        {new Date(run.startedAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  No refresh runs yet. Use Enter Metrics to add current metrics
                  from your weekly update.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Table toolbar: column views */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2">
        <select
          value={activeColumnViewId}
          onChange={(e) => applyColumnView(e.target.value)}
          aria-label="Column view"
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-400"
        >
          {allColumnViews.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
            </option>
          ))}
          {activeColumnViewId === "custom-unsaved" ? (
            <option value="custom-unsaved">Unsaved view</option>
          ) : null}
        </select>
        <div className="relative">
          <button
            onClick={() => setColumnMenuOpen((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <SlidersHorizontal size={15} /> Columns
          </button>
          {columnMenuOpen ? (
            <div className="absolute left-0 top-10 z-20 w-64 rounded-xl border border-[var(--border)] bg-white p-3 shadow-xl">
              <div className="space-y-2">
                {VIDEO_TABLE_COLUMNS.map((column) => (
                  <label
                    key={column.key}
                    className="flex items-center gap-2 text-sm text-gray-600"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumnKeys.includes(column.key)}
                      disabled={column.key === "video"}
                      onChange={() => toggleColumn(column.key)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600"
                    />
                    <span>{column.label || "Platform"}</span>
                  </label>
                ))}
              </div>
              <button
                onClick={() => {
                  setColumnMenuOpen(false);
                  setSaveViewOpen(true);
                }}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                <Save size={15} /> Save view
              </button>
            </div>
          ) : null}
        </div>
        <div className="ml-auto text-xs text-gray-500">
          {total > 0 ? `Showing ${pageStart}–${pageEnd} of ${total}` : ""}
        </div>
      </div>

      {/* Sticky bulk-action bar (appears without reflowing the toolbar) */}
      {selectedIds.length > 0 ? (
        <div className="sticky top-2 z-30 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 shadow-sm">
          <span className="text-sm font-medium text-brand-800">
            {formatCountLabel(selectedIds.length, "video")} selected
          </span>
          <select
            value={targetCollectionId}
            onChange={(e) => setTargetCollectionId(e.target.value)}
            aria-label="Target collection"
            className="max-w-[220px] rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm outline-none focus:border-brand-400"
          >
            <option value="">Choose collection</option>
            {flatCollections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.label}
              </option>
            ))}
          </select>
          <button
            onClick={addSelectedToCollection}
            disabled={!targetCollectionId || !!bulkBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FolderPlus size={15} />
            {bulkBusy === "add" ? "Adding..." : "Add"}
          </button>
          <button
            onClick={removeSelectedFromCurrentCollection}
            disabled={!f.collectionId || !!bulkBusy}
            title={
              f.collectionId
                ? "Remove from the current collection"
                : "Select a collection filter first"
            }
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {bulkBusy === "remove" ? "Removing..." : "Remove"}
          </button>
          <button
            onClick={() => {
              void runBulkAction("export", exportSelectedCsv);
            }}
            disabled={!!bulkBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Download size={15} /> {bulkBusy === "export" ? "Exporting..." : "Export"}
          </button>
          <button
            onClick={() => setStopTrackingOpen(true)}
            disabled={!!bulkBusy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            <Trash2 size={15} /> Stop Tracking
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-white"
          >
            Clear
          </button>
        </div>
      ) : null}

      <VideosTable
        rows={rows}
        loading={loading}
        sort={sort}
        dir={dir}
        onSort={handleSort}
        selectedIds={selectedIds}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        visibleColumnKeys={visibleColumnKeys}
        emptyAction={
          <button
            onClick={() => setTrackOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 py-1.5 pl-4 pr-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Import Videos
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
              <Plus size={14} />
            </span>
          </button>
        }
      />

      {/* Pager */}
      {total > PAGE_SIZE ? (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--border)] bg-white px-3 py-2">
          <span className="text-xs text-gray-600">
            Showing {pageStart}–{pageEnd} of {total}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={!hasPrev || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="px-1 text-xs text-gray-600">
              Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasNext || loading}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      ) : null}

      </>
      )}

      <TrackDialog
        open={trackOpen}
        collectionId={f.collectionId}
        onClose={() => setTrackOpen(false)}
        onDone={reload}
      />
      <ManualMetricsDialog
        open={metricsOpen}
        onClose={() => setMetricsOpen(false)}
        onDone={() => {
          reload();
          refreshRuns.reload();
        }}
      />
      <NameDialog
        open={saveViewOpen}
        title="Save column view"
        label="View name"
        placeholder="e.g. Weekly report"
        submitLabel="Save view"
        onSubmit={saveColumnView}
        onClose={() => setSaveViewOpen(false)}
      />
      <ConfirmDialog
        open={stopTrackingOpen}
        title="Stop tracking videos?"
        message={`This removes ${formatCountLabel(selectedIds.length, "selected video")} and their saved metrics from Trackify. This cannot be undone.`}
        confirmLabel="Stop tracking"
        danger
        busy={bulkBusy === "delete"}
        onConfirm={async () => {
          await stopTrackingSelected();
          setStopTrackingOpen(false);
        }}
        onClose={() => setStopTrackingOpen(false)}
      />
    </div>
  );
}

function InsightCard({
  label,
  value,
  detail,
  tone = "gray",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "gray" | "emerald" | "amber" | "rose";
}) {
  const toneClass = {
    gray: "bg-pastel-mist",
    emerald: "bg-pastel-sage",
    amber: "bg-amber-50",
    rose: "bg-rose-50",
  }[tone];
  return (
    <div className={`rounded-2xl p-3.5 ${toneClass}`}>
      <div className="text-xs font-medium text-gray-600">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 line-clamp-2 text-xs text-gray-500">{detail}</div>
    </div>
  );
}

function normalizeColumnKeys(keys: string[]) {
  const allowed = new Set(VIDEO_TABLE_COLUMNS.map((column) => column.key));
  const selected = new Set(["video", ...keys.filter((key) => allowed.has(key))]);
  return VIDEO_TABLE_COLUMNS.filter((column) => selected.has(column.key)).map(
    (column) => column.key
  );
}

function flattenCollections(nodes: CollectionNode[], depth = 0): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${"  ".repeat(depth)}${node.name}` },
    ...flattenCollections(node.children, depth + 1),
  ]);
}
