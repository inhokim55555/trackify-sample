"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type Campaign,
  type CampaignSegment,
  type CampaignSubcategory,
  type CampaignTrackerKind,
} from "@/lib/campaign-defaults";
import { createBrowserPreference, useBrowserPreference } from "@/lib/browser-preference";
import { CampaignMutationQueue, mergeConfirmedSubcategory } from "@/lib/campaign-mutations";
import { RequestGate } from "@/lib/request-state";
import { saveSession } from "@/lib/save-session";
import { SaveSessionChangedError } from "@/lib/record-save-queue";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type {
  Campaign,
  CampaignSegment,
  CampaignStage,
  CampaignSubcategory,
  CampaignTrackerKind,
} from "@/lib/campaign-defaults";

interface CampaignContextValue {
  campaigns: Campaign[];
  campaignsLoading: boolean;
  campaignsError: string | null;
  reloadCampaigns: () => void;
  selectedCampaignId: string | null;
  selectedCampaign: Campaign | null;
  selectedCampaignSegment: CampaignSegment;
  setSelectedCampaignId: (id: string) => void;
  setSelectedCampaignSegment: (segment: CampaignSegment) => void;
  selectCampaign: (id: string, segment?: CampaignSegment) => void;
  setCampaigns: (campaigns: Campaign[]) => void;
  createCampaign: (input: Partial<Campaign> & { name: string }) => Promise<Campaign>;
  updateCampaign: (id: string, patch: Partial<Campaign>) => Promise<Campaign>;
  archiveCampaign: (id: string) => Promise<void>;
  duplicateCampaign: (id: string) => Promise<Campaign>;
  addCampaignSubcategory: (
    campaignId: string,
    subcategory: Omit<CampaignSubcategory, "id"> & { id?: string }
  ) => Promise<CampaignSubcategory>;
  updateCampaignSegmentCollection: (
    campaignId: string,
    segment: Exclude<CampaignSegment, "all">,
    collectionId: string | null
  ) => Promise<void>;
}

const SELECTED_STORAGE_KEY = "shortimize-selected-campaign-id-v1";
const SELECTED_SEGMENT_STORAGE_KEY = "shortimize-selected-campaign-segment-v1";
const campaignSelection = createBrowserPreference<string | null>(
  SELECTED_STORAGE_KEY, null, (value) => value || null, (value) => value ?? ""
);
const campaignSegment = createBrowserPreference<CampaignSegment>(
  SELECTED_SEGMENT_STORAGE_KEY, "all",
  (value) => isCampaignSegment(value) ? value : "all", (value) => value
);

const CampaignCtx = createContext<CampaignContextValue | null>(null);
const mutations = new CampaignMutationQueue(() => saveSession.snapshot().owner);
const confirmedCampaigns = new Map<string, Campaign>();
saveSession.subscribe(() => { mutations.reset(); confirmedCampaigns.clear(); });
class ProviderLifetime {
  mounted = false;
  constructor(readonly owner: ReturnType<typeof saveSession.snapshot>["owner"]) {}
  mount() { this.mounted = true; }
  unmount() { this.mounted = false; }
}

