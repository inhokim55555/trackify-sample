"use client";

import { useConfirmedAction } from "@/lib/use-confirmed-action";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Briefcase,
  CalendarDays,
  ChevronRight,
  DollarSign,
  Gift,
  Hash,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { CampaignEditorDialog } from "@/components/CampaignEditorDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  useCampaigns,
  type Campaign,
  type CampaignSegment,
  type CampaignSubcategory,
  type CampaignStage,
  type CampaignTrackerKind,
} from "@/components/CampaignContext";
import type { CollectionNode } from "@/app/api/collections/route";

const STAGE_STYLES: Record<CampaignStage, string> = {
  Planning: "bg-gray-100 text-gray-600",
  Outreach: "bg-sky-50 text-sky-700",
  Live: "bg-emerald-50 text-emerald-700",
  Complete: "bg-violet-50 text-violet-700",
};

export function CampaignList() {
  const {
    campaigns,
    campaignsLoading,
    campaignsError,
    selectedCampaignId,
    selectedCampaignSegment,
    selectCampaign,
    createCampaign,
    updateCampaign,
    archiveCampaign,
    addCampaignSubcategory,
    updateCampaignSegmentCollection,
  } = useCampaigns();
  const [openCampaigns, setOpenCampaigns] = useState<{ source: Campaign[]; ids: string[] }>(() => ({
    source: campaigns,
    ids: campaigns[0]?.id ? [campaigns[0].id] : [],
  }));
  const openIds = openCampaigns.ids;
  // Preserve the existing default expansion when a new campaign list arrives,
  // without a post-render update or interfering with clicks on the current list.
  if (openCampaigns.source !== campaigns) {
    setOpenCampaigns({ source: campaigns,
      ids: openIds.length > 0 || !campaigns[0]?.id ? openIds : [campaigns[0].id] });
  }
  function setOpenIds(update: (current: string[]) => string[]) {
    setOpenCampaigns((current) => ({ ...current, ids: update(current.ids) }));
  }
  const [addingForId, setAddingForId] = useState<string | null>(null);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [campaignDraft, setCampaignDraft] = useState({
    name: "",
    brand: "",
    startsAt: todayIso(),
    endsAt: addDaysIso(todayIso(), 30),
  });
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [collectionNodes, setCollectionNodes] = useState<CollectionNode[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [collectionsError, setCollectionsError] = useState(false);
  const [collectionsAttempt, setCollectionsAttempt] = useState(0);
  const selectionRevision = useRef(0);
  const subcategorySelectionRevision = useRef(0);
  const mounted = useRef(false);
  const createAction = useConfirmedAction();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const router = useRouter();
  const collectionOptions = useMemo(
    () => flattenCollections(collectionNodes),
    [collectionNodes]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/collections", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load collections");
        const payload = await res.json();
        if (!validCollectionNodes(payload?.data)) throw new Error("Invalid collection response");
        return payload as { data: CollectionNode[] };
      })
      .then((payload) => {
        if (!controller.signal.aborted) setCollectionNodes(payload.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCollectionsError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCollectionsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [collectionsAttempt]);

  function retryCollections() {
    if (collectionsLoading) return;
    setCollectionsError(false);
    setCollectionsLoading(true);
    setCollectionsAttempt((attempt) => attempt + 1);
  }

  function handleSelect(campaign: Campaign, segment: CampaignSegment = "all") {
    selectionRevision.current++;
    selectCampaign(campaign.id, segment);
    router.push("/campaigns");
  }

  function toggleOpen(id: string) {
    setOpenIds((current) =>
      current.includes(id)
        ? current.filter((openId) => openId !== id)
        : [...current, id]
    );
  }

  function startAdding(campaignId: string) { setAddingForId(campaignId); }
  function cancelAdding() { setAddingForId(null); }

  async function createSubcategory(campaign: Campaign, input: Omit<CampaignSubcategory, "id">) {
    subcategorySelectionRevision.current = selectionRevision.current;
    return addCampaignSubcategory(campaign.id, input);
  }

  function finishSubcategory(campaign: Campaign, saved: CampaignSubcategory) {
    cancelAdding();
    if (mounted.current && selectionRevision.current === subcategorySelectionRevision.current) {
      const reserved = saved.name.trim().toLowerCase();
      handleSelect(campaign, reserved === "paid" || reserved === "seeding" ? reserved : `custom:${saved.id}`);
    }
  }

  async function submitCampaign() {
    const name = campaignDraft.name.trim();
    const brand = campaignDraft.brand.trim();
    if (!name || !brand) {
      setCampaignError("Campaign name and brand are required.");
      return;
    }
    if (!campaignDraft.startsAt || !campaignDraft.endsAt) {
      setCampaignError("Start and end dates are required.");
      return;
    }
    if (campaignDraft.endsAt < campaignDraft.startsAt) {
      setCampaignError("End date must be after the start date.");
      return;
    }
    setCampaignError(null);
    const revision = selectionRevision.current;
    await createAction.run(() => createCampaign({
      name, brand, startsAt: campaignDraft.startsAt, endsAt: campaignDraft.endsAt,
      stage: "Planning", budget: 0, notes: "",
    }), (created) => {
      setOpenIds((current) => Array.from(new Set([...current, created.id])));
      setCreatingCampaign(false);
      setCampaignDraft({ name: "", brand: "", startsAt: todayIso(), endsAt: addDaysIso(todayIso(), 30) });
      if (selectionRevision.current === revision) handleSelect(created);
    });
  }

  async function deleteCampaign(campaign: Campaign) {
    setCampaignError(null);
    setDeletingCampaignId(campaign.id);
    try {
      await archiveCampaign(campaign.id);
      setActionMenuId(null);
      setOpenIds((current) => current.filter((id) => id !== campaign.id));
    } catch (err) {
      setCampaignError(
        err instanceof Error ? err.message : "Failed to delete campaign"
      );
      throw err;
    } finally {
      setDeletingCampaignId(null);
    }
  }

  async function deleteCampaignFromEditor(campaign: Campaign) {
    setCampaignError(null);
    setDeletingCampaignId(campaign.id);
    try {
      await archiveCampaign(campaign.id);
      setActionMenuId(null);
      setOpenIds((current) => current.filter((id) => id !== campaign.id));
    } catch (err) {
      setCampaignError(
        err instanceof Error ? err.message : "Failed to delete campaign"
      );
      throw err;
    } finally {
      setDeletingCampaignId(null);
    }
  }

  return (
    <div className="px-3 pb-2">
      {collectionsError ? (
        <div className="mb-2 rounded-md bg-rose-50 p-2 text-xs text-rose-700">
          <p role="alert">Could not load collection options. Your existing links are unchanged.</p>
          <button type="button" onClick={retryCollections} className="mt-1 underline">Retry loading collections</button>
        </div>
      ) : collectionsLoading ? <p role="status" className="mb-2 text-xs text-gray-500">Loading collection options...</p> : null}
      <button
        onClick={() => setCreatingCampaign((current) => !current)}
        disabled={createAction.busy}
        className="mb-2 flex w-full items-center gap-2 rounded-md border border-(--border) bg-white px-3 py-2 text-left text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        <Plus size={13} />
        <span>New campaign</span>
      </button>
      {creatingCampaign ? (
        <fieldset disabled={createAction.busy} className="mb-2 space-y-1.5 rounded-lg border border-(--border) bg-white p-2">
          <label className="block text-[11px] font-medium text-gray-500">
            Campaign name <span className="text-rose-500">*</span>
            <input
              autoFocus
              value={campaignDraft.name}
              onChange={(e) =>
                setCampaignDraft((current) => ({ ...current, name: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-(--border) px-2 py-1.5 text-xs outline-hidden focus:border-brand-400"
            />
          </label>
          <label className="block text-[11px] font-medium text-gray-500">
            Brand <span className="text-rose-500">*</span>
            <input
              value={campaignDraft.brand}
              onChange={(e) =>
                setCampaignDraft((current) => ({ ...current, brand: e.target.value }))
              }
              className="mt-1 w-full rounded-md border border-(--border) px-2 py-1.5 text-xs outline-hidden focus:border-brand-400"
            />
          </label>
          <div className="grid grid-cols-2 gap-1">
            <label className="block text-[11px] font-medium text-gray-500">
              Start <span className="text-rose-500">*</span>
              <input
                type="date"
                value={campaignDraft.startsAt}
                onChange={(e) =>
                  setCampaignDraft((current) => ({
                    ...current,
                    startsAt: e.target.value,
                  }))
                }
                className="mt-1 min-w-0 rounded-md border border-(--border) px-2 py-1.5 text-xs outline-hidden focus:border-brand-400"
              />
            </label>
            <label className="block text-[11px] font-medium text-gray-500">
              End <span className="text-rose-500">*</span>
              <input
                type="date"
                value={campaignDraft.endsAt}
                onChange={(e) =>
                  setCampaignDraft((current) => ({ ...current, endsAt: e.target.value }))
                }
                className="mt-1 min-w-0 rounded-md border border-(--border) px-2 py-1.5 text-xs outline-hidden focus:border-brand-400"
              />
            </label>
          </div>
          {campaignError ? (
            <div className="rounded-sm bg-rose-50 px-2 py-1 text-[11px] text-rose-600">
              {campaignError}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setCreatingCampaign(false)}
              className="rounded-md border border-(--border) px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={submitCampaign}
              disabled={!campaignDraft.name.trim() || !campaignDraft.brand.trim()}
              className="rounded-md bg-brand-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {createAction.busy ? "Saving..." : "Create"}
            </button>
          </div>
          {createAction.error ? <p role="alert" className="text-xs text-rose-700">{createAction.error} Retry with Create.</p> : null}
        </fieldset>
      ) : null}
      {campaignsLoading ? (
        <div className="space-y-2 rounded-lg border border-dashed border-(--border) p-3">
          <div className="text-xs font-medium text-gray-500">
            Loading campaigns...
          </div>
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      ) : campaignsError ? (
        <div className="rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-600">
          Campaigns could not load. Refresh to try again.
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-(--border) p-3 text-xs text-gray-400">
          No campaigns configured.
        </div>
      ) : (
        <div className="space-y-1.5">
          {campaigns.map((campaign) => {
            const open = openIds.includes(campaign.id);
            const selected =
              campaign.id === selectedCampaignId &&
              selectedCampaignSegment === "all";
            return (
              <div
                key={campaign.id}
                className={`rounded-lg border bg-white transition ${
                  selected
                    ? "border-brand-200 bg-brand-50"
                    : "border-(--border)"
                }`}
              >
                <div className="flex items-start gap-1 px-2 py-2">
                  <button
                    onClick={() => toggleOpen(campaign.id)}
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-100"
                    aria-label={open ? "Collapse campaign" : "Expand campaign"}
                  >
                    <ChevronRight
                      size={14}
                      className={`transition-transform ${open ? "rotate-90" : ""}`}
                    />
                  </button>
                  <button
                    onClick={() => handleSelect(campaign)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Briefcase
                        size={14}
                        className={selected ? "text-brand-700" : "text-gray-400"}
                      />
                      <span
                        className={`min-w-0 flex-1 truncate text-xs font-semibold ${
                          selected ? "text-brand-800" : "text-gray-700"
                        }`}
                      >
                        {campaign.name}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] text-gray-400">
                        {campaign.brand}
                      </span>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STAGE_STYLES[campaign.stage]}`}
                      >
                        {campaign.stage}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                      <CalendarDays size={11} />
                      <span className="truncate">
                        {campaign.startsAt} to {campaign.endsAt}
                      </span>
                    </div>
                  </button>
                  <div className="relative">
                    <button
                      onClick={() =>
                        setActionMenuId((current) =>
                          current === campaign.id ? null : campaign.id
                        )
                      }
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      aria-label={`Campaign actions for ${campaign.name}`}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {actionMenuId === campaign.id ? (
                      <div className="absolute right-0 top-6 z-20 w-36 rounded-lg border border-(--border) bg-white p-1 shadow-lg">
                        <button
                          onClick={() => {
                            setEditingCampaign(campaign);
                            setActionMenuId(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => setDeleteTarget(campaign)}
                          disabled={deletingCampaignId === campaign.id}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                          <span>
                            {deletingCampaignId === campaign.id
                              ? "Deleting..."
                              : "Delete"}
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                {open ? (
                  <div className="border-t border-(--border) px-2 pb-2 pt-1.5">
                    <CampaignSegmentRow
                      campaign={campaign}
                      segment="seeding"
                      label="Seeding"
                      selectedCampaignId={selectedCampaignId}
                      selectedSegment={selectedCampaignSegment}
                      onSelect={handleSelect}
                    />
                    {isSelectedSegment(
                      campaign,
                      "seeding",
                      selectedCampaignId,
                      selectedCampaignSegment
                    ) ? (
                      <SegmentCollectionSelect
                        value={campaign.segmentCollections?.seeding ?? null}
                        options={collectionOptions}
                        loading={collectionsLoading} unavailable={collectionsError}
                        key={`${campaign.id}:seeding`}
                        onChange={(collectionId) =>
                          updateCampaignSegmentCollection(campaign.id, "seeding", collectionId)
                        }
                      />
                    ) : null}
                    <CampaignSegmentRow
                      campaign={campaign}
                      segment="paid"
                      label="Paid"
                      trackerKind="paid"
                      selectedCampaignId={selectedCampaignId}
                      selectedSegment={selectedCampaignSegment}
                      onSelect={handleSelect}
                    />
                    {isSelectedSegment(
                      campaign,
                      "paid",
                      selectedCampaignId,
                      selectedCampaignSegment
                    ) ? (
                      <SegmentCollectionSelect
                        value={campaign.segmentCollections?.paid ?? null}
                        options={collectionOptions}
                        loading={collectionsLoading} unavailable={collectionsError}
                        key={`${campaign.id}:paid`}
                        onChange={(collectionId) =>
                          updateCampaignSegmentCollection(campaign.id, "paid", collectionId)
                        }
                      />
                    ) : null}
                    {campaign.subcategories.map((subcategory) => (
                      <div key={subcategory.id}>
                        <CampaignSegmentRow
                          campaign={campaign}
                          segment={`custom:${subcategory.id}`}
                          label={subcategory.name}
                          trackerKind={subcategory.trackerKind}
                          selectedCampaignId={selectedCampaignId}
                          selectedSegment={selectedCampaignSegment}
                          onSelect={handleSelect}
                        />
                        {isSelectedSegment(
                          campaign,
                          `custom:${subcategory.id}`,
                          selectedCampaignId,
                          selectedCampaignSegment
                        ) ? (
                          <SegmentCollectionSelect
                            value={subcategory.collectionId ?? null}
                            options={collectionOptions}
                            loading={collectionsLoading} unavailable={collectionsError}
                            key={`${campaign.id}:custom:${subcategory.id}`}
                            onChange={(collectionId) =>
                              updateCampaignSegmentCollection(
                                campaign.id,
                                `custom:${subcategory.id}`,
                                collectionId
                              )
                            }
                          />
                        ) : null}
                      </div>
                    ))}
                    {addingForId === campaign.id ? (
                      <CampaignSubcategoryForm key={campaign.id}
                        onSave={(input) => createSubcategory(campaign, input)}
                        onSaved={(saved) => finishSubcategory(campaign, saved)} onCancel={cancelAdding} />
                    ) : (
                      <button
                        onClick={() => startAdding(campaign.id)}
                        className="mt-1 flex w-full items-center gap-2 rounded-md px-8 py-1.5 text-left text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                      >
                        <Plus size={13} />
                        <span>New subcategory</span>
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <CampaignEditorDialog
        campaign={editingCampaign}
        open={Boolean(editingCampaign)}
        onClose={() => setEditingCampaign(null)}
        onSave={updateCampaign}
        onDelete={deleteCampaignFromEditor}
      />
      <ConfirmDialog
        key={deleteTarget?.id ?? "no-campaign-delete"}
        open={!!deleteTarget}
        title="Delete campaign?"
        message={`Delete ${deleteTarget?.name ?? "this campaign"}? This removes it from the active Campaigns list.`}
        confirmLabel="Delete campaign"
        danger
        busy={!!deletingCampaignId}
        onConfirm={async () => {
          if (deleteTarget) await deleteCampaign(deleteTarget);
          setDeleteTarget((current) => current?.id === deleteTarget?.id ? null : current);
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function CampaignSegmentRow({
  campaign,
  segment,
  label,
  trackerKind,
  selectedCampaignId,
  selectedSegment,
  onSelect,
}: {
  campaign: Campaign;
  segment: Exclude<CampaignSegment, "all">;
  label: string;
  trackerKind?: CampaignTrackerKind;
  selectedCampaignId: string | null;
  selectedSegment: CampaignSegment;
  onSelect: (campaign: Campaign, segment: CampaignSegment) => void;
}) {
  const selected = selectedCampaignId === campaign.id && selectedSegment === segment;
  const Icon = segment === "seeding" ? Gift : segment === "paid" ? DollarSign : Hash;

  return (
    <button
      onClick={() => onSelect(campaign, segment)}
      className={`mt-1 flex w-full items-center gap-2 rounded-md px-8 py-1.5 text-left text-xs ${
        selected
          ? "bg-brand-50 font-semibold text-brand-700"
          : "text-gray-500 hover:bg-gray-50"
      }`}
    >
      <Icon size={13} className={selected ? "text-brand-600" : "text-gray-300"} />
      <span>{label}</span>
      {segment.startsWith("custom:") ? (
        <span className="ml-auto rounded-sm bg-gray-100 px-1.5 py-0.5 text-[9px] uppercase text-gray-400">
          {trackerKind ?? "seeding"}
        </span>
      ) : null}
    </button>
  );
}

interface CollectionOption {
  id: string;
  label: string;
}

export function SegmentCollectionSelect({ value, options, loading, unavailable = false, onChange }: {
  value: string | null;
  options: CollectionOption[];
  loading: boolean;
  unavailable?: boolean;
  onChange: (collectionId: string | null) => Promise<void>;
}) {
  const action = useConfirmedAction();
  const [draft, setDraft] = useState<string | null | undefined>(undefined);
  const selected = (draft === undefined ? value : draft) ?? "";
  function save(next: string | null) {
    setDraft(next);
    void action.run(() => onChange(next), () => setDraft(undefined));
  }
  return <div className="px-8 pb-1">
    <div className="flex items-center gap-1.5 rounded-md border border-(--border) bg-white px-2 py-1 text-[11px] text-gray-500">
      <Link2 size={12} className="shrink-0 text-gray-300" />
      <select aria-label="Linked collection" value={selected}
        disabled={loading || unavailable || action.busy} onChange={(event) => save(event.target.value || null)}
        className="min-w-0 flex-1 bg-transparent text-[11px] text-gray-600 outline-hidden disabled:opacity-60">
        <option value="">{loading ? "Loading collections..." : unavailable ? "Collections unavailable" : "No linked collection"}</option>
        {selected && !options.some((option) => option.id === selected) ? <option value={selected} disabled>Current linked collection (details unavailable)</option> : null}
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </div>
    {action.busy ? <p role="status" className="text-[11px] text-gray-500">Saving link...</p> : null}
    {action.error ? <div className="text-[11px] text-rose-700">
      <p role="alert">{action.error}</p>
      <button type="button" onClick={() => save(draft ?? null)} disabled={action.busy} className="mr-2 underline">Retry link</button>
      <button type="button" onClick={() => { setDraft(undefined); action.clearError(); }} className="underline">Discard change</button>
    </div> : null}
  </div>;
}

export function CampaignSubcategoryForm({ onSave, onSaved, onCancel }: {
  onSave: (input: Omit<CampaignSubcategory, "id">) => Promise<CampaignSubcategory>;
  onSaved: (saved: CampaignSubcategory) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CampaignTrackerKind>("seeding");
  const action = useConfirmedAction();
  function submit() {
    if (!name.trim()) return;
    void action.run(() => onSave({ name: name.trim(), trackerKind: kind }), onSaved);
  }
  return <form className="mt-1 space-y-1 px-8" onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <fieldset disabled={action.busy} className="space-y-1">
      <input autoFocus aria-label="Subcategory name" value={name} onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape" && !action.busy) onCancel(); }} placeholder="Subcategory"
        className="w-full rounded-md border border-(--border) px-2 py-1 text-xs outline-hidden focus:border-brand-400" />
      <select aria-label="Subcategory format" value={kind} onChange={(event) => setKind(event.target.value as CampaignTrackerKind)}
        className="w-full rounded-md border border-(--border) bg-white px-2 py-1 text-xs">
        <option value="seeding">Seeding format</option><option value="paid">Paid format</option>
      </select>
      <div className="flex gap-2 text-xs">
        <button type="submit" disabled={!name.trim()} className="rounded-md bg-brand-600 px-2 py-1 font-medium text-white disabled:opacity-50">{action.busy ? "Saving..." : action.error ? "Retry add" : "Add"}</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </fieldset>
    {action.busy ? <p role="status" className="text-xs text-gray-500">Saving subcategory...</p> : null}
    {action.error ? <p role="alert" className="text-xs text-rose-700">{action.error}</p> : null}
  </form>;
}

function isSelectedSegment(
  campaign: Campaign,
  segment: Exclude<CampaignSegment, "all">,
  selectedCampaignId: string | null,
  selectedSegment: CampaignSegment
) {
  return selectedCampaignId === campaign.id && selectedSegment === segment;
}

function flattenCollections(
  nodes: CollectionNode[],
  depth = 0
): CollectionOption[] {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      label: `${"  ".repeat(depth)}${node.name}`,
    },
    ...flattenCollections(node.children, depth + 1),
  ]);
}

function validCollectionNodes(value: unknown): value is CollectionNode[] {
  return Array.isArray(value) && value.every((node) => node && typeof node.id === "string"
    && typeof node.name === "string" && validCollectionNodes(node.children));
}
