"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, DollarSign, Trash2, X } from "lucide-react";
import type { Campaign, CampaignStage } from "@/components/CampaignContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const CAMPAIGN_STAGES: CampaignStage[] = [
  "Planning",
  "Outreach",
  "Live",
  "Complete",
];

interface CampaignEditorDialogProps {
  campaign: Campaign | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: string, patch: Partial<Campaign>) => Promise<Campaign>;
  onDelete?: (campaign: Campaign) => Promise<void>;
}

interface CampaignDraft {
  name: string;
  brand: string;
  stage: CampaignStage;
  budget: string;
  startsAt: string;
  endsAt: string;
  notes: string;
}

export function CampaignEditorDialog(props: CampaignEditorDialogProps) {
  if (!props.open || !props.campaign) return null;
  return <CampaignEditorForm key={props.campaign.id} {...props} campaign={props.campaign} />;
}

function CampaignEditorForm({
  campaign,
  onClose,
  onSave,
  onDelete,
}: Omit<CampaignEditorDialogProps, "open" | "campaign"> & { campaign: Campaign }) {
  const [draft, setDraft] = useState<CampaignDraft>(() =>
    campaignToDraft(campaign)
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || deleting || inFlight.current) return;

    const name = draft.name.trim();
    const brand = draft.brand.trim();
    if (!name) {
      setError("Campaign name is required.");
      return;
    }
    if (!brand) {
      setError("Brand is required.");
      return;
    }
    if (!draft.startsAt || !draft.endsAt) {
      setError("Start and end dates are required.");
      return;
    }

    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(campaign.id, {
        name,
        brand,
        stage: draft.stage,
        budget: Math.max(0, Number(draft.budget) || 0),
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        notes: draft.notes,
      });
      if (mounted.current) onClose();
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : "Failed to save campaign.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  async function deleteCampaign() {
    if (!onDelete || saving || deleting || inFlight.current) return;
    inFlight.current = true;
    setDeleting(true);
    setError(null);
    try {
      await onDelete(campaign);
      if (mounted.current) {
        setConfirmDeleteOpen(false);
        onClose();
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <form
        onSubmit={submit}
        aria-busy={saving || deleting}
        className="w-full max-w-xl rounded-xl border border-(--border) bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-(--border) px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Edit campaign</h2>
            <p className="text-xs text-gray-400">{campaign.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || deleting}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close campaign editor"
          >
            <X size={16} />
          </button>
        </div>

        <fieldset disabled={saving || deleting} className="grid gap-3 px-4 py-4 sm:grid-cols-2">
          <label className="block text-xs font-medium text-gray-500">
            Campaign name
            <input
              autoFocus
              value={draft.name}
              onChange={(e) =>
                setDraft((current) => ({ ...current, name: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-(--border) px-3 py-2 text-sm font-medium text-gray-900 outline-hidden focus:border-brand-400"
            />
          </label>
          <label className="block text-xs font-medium text-gray-500">
            Brand
            <input
              value={draft.brand}
              onChange={(e) =>
                setDraft((current) => ({ ...current, brand: e.target.value }))
              }
              className="mt-1 w-full rounded-lg border border-(--border) px-3 py-2 text-sm font-medium text-gray-900 outline-hidden focus:border-brand-400"
            />
          </label>
          <label className="block text-xs font-medium text-gray-500">
            Stage
            <select
              value={draft.stage}
              onChange={(e) =>
                setDraft((current) => ({
                  ...current,
                  stage: e.target.value as CampaignStage,
                }))
              }
              className="mt-1 w-full rounded-lg border border-(--border) bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-hidden focus:border-brand-400"
            >
              {CAMPAIGN_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium text-gray-500">
            Budget
            <div className="relative mt-1">
              <DollarSign
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
              />
              <input
                type="number"
                min="0"
                value={draft.budget}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    budget: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-(--border) py-2 pl-8 pr-3 text-sm font-medium text-gray-900 outline-hidden focus:border-brand-400"
              />
            </div>
          </label>
          <label className="block text-xs font-medium text-gray-500">
            Start date
            <div className="relative mt-1">
              <CalendarDays
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
              />
              <input
                type="date"
                value={draft.startsAt}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    startsAt: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-(--border) py-2 pl-8 pr-3 text-sm font-medium text-gray-900 outline-hidden focus:border-brand-400"
              />
            </div>
          </label>
          <label className="block text-xs font-medium text-gray-500">
            End date
            <div className="relative mt-1">
              <CalendarDays
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-300"
              />
              <input
                type="date"
                value={draft.endsAt}
                onChange={(e) =>
                  setDraft((current) => ({ ...current, endsAt: e.target.value }))
                }
                className="w-full rounded-lg border border-(--border) py-2 pl-8 pr-3 text-sm font-medium text-gray-900 outline-hidden focus:border-brand-400"
              />
            </div>
          </label>
          <label className="block text-xs font-medium text-gray-500 sm:col-span-2">
            Notes
            <textarea
              value={draft.notes}
              onChange={(e) =>
                setDraft((current) => ({ ...current, notes: e.target.value }))
              }
              rows={4}
              className="mt-1 w-full resize-none rounded-lg border border-(--border) px-3 py-2 text-sm text-gray-900 outline-hidden focus:border-brand-400"
            />
          </label>
        </fieldset>

        {error ? (
          <div role="alert" className="mx-4 mb-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--border) px-4 py-3">
          {onDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={saving || deleting}
              className="flex items-center gap-1.5 rounded-lg border border-rose-100 bg-white px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 size={15} />
              {deleting ? "Deleting..." : "Delete"}
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className="rounded-lg border border-(--border) bg-white px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || deleting}
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete campaign?"
        message={`Delete ${campaign.name}? This removes it from the active Campaigns list.`}
        confirmLabel="Delete campaign"
        danger
        busy={deleting}
        onConfirm={deleteCampaign}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}

function campaignToDraft(campaign: Campaign | null): CampaignDraft {
  return {
    name: campaign?.name ?? "",
    brand: campaign?.brand ?? "",
    stage: campaign?.stage ?? "Planning",
    budget: String(campaign?.budget ?? 0),
    startsAt: campaign?.startsAt ?? "",
    endsAt: campaign?.endsAt ?? "",
    notes: campaign?.notes ?? "",
  };
}