export function CampaignProvider({ children }: { children: ReactNode }) {
  const [campaigns, setCampaignsState] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [reads] = useState(() => new RequestGate());
  const [lifetime] = useState(() => new ProviderLifetime(saveSession.snapshot().owner));
  const [selectedCampaignId, setSelectedCampaignIdState] = useBrowserPreference(campaignSelection);
  const [selectedCampaignSegment, setSelectedCampaignSegmentState] = useBrowserPreference(campaignSegment);

  useEffect(() => {
    lifetime.mount();
    const unsubscribe = mutations.subscribe((origin) => {
      if (origin !== lifetime && lifetime.owner === saveSession.snapshot().owner) {
        reads.cancel();
        setReloadNonce((current) => current + 1);
      }
    });
    return () => { lifetime.unmount(); reads.cancel(); unsubscribe(); };
  }, [lifetime, reads]);

  const requestMutation = useCallback(<T,>(key: string, url: string, method: string, body: unknown,
    parse: (data: unknown, sent: unknown) => T, apply: (saved: T) => void): Promise<T> => {
    reads.cancel();
    return mutations.run(key, lifetime.owner, lifetime, async (signal, assertCurrent) => {
      const { data: sessionData, error } = await createSupabaseBrowserClient().auth.getSession();
      // An obsolete request must never reconcile or clear a newer user's session.
      assertCurrent();
      if (error || sessionData.session?.user.id !== lifetime.owner?.userId) {
        saveSession.setUser(error ? null : sessionData.session?.user.id ?? null);
        throw new SaveSessionChangedError();
      }
      const sent = typeof body === "function" ? body() : body;
      const response = await fetch(url, { method, signal,
        headers: { "Content-Type": "application/json" },
        ...(sent === undefined ? {} : { body: JSON.stringify(sent) }) });
      const payload = await response.json().catch(() => null);
      assertCurrent();
      if (!response.ok) throw new Error(payload?.error || "Campaign change could not be saved. Please retry.");
      const saved = parse(payload?.data, sent);
      if (lifetime.mounted) {
        reads.cancel();
        apply(saved);
      }
      return saved;
    }).finally(() => {
      // Restore any list read cancelled by this write, including a failed initial create.
      if (lifetime.mounted && lifetime.owner === saveSession.snapshot().owner) {
        reads.cancel();
        setReloadNonce((current) => current + 1);
      }
    });
  }, [lifetime, reads]);

  useEffect(() => {
    const controller = reads.begin();
    const owner = saveSession.snapshot().owner;
    const current = () => reads.isCurrent(controller) && owner === saveSession.snapshot().owner;

    fetch("/api/campaigns", { signal: controller.signal })
      .then(async (res) => {
        if (!current()) return null;
        if (res.status === 401) {
          // Expired authentication must discard the current authenticated page state.
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.href = `/login?next=${encodeURIComponent(
            window.location.pathname
          )}`;
          return null;
        }
        if (!res.ok) throw new Error("Failed to load campaigns");
        return (await res.json()) as { data: Campaign[] };
      })
      .then((payload) => {
        if (current()) {
          const nextCampaigns = (payload?.data ?? []).map(normalizeCampaign);
          nextCampaigns.forEach((campaign) => { if (!mutations.isPending(campaign.id)) confirmedCampaigns.set(campaign.id, campaign); });
          const storedId = campaignSelection.getSnapshot();
          if (!nextCampaigns.some((campaign) => campaign.id === storedId)) {
            campaignSelection.set(nextCampaigns[0]?.id ?? null);
          }
          setCampaignsState(nextCampaigns);
        }
      })
      .catch((err) => {
        if (current()) {
          setCampaignsError(
            err instanceof Error ? err.message : "Failed to load campaigns"
          );
        }
        if (current()) console.error("Failed to load campaigns", err);
      })
      .finally(() => {
        if (current()) setCampaignsLoading(false);
      });

    return () => {
      reads.cancel(controller);
    };
  }, [reloadNonce, reads]);

  const selectedCampaign =
    campaigns.find((campaign) => campaign.id === selectedCampaignId) ??
    campaigns[0] ??
    null;

  const value = useMemo<CampaignContextValue>(
    () => ({
      campaigns,
      campaignsLoading,
      campaignsError,
      reloadCampaigns: () => {
        reads.cancel();
        setCampaignsLoading(true);
        setCampaignsError(null);
        setReloadNonce((current) => current + 1);
      },
      selectedCampaignId: selectedCampaign?.id ?? null,
      selectedCampaign,
      selectedCampaignSegment,
      setSelectedCampaignId: (id) => {
        setSelectedCampaignIdState(id);
        setSelectedCampaignSegmentState("all");
      },
      setSelectedCampaignSegment: setSelectedCampaignSegmentState,
      selectCampaign: (id, segment = "all") => {
        setSelectedCampaignIdState(id);
        setSelectedCampaignSegmentState(segment);
      },
      setCampaigns: (nextCampaigns) => {
        if (!nextCampaigns.some((campaign) => campaign.id === selectedCampaignId)) {
          setSelectedCampaignIdState(nextCampaigns[0]?.id ?? null);
        }
        setCampaignsState(nextCampaigns);
      },
      createCampaign: (input) => {
        const selection = campaignSelection.getSnapshot();
        return requestMutation("create", "/api/campaigns", "POST", input, rememberCampaign, (campaign) => {
          setCampaignsState((current) => [...current.filter((item) => item.id !== campaign.id), campaign]);
          if (campaignSelection.getSnapshot() === selection) {
            setSelectedCampaignIdState(campaign.id);
            setSelectedCampaignSegmentState("all");
          }
        });
      },
      updateCampaign: (id, patch) => requestMutation(id, `/api/campaigns/${id}`, "PATCH", patch,
        (data) => {
          const saved = parseCampaign(data);
          if (saved.id !== id) throw new Error("The server returned a different campaign. Please reload and retry.");
          confirmedCampaigns.set(id, saved);
          return saved;
        }, (saved) => setCampaignsState((current) => current.map((campaign) => campaign.id === id ? saved : campaign))),
      archiveCampaign: (id) => requestMutation(id, `/api/campaigns/${id}`, "DELETE", undefined, () => { confirmedCampaigns.delete(id); return undefined; }, () => {
        setCampaignsState((current) => current.filter((campaign) => campaign.id !== id));
        if (campaignSelection.getSnapshot() === id) {
          // The derived selection chooses the first remaining campaign; no captured list is restored.
          setSelectedCampaignIdState(null);
          setSelectedCampaignSegmentState("all");
        }
      }),
      duplicateCampaign: (id) => {
        const source = campaigns.find((campaign) => campaign.id === id);
        const selection = campaignSelection.getSnapshot();
        return requestMutation(id, `/api/campaigns/${id}/duplicate`, "POST",
          { name: `${source?.name ?? "Campaign"} Copy` }, rememberCampaign, (campaign) => {
            setCampaignsState((current) => [...current.filter((item) => item.id !== campaign.id), campaign]);
            if (campaignSelection.getSnapshot() === selection) {
              setSelectedCampaignIdState(campaign.id);
              setSelectedCampaignSegmentState("all");
            }
          });
      },
      addCampaignSubcategory: (campaignId, subcategory) => requestMutation(campaignId,
        `/api/campaigns/${campaignId}/subcategories`, "POST", subcategory, (data) => {
          const saved = parseSubcategory(data, subcategory);
          const campaign = confirmedCampaigns.get(campaignId);
          if (campaign) confirmedCampaigns.set(campaignId, mergeConfirmedSubcategory(campaign, saved, subcategory.id));
          return saved;
        },
        (saved) => setCampaignsState((current) => current.map((campaign) => campaign.id === campaignId
          ? mergeConfirmedSubcategory(campaign, saved, subcategory.id) : campaign))),
      updateCampaignSegmentCollection: async (campaignId, segment, collectionId) => {
        const customId = customSubcategoryId(segment);
        const customName = campaigns.find((item) => item.id === campaignId)?.subcategories.find((item) => item.id === customId)?.name;
        const body = () => {
          // Build after earlier queued responses, never from the render that scheduled this link.
          const campaign = confirmedCampaigns.get(campaignId);
          if (!campaign) throw new Error("Campaign not found");
          const subcategory = customId ? campaign.subcategories.find((item) => item.id === customId || item.name === customName) : null;
          if (customId && !subcategory) throw new Error("Subcategory not found");
          return subcategory
            ? { id: subcategory.id, name: subcategory.name, trackerKind: subcategory.trackerKind, collectionId }
            : { name: segment === "paid" ? "Paid" : "Seeding", trackerKind: segment, collectionId };
        };
        await requestMutation(campaignId, `/api/campaigns/${campaignId}/subcategories`, "POST", body,
          (data, sent) => {
            const saved = parseSubcategory(data, sent as ReturnType<typeof body>);
            const campaign = confirmedCampaigns.get(campaignId);
            if (campaign) confirmedCampaigns.set(campaignId, mergeConfirmedSubcategory(campaign, saved, customId));
            return saved;
          }, (saved) => {
            setCampaignsState((current) => current.map((item) => item.id === campaignId
              ? mergeConfirmedSubcategory(item, saved, customId) : item));
            if (customId && customId !== saved.id && campaignSelection.getSnapshot() === campaignId
              && campaignSegment.getSnapshot() === segment) {
              setSelectedCampaignSegmentState(`custom:${saved.id}`);
            }
          });
      },
    }),
    [
      campaigns,
      requestMutation,
      reads,
      campaignsError,
      campaignsLoading,
      selectedCampaignId,
      selectedCampaign,
      selectedCampaignSegment,
      setSelectedCampaignIdState,
      setSelectedCampaignSegmentState,
    ]
  );

  return <CampaignCtx.Provider value={value}>{children}</CampaignCtx.Provider>;
}

