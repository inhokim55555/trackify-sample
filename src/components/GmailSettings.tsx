"use client";

import { useState } from "react";
import { Mail, Plug, Unplug } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { formatDate } from "@/lib/format";

interface GmailStatusResponse {
  data: {
    configured: boolean;
    connected: boolean;
    email: string | null;
    scope: string;
    connectedAt: string | null;
    expiresAt: string | null;
    lastSyncedAt: string | null;
  };
}

export function GmailSettings() {
  const status = useApi<GmailStatusResponse>("/api/gmail/status");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gmail = status.data?.data;

  function connect() {
    // OAuth starts with a top-level HTTP redirect, not an App Router page transition.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/api/gmail/oauth/start";
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/gmail/status", { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to disconnect Gmail");
      status.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Gmail");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Mail size={16} className="text-sky-600" />
          <div>
            <h2 className="text-sm font-semibold">Gmail</h2>
            <p className="text-xs text-gray-400">
              {gmail?.connected ? gmail.email : "Not connected"}
            </p>
          </div>
        </div>
        {gmail?.connected ? (
          <button
            onClick={disconnect}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <Unplug size={15} /> Disconnect
          </button>
        ) : (
          <button
            onClick={connect}
            disabled={status.loading || gmail?.configured === false}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Plug size={15} /> Connect Gmail
          </button>
        )}
      </div>

      {status.loading ? (
        <div className="text-sm text-gray-400">Loading...</div>
      ) : gmail?.connected ? (
        <div className="grid gap-2 text-xs text-gray-500 sm:grid-cols-3">
          <div>
            <span className="block text-gray-400">Connected</span>
            {gmail.connectedAt ? formatDate(gmail.connectedAt) : "-"}
          </div>
          <div>
            <span className="block text-gray-400">Last Sync</span>
            {gmail.lastSyncedAt ? formatDate(gmail.lastSyncedAt) : "Not synced yet"}
          </div>
          <div>
            <span className="block text-gray-400">Scope</span>
            <span className="line-clamp-1">{gmail.scope || "-"}</span>
          </div>
          <div className="sm:col-span-3">
            Gmail updates Last Contacted when an attached thread is synced from an
            influencer record.
          </div>
        </div>
      ) : gmail?.configured === false ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Gmail environment variables are missing.
        </div>
      ) : (
        <div className="text-sm text-gray-400">Connect before syncing threads.</div>
      )}

      {error || status.error ? (
        <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error || status.error}
        </div>
      ) : null}
    </div>
  );
}
