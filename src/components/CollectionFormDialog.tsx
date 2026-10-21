"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { COLLECTION_TYPES } from "@/lib/constants";

export interface CollectionFormResult {
  id: string;
  name: string;
  parentId: string | null;
  type: string;
}

export type CollectionFormMode =
  | { type: "create-root" }
  | { type: "create-child"; parentId: string; parentName: string }
  | { type: "rename"; id: string; name: string };

interface CollectionFormDialogProps {
  mode: CollectionFormMode | null;
  onClose: () => void;
  onDone: (collection: CollectionFormResult) => void;
}

export function CollectionFormDialog(props: CollectionFormDialogProps) {
  if (!props.mode) return null;
  return <CollectionForm key={JSON.stringify(props.mode)} {...props} mode={props.mode} />;
}

function CollectionForm({ mode, onClose, onDone }: Omit<CollectionFormDialogProps, "mode"> & { mode: CollectionFormMode }) {
  const [name, setName] = useState(() => mode.type === "rename" ? mode.name : "");
  const [type, setType] = useState<string>(() => mode.type === "create-child" ? "paid" : "brand");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const title =
    mode.type === "rename"
      ? "Rename collection"
      : mode.type === "create-child"
        ? `New sub-collection in "${mode.parentName}"`
        : "New collection";

  async function submit() {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      let res: Response;
      if (mode.type === "rename") {
        res = await fetch(`/api/collections/${mode.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
      } else {
        res = await fetch(`/api/collections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            type,
            parentId: mode.type === "create-child" ? mode.parentId : null,
          }),
        });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      if (!mounted.current) return;
      onDone(json.data as CollectionFormResult);
      onClose();
    } catch (e: unknown) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. Lumen Grove"
          className="mb-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-brand-400"
        />

        {mode.type !== "rename" && (
          <>
            <label className="mb-1 block text-xs font-medium text-gray-500">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mb-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm capitalize outline-none focus:border-brand-400"
            >
              {COLLECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </>
        )}

        {error && (
          <p className="mb-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {error}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !name.trim()}
            className="rounded-full bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
