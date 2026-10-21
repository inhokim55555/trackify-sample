"use client";

import { useState } from "react";
import { Plus, SlidersHorizontal, Video } from "lucide-react";
import { useFilters } from "@/components/FilterContext";
import { useApi } from "@/lib/useApi";
import { KpiCards, type KpiMetric, type Kpis } from "@/components/KpiCards";
import {
  TrendChart,
  type CumulativePoint,
  type DailyPoint,
} from "@/components/TrendChart";
import { ViralVideos, type ViralVideo } from "@/components/ViralVideos";
import { TrackDialog } from "@/components/TrackDialog";
import { VideoStatsSection } from "@/components/VideoStatsSection";
import { MetricsBreakdown } from "@/components/MetricsBreakdown";
import {
  EditModulesDialog,
  type ModuleKey,
} from "@/components/EditModulesDialog";
import type { VideoRow } from "@/components/VideosTable";
import { formatCountLabel } from "@/lib/format";
import { ReadError } from "@/components/ReadError";
import { createBrowserPreference, useBrowserPreference } from "@/lib/browser-preference";

interface OverviewResponse {
  meta: { days: number; trackedVideos: number };
  kpis: Kpis;
  daily: DailyPoint[];
  cumulative: CumulativePoint[];
  videoStatsRows: VideoRow[];
  mostViral: ViralVideo[];
}

const DEFAULT_MODULES: Record<ModuleKey, boolean> = {
  kpis: true,
  spendKpi: false,
  trend: true,
  videoStats: true,
  metricsBreakdown: true,
  viralCards: true,
};
const MODULE_STORAGE_KEY = "trackify-overview-modules-v1";
const modulePreference = createBrowserPreference(MODULE_STORAGE_KEY, DEFAULT_MODULES, (raw) => {
  const parsed = JSON.parse(raw) as Partial<Record<ModuleKey, unknown>> | null;
  return Object.fromEntries(Object.entries(DEFAULT_MODULES).map(([key, fallback]) => [
    key, typeof parsed?.[key as ModuleKey] === "boolean" ? parsed[key as ModuleKey] : fallback,
  ])) as Record<ModuleKey, boolean>;
});

export default function OverviewPage() {
  const f = useFilters();
  const { data, error, loading, refreshing, reload } = useApi<OverviewResponse>(
    `/api/overview?${f.toQuery()}`,
    { cache: false }
  );
  const [trackOpen, setTrackOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<KpiMetric>("views");
  const [modules, updateModules] = useBrowserPreference(modulePreference);
  const scopeTitle = f.collectionName ? `${f.collectionName} Overview` : "Overview";
  const isEmptyWorkspace = !loading && data?.meta.trackedVideos === 0;

  return (
    <div className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {scopeTitle}
          </h1>
          <p className="text-xs text-gray-500">
            {data
              ? `${formatCountLabel(data.meta.trackedVideos, "video")} in view · ${f.rangeLabel}`
              : "..."}
            {refreshing ? " · refreshing" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModulesOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-(--border) px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <SlidersHorizontal size={14} /> Edit Modules
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

      {error ? (
        <ReadError message={`Overview could not be loaded. ${error}`} onRetry={reload} />
      ) : isEmptyWorkspace ? (
        <div className="rounded-2xl bg-pastel-sage p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white text-brand-600">
            <Video size={22} />
          </span>
          <h2 className="mt-4 font-display text-lg font-semibold text-gray-900">
            {f.collectionId
              ? "No videos in this collection yet"
              : "No videos tracked yet"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-gray-500">
            {f.collectionId
              ? "Import video links into this collection, or add existing tracked videos from the All Videos table."
              : "Paste TikTok, Instagram, YouTube, Facebook, Snapchat, or X video links to start tracking views, likes, and engagement over time."}
          </p>
          <button
            onClick={() => setTrackOpen(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-600 py-2 pl-5 pr-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Import Videos
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
              <Plus size={14} />
            </span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {modules.kpis && (
            <KpiCards
              kpis={data?.kpis ?? null}
              loading={loading}
              showSpend={modules.spendKpi}
              activeMetric={selectedMetric}
              onMetricSelect={setSelectedMetric}
            />
          )}
          {modules.trend && (
            <TrendChart
              daily={data?.daily ?? []}
              loading={loading}
              metric={selectedMetric}
            />
          )}
          {modules.videoStats && (
            <VideoStatsSection
              rows={data?.videoStatsRows ?? []}
              loading={loading}
            />
          )}
          {modules.metricsBreakdown && (
            <MetricsBreakdown daily={data?.daily ?? []} loading={loading} />
          )}
          {modules.viralCards && (
            <ViralVideos videos={data?.mostViral ?? []} loading={loading} />
          )}
        </div>
      )}

      <TrackDialog
        open={trackOpen}
        collectionId={f.collectionId}
        onClose={() => setTrackOpen(false)}
        onDone={reload}
      />
      <EditModulesDialog
        open={modulesOpen}
        modules={modules}
        onChange={updateModules}
        onClose={() => setModulesOpen(false)}
      />
    </div>
  );
}
