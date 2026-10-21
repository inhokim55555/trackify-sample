"use client";

import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { PlatformIcon } from "@/components/ui";
import type { Platform } from "@/lib/constants";

interface MemberAccount {
  id: string;
  handle: string;
  platform: Platform;
  displayName: string;
}

interface AllAccountRow {
  id: string;
  handle: string;
  platform: Platform;
}

export function CollectionManager({
  collectionId,
  collectionName,
  onClose,
  onChanged,
}: {
  collectionId: string;
  collectionName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const members = useApi<{ data: { accounts: MemberAccount[] } }>(
    `/api/collections/${collectionId}/items`
  );
  const all = useApi<{ data: AllAccountRow[] }>(`/api/accounts?range=30d`);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const memberIds = useMemo(
    () => new Set((members.data?.data.accounts ?? []).map((a) => a.id)),
    [members.data]
  );

  const addable = useMemo(() => {
    const rows = all.data?.data ?? [];
    const q = search.toLowerCase();
    return rows.filter(
      (a) => !memberIds.has(a.id) && (!q || a.handle.toLowerCase().includes(q))
    );
  }, [all.data, memberIds, search]);

  async function mutate(method: "POST" | "DELETE", accountId: string) {
    setBusyId(accountId);
    try {
      await fetch(`/api/collections/${collectionId}/items`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      members.reload();
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  const memberAccounts = members.data?.data.accounts ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-(--border) px-5 py-3">
          <h3 className="text-base font-semibold">
            Manage creators -{" "}
            <span className="text-brand-700">{collectionName}</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scroll-thin p-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            In this creator group ({memberAccounts.length})
          </div>
          {members.loading ? (
            <div className="skeleton mb-4 h-16 w-full" />
          ) : memberAccounts.length === 0 ? (
            <p className="mb-4 text-sm text-gray-400">
              No creators yet. Add some below.
            </p>
          ) : (
            <div className="mb-5 space-y-1">
              {memberAccounts.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg border border-(--border) px-3 py-2"
                >
                  <PlatformIcon platform={a.platform} size={18} />
                  <span className="text-sm font-medium">@{a.handle}</span>
                  <button
                    onClick={() => mutate("DELETE", a.id)}
                    disabled={busyId === a.id}
                    className="ml-auto rounded-md px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Add creators
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search creators..."
            className="mb-2 w-full rounded-lg border border-(--border) px-3 py-2 text-sm outline-hidden focus:border-brand-400"
          />
          {all.loading ? (
            <div className="skeleton h-24 w-full" />
          ) : addable.length === 0 ? (
            <p className="text-sm text-gray-400">No more creators to add.</p>
          ) : (
            <div className="space-y-1">
              {addable.slice(0, 50).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-gray-50"
                >
                  <PlatformIcon platform={a.platform} size={18} />
                  <span className="text-sm">@{a.handle}</span>
                  <button
                    onClick={() => mutate("POST", a.id)}
                    disabled={busyId === a.id}
                    className="ml-auto flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                  >
                    {busyId === a.id ? <Check size={13} /> : <Plus size={13} />}
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-(--border) px-5 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
