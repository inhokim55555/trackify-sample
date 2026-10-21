import { Database } from "lucide-react";
import { GmailSettings } from "@/components/GmailSettings";
import { TeamSettings } from "@/components/TeamSettings";

export default function SettingsPage() {
  const dataSource='Mock';const socialCrawlReady=true;const isLiveSource=false;const sourceStatus='Fictional local sample';
  return (
    <div className="p-5">
      <div className="mb-4">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="text-xs text-gray-500">Team access and workspace controls</p>
      </div>

      <div className="space-y-6">
        <section aria-labelledby="settings-workspace">
          <h2
            id="settings-workspace"
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Workspace
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Database size={16} className="text-gray-400" />
              <div>
                <div className="text-sm font-semibold text-gray-900">
                  Metric data source
                </div>
                <div className="text-xs text-gray-500">
                  Fictional local metrics only. No API keys or external services are used.
                </div>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                isLiveSource
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {sourceStatus}
            </span>
          </div>
        </section>

        <section aria-labelledby="settings-integrations">
          <h2
            id="settings-integrations"
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Integrations
          </h2>
          <GmailSettings />
        </section>

        <section aria-labelledby="settings-team">
          <h2
            id="settings-team"
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Team
          </h2>
          <TeamSettings />
        </section>
      </div>
    </div>
  );
}
