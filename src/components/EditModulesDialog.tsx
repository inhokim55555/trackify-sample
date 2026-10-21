"use client";

import { X } from "lucide-react";

export type ModuleKey =
  | "kpis"
  | "spendKpi"
  | "trend"
  | "videoStats"
  | "metricsBreakdown"
  | "viralCards";

const MODULES: { key: ModuleKey; label: string; description: string }[] = [
  {
    key: "kpis",
    label: "KPI Cards",
    description: "Views, engagement, and social action totals.",
  },
  {
    key: "spendKpi",
    label: "Spend KPI",
    description:
      "Off by default until a spend source is connected or entered manually.",
  },
  {
    key: "trend",
    label: "Trend Chart",
    description: "Tracked gains and cumulative performance over the selected range.",
  },
  {
    key: "videoStats",
    label: "Video Stats",
    description: "Sortable video table similar to the detailed stats view.",
  },
  {
    key: "metricsBreakdown",
    label: "Metrics Breakdown",
    description: "Weekly gains, averages, and upload activity.",
  },
  {
    key: "viralCards",
    label: "Most Viral Videos",
    description: "Ranked video cards with engagement detail.",
  },
];

export function EditModulesDialog({
  open,
  modules,
  onChange,
  onClose,
}: {
  open: boolean;
  modules: Record<ModuleKey, boolean>;
  onChange: (modules: Record<ModuleKey, boolean>) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-(--border) px-5 py-3">
          <h3 className="font-display text-base font-semibold">
            Edit Overview Modules
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-2 p-5">
          {MODULES.map((m) => (
            <label
              key={m.key}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-(--border) px-3 py-2.5 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={modules[m.key]}
                onChange={(e) =>
                  onChange({ ...modules, [m.key]: e.target.checked })
                }
                className="mt-1 h-4 w-4 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-medium text-gray-800">
                  {m.label}
                </span>
                <span className="text-xs text-gray-400">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="border-t border-(--border) px-5 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded-full bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
