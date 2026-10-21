"use client";

import { useState } from "react";
import { Plus, Shield, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useApi } from "@/lib/useApi";

type Role = "Admin" | "Editor";

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  Editor: "Can manage campaigns, creators, collections, and video metrics.",
  Admin: "Can manage campaigns, creators, collections, video metrics, team access, and integrations.",
};

interface TeamResponse {
  data: {
    users: {
      id: string;
      email: string;
      name: string | null;
      role: Role;
      disabledAt: string | null;
      createdAt: string;
    }[];
    invites: {
      id: string;
      email: string;
      role: Role;
      status: string;
      createdAt: string;
    }[];
  };
}

export function TeamSettings() {
  const team = useApi<TeamResponse>("/api/team");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Editor");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function invite() {
    if (!email.trim()) return;
    setBusy("invite");
    setError(null);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to add teammate");
      setEmail("");
      setRole("Editor");
      team.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add teammate");
    } finally {
      setBusy(null);
    }
  }

  async function updateUser(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/team/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to update user");
      team.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setBusy(null);
    }
  }

  async function revokeInvite(id: string) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/team/invites/${id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to revoke invite");
      team.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke invite");
    } finally {
      setBusy(null);
    }
  }

  if (team.error) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-white p-5 text-sm text-gray-500">
        Admin access is required.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <UserPlus size={16} className="text-brand-600" />
          <h2 className="text-sm font-semibold">Add teammate</h2>
        </div>
        <p className="mb-3 text-xs leading-5 text-gray-500">
          {ROLE_DESCRIPTIONS.Editor} {ROLE_DESCRIPTIONS.Admin}
        </p>
        <div className="grid items-end gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Email
            </span>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@company.com"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-500">
              Role
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
            >
              <option value="Editor">Editor</option>
              <option value="Admin">Admin</option>
            </select>
          </label>
          <button
            onClick={invite}
            disabled={busy === "invite" || !email.trim()}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus size={15} /> Add
          </button>
        </div>
        {error ? (
          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Shield size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold">Team members</h2>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {team.loading ? (
            <div className="p-4 text-sm text-gray-400">Loading...</div>
          ) : (
            team.data?.data.users.map((user) => (
              <div key={user.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">
                    {user.name || user.email}
                  </div>
                  <div className="truncate text-xs text-gray-400">{user.email}</div>
                </div>
                <select
                  value={user.role}
                  onChange={(e) => updateUser(user.id, { role: e.target.value })}
                  disabled={busy === user.id}
                  title={ROLE_DESCRIPTIONS[user.role]}
                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
                >
                  <option value="Editor">Editor</option>
                  <option value="Admin">Admin</option>
                </select>
                <button
                  onClick={() => updateUser(user.id, { disabled: !user.disabledAt })}
                  disabled={busy === user.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  <UserMinus size={15} />
                  {user.disabledAt ? "Enable" : "Disable"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-semibold">
          Pending invites
        </div>
        <div className="divide-y divide-[var(--border)]">
          {team.data?.data.invites.length ? (
            team.data.data.invites.map((invite) => (
              <div key={invite.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">
                    {invite.email}
                  </div>
                  <div className="text-xs text-gray-400">{invite.role}</div>
                </div>
                <button
                  onClick={() => revokeInvite(invite.id)}
                  disabled={busy === invite.id}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-rose-600 disabled:opacity-50"
                  aria-label={`Revoke ${invite.email}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          ) : (
            <div className="px-4 py-6 text-sm text-gray-400">No pending invites.</div>
          )}
        </div>
      </div>
    </div>
  );
}