function isCampaignSegment(value: string | null): value is CampaignSegment {
  return (
    value === "all" ||
    value === "seeding" ||
    value === "paid" ||
    Boolean(value?.startsWith("custom:"))
  );
}

export function useCampaigns(): CampaignContextValue {
  const ctx = useContext(CampaignCtx);
  if (!ctx) throw new Error("useCampaigns must be used within CampaignProvider");
  return ctx;
}

function normalizeCampaign(campaign: Campaign): Campaign {
  return {
    id: campaign.id,
    name: campaign.name,
    brand: campaign.brand,
    objective: campaign.objective,
    owner: campaign.owner,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    budget: Number(campaign.budget) || 0,
    stage: campaign.stage,
    notes: campaign.notes ?? "",
    segmentCollections: {
      seeding: campaign.segmentCollections?.seeding ?? null,
      paid: campaign.segmentCollections?.paid ?? null,
    },
    subcategories: (campaign.subcategories ?? []).map(normalizeSubcategory),
  };
}

function normalizeSubcategory(
  subcategory: CampaignSubcategory
): CampaignSubcategory {
  return {
    id: subcategory.id || makeSubcategoryId(subcategory.name),
    name: subcategory.name || "New subcategory",
    trackerKind:
      subcategory.trackerKind === "paid" || subcategory.trackerKind === "seeding"
        ? subcategory.trackerKind
        : "seeding",
    collectionId: subcategory.collectionId ?? null,
  };
}

function customSubcategoryId(segment: Exclude<CampaignSegment, "all">) {
  return segment.startsWith("custom:") ? segment.slice("custom:".length) : null;
}

function makeSubcategoryId(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `subcategory-${slug || Date.now()}`;
}

function parseCampaign(data: unknown): Campaign {
  const campaign = data as Campaign | null;
  if (!campaign || typeof campaign !== "object" || typeof campaign.id !== "string" || !campaign.id
    || [campaign.name, campaign.brand, campaign.objective, campaign.owner, campaign.startsAt, campaign.endsAt, campaign.notes].some((value) => typeof value !== "string")
    || typeof campaign.budget !== "number" || !Number.isFinite(campaign.budget)
    || !["Planning", "Outreach", "Live", "Complete"].includes(campaign.stage) || !Array.isArray(campaign.subcategories)
    || !campaign.segmentCollections || [campaign.segmentCollections.paid, campaign.segmentCollections.seeding].some((value) => value !== null && typeof value !== "string")) {
    throw new Error("The server did not confirm the campaign. Please reload before retrying.");
  }
  for (const subcategory of campaign.subcategories) parseSubcategory(subcategory);
  return normalizeCampaign(campaign);
}

function parseSubcategory(data: unknown, expected?: { name: string; trackerKind: string; collectionId?: string | null }): CampaignSubcategory {
  const subcategory = data as CampaignSubcategory | null;
  if (!subcategory || typeof subcategory !== "object" || typeof subcategory.id !== "string" || !subcategory.id
    || typeof subcategory.name !== "string" || !subcategory.name
    || !["paid", "seeding"].includes(subcategory.trackerKind)
    || !(subcategory.collectionId === null || typeof subcategory.collectionId === "string")
    || (expected && (subcategory.name !== expected.name.trim() || subcategory.trackerKind !== expected.trackerKind
      || subcategory.collectionId !== (expected.collectionId ?? null)))) {
    throw new Error("The server did not confirm the subcategory. Please retry.");
  }
  return normalizeSubcategory(subcategory);
}

function rememberCampaign(data: unknown): Campaign {
  const campaign = parseCampaign(data);
  confirmedCampaigns.set(campaign.id, campaign);
  return campaign;
}
