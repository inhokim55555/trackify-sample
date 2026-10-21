"use client";
import {csvCell as safeCsvCell} from "@/lib/safe-output";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Copy,
  Download,
  AlertTriangle,
  ExternalLink,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useConfirmedAction } from "@/lib/use-confirmed-action";
import { ConfirmDialog, NameDialog } from "@/components/ConfirmDialog";
import {
  useCampaigns,
  type Campaign,
  type CampaignSegment,
  type CampaignStage,
  type CampaignTrackerKind,
} from "@/components/CampaignContext";
import { CampaignEditorDialog } from "@/components/CampaignEditorDialog";
import { useApi } from "@/lib/useApi";
import type { CollectionNode } from "@/app/api/collections/route";
import { ReadError } from "@/components/ReadError";
import { RecordSaveQueue, SaveSessionChangedError, saveRecordBatch, type BatchSaveResult } from "@/lib/record-save-queue";
import { createCampaignSaveView, mergeCampaignDrafts, reconcileCampaignPage } from "@/lib/campaign-view-state";
import { saveSession } from "@/lib/save-session";
import { canEditRequest } from "@/lib/request-state";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Platform = "TikTok" | "Instagram" | "YouTube" | "Facebook" | "Snapchat" | "X";
type RateType = "Flat" | "Gifted" | "Affiliate";
type StatusColor =
  | "gray"
  | "sky"
  | "amber"
  | "violet"
  | "indigo"
  | "emerald"
  | "green"
  | "rose";
type SortKey =
  | "creatorName"
  | "handle"
  | "platform"
  | "followerCount"
  | "engagementRate"
  | "negotiatedRate"
  | "rateType"
  | "lastContacted"
  | "nextFollowUp"
  | "deliverableDue"
  | "priority"
  | "lastUpdated"
  | "status";
type SortDir = "asc" | "desc";
type ActiveSortKey = SortKey | null;
type TrackerSegment = "seeding" | "paid";
type SaveState = "idle" | "saving" | "saved" | "error";

interface GmailThreadAttachment {
  id: string;
  subject: string;
  url: string;
  lastMessageAt: string;
  notes: string;
  gmailThreadId?: string;
  syncedAt?: string;
  lastSender?: string;
}

interface CampaignDeliverable {
  id: string;
  finalLink: string;
  concept: string;
  source: string;
  videoQuality: string;
  date: string;
  views?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  story: boolean;
  usageRights: boolean;
  notes: string;
  videoId?: string;
  linkedVideoUrl?: string;
  metricSource?: string;
  metricCapturedAt?: string;
  collectionIds?: string[];
  collectionNames?: string[];
}

interface InfluencerRecord {
  id: string;
  creatorName: string;
  handle: string;
  platform: Platform;
  category: string;
  followerCount: number;
  engagementRate: number;
  negotiatedRate: number;
  rateType: RateType;
  lastContacted: string;
  lastUpdated: string;
  status: string;
  notes: string;
  profile?: string;
  finalLink?: string;
  date?: string;
  views?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;
  trackingNumber?: string;
  shippedDate?: string;
  shipped?: boolean;
  delivered?: boolean;
  received?: boolean;
  deliveryStatus?: string;
  concept?: string;
  source?: string;
  byouId?: string;
  managedBy?: string;
  email?: string;
  name?: string;
  story?: boolean;
  usageRights?: boolean;
  lastCheckIn?: string;
  videoQuality?: string;
  nextFollowUp?: string;
  deliverableDue?: string;
  priority?: string;
  statusHistory?: string[];
  deliverables?: CampaignDeliverable[];
  campaignIds: string[];
  campaignNames?: string[];
  subcategoryIds?: string[];
  gmailThreads: GmailThreadAttachment[];
}

interface CollectionMember {
  id: string;
  handle: string;
  platform: string;
  displayName: string;
}

interface CampaignInfluencersResponse {
  data: InfluencerRecord[];
  statuses: StatusDefinition[];
  meta: {
    total: number;
    filteredTotal: number;
    limit: number;
    offset: number;
    sort: string;
    dir: SortDir;
  };
  summary: CampaignSummaryStats & { categories: string[] };
  filters: {
    categories: string[];
  };
}

interface CampaignSummaryStats {
  total: number;
  avgRate: number;
  posted: number;
  stale: number;
  dueFollowUps: number;
  overdueDeliverables: number;
  statusCounts: (StatusDefinition & { count: number })[];
}

interface GmailStatusResponse {
  data: {
    configured: boolean;
    connected: boolean;
    email: string | null;
    lastSyncedAt: string | null;
  };
}

interface StatusDefinition {
  id: string;
  label: string;
  color: StatusColor;
}

type TrackerField =
  | "creatorName"
  | "profile"
  | "platform"
  | "followerCount"
  | "negotiatedRate"
  | "status"
  | "finalLink"
  | "date"
  | "views"
  | "likes"
  | "comments"
  | "saves"
  | "shares"
  | "address"
  | "city"
  | "state"
  | "zipcode"
  | "trackingNumber"
  | "shippedDate"
  | "managedBy"
  | "deliveryStatus"
  | "concept"
  | "source"
  | "byouId"
  | "email"
  | "name"
  | "shipped"
  | "delivered"
  | "received"
  | "story"
  | "usageRights"
  | "lastCheckIn"
  | "lastContacted"
  | "deliverableDue"
  | "nextFollowUp"
  | "priority"
  | "videoQuality"
  | "gmailThreadUrl"
  | "notes";

interface TrackerColumn {
  label: string;
  field: TrackerField;
  input: "text" | "number" | "date" | "select" | "checkbox" | "gmail-thread";
  width: string;
  options?: string[];
  align?: "right";
}

const PLATFORMS: Platform[] = ["TikTok", "Instagram", "YouTube", "Facebook", "Snapchat", "X"];
const RATE_TYPES: RateType[] = ["Flat", "Gifted", "Affiliate"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];
const CONCEPT_OPTIONS = ["", "Concept 1", "Concept 2", "Concept 3"];
const SOURCE_OPTIONS = [
  "",
  "Pre Seeding",
  "Seeding",
  "Ambass",
  "체험단",
  "Nano",
  "Special",
  "Not found",
  "외부업체",
];
const VIDEO_QUALITY_OPTIONS = [
  "",
  "OOF",
  "Okay",
  "Good",
  "AMAZING",
  "In Progress",
  "Blacklist",
];
const PAID_COLUMNS: TrackerColumn[] = [
  { label: "Creator", field: "creatorName", input: "text", width: "w-36" },
  { label: "Platform", field: "platform", input: "select", width: "w-28", options: PLATFORMS },
  { label: "Followers", field: "followerCount", input: "number", width: "w-24", align: "right" },
  { label: "Rate", field: "negotiatedRate", input: "number", width: "w-24", align: "right" },
  { label: "Status", field: "status", input: "select", width: "w-32" },
  { label: "Last Contacted", field: "lastContacted", input: "date", width: "w-32" },
  { label: "Deliverable Due", field: "deliverableDue", input: "date", width: "w-32" },
  { label: "Next Follow Up", field: "nextFollowUp", input: "date", width: "w-32" },
  { label: "Priority", field: "priority", input: "select", width: "w-28", options: PRIORITIES },
  { label: "Gmail Thread URL", field: "gmailThreadUrl", input: "gmail-thread", width: "w-44" },
  { label: "Notes", field: "notes", input: "text", width: "w-52" },
];
const SEEDING_COLUMNS: TrackerColumn[] = [
  { label: "Managed By", field: "managedBy", input: "text", width: "w-28" },
  { label: "BYOU ID", field: "byouId", input: "text", width: "w-24" },
  { label: "Profile", field: "profile", input: "text", width: "w-36" },
  { label: "Email", field: "email", input: "text", width: "w-44" },
  { label: "Name", field: "name", input: "text", width: "w-32" },
  { label: "Address", field: "address", input: "text", width: "w-48" },
  { label: "City", field: "city", input: "text", width: "w-28" },
  { label: "State", field: "state", input: "text", width: "w-20" },
  { label: "Zipcode", field: "zipcode", input: "text", width: "w-24" },
  { label: "Tracking #", field: "trackingNumber", input: "text", width: "w-36" },
  { label: "Shipped Date", field: "shippedDate", input: "date", width: "w-32" },
  { label: "Shipped", field: "shipped", input: "checkbox", width: "w-20" },
  { label: "Delivered", field: "delivered", input: "checkbox", width: "w-20" },
  { label: "Received", field: "received", input: "checkbox", width: "w-20" },
  { label: "Last Contacted", field: "lastContacted", input: "date", width: "w-32" },
  { label: "Last Check In", field: "lastCheckIn", input: "date", width: "w-32" },
  { label: "Gmail Thread URL", field: "gmailThreadUrl", input: "gmail-thread", width: "w-44" },
  { label: "Notes", field: "notes", input: "text", width: "w-52" },
];

const DEFAULT_STATUS_DEFINITIONS: StatusDefinition[] = [
  { id: "open", label: "Open", color: "gray" },
  { id: "in-negotiation", label: "In Negotiation", color: "amber" },
  { id: "needs-reply", label: "Needs Reply", color: "rose" },
  { id: "waiting-on-creator", label: "Waiting on Creator", color: "sky" },
  { id: "content-due", label: "Content Due", color: "violet" },
  { id: "posted", label: "Posted", color: "emerald" },
  { id: "do-not-book", label: "Do Not Book", color: "rose" },
];

const CAMPAIGN_PAGE_SIZE = 75;

const STATUS_BADGES: Record<StatusColor, string> = {
  gray: "bg-gray-100 text-gray-600 ring-gray-200",
  sky: "bg-sky-50 text-sky-700 ring-sky-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  green: "bg-green-50 text-green-700 ring-green-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
};

const STAT_CARD_TONES: Record<StatusColor, string> = {
  gray: "bg-pastel-mist",
  sky: "bg-pastel-periwinkle",
  amber: "bg-amber-50",
  violet: "bg-pastel-lavender",
  indigo: "bg-indigo-50",
  emerald: "bg-pastel-sage",
  green: "bg-green-50",
  rose: "bg-rose-50",
};

const emptyForm: InfluencerRecord = {
  id: "",
  creatorName: "",
  handle: "",
  platform: "TikTok",
  category: "",
  followerCount: 0,
  engagementRate: 0,
  negotiatedRate: 0,
  rateType: "Flat",
  lastContacted: todayIso(),
  lastUpdated: todayIso(),
  status: "Open",
  notes: "",
  nextFollowUp: "",
  deliverableDue: "",
  priority: "Normal",
  statusHistory: [],
  campaignIds: [],
  subcategoryIds: [],
  gmailThreads: [],
};

const emptyThread: GmailThreadAttachment = {
  id: "",
  subject: "",
  url: "",
  lastMessageAt: todayIso(),
  notes: "",
};

// Lives for this browser tab, so navigation cannot cancel edits or discard failed drafts.
const influencerSaves = new RecordSaveQueue<InfluencerRecord>(async (record, context) => {
  const { data, error } = await createSupabaseBrowserClient().auth.getSession();
  const currentOwner = saveSession.snapshot().owner;
  if (context.signal.aborted || currentOwner?.userId !== context.owner.userId || currentOwner?.revision !== context.owner.revision) {
    throw new SaveSessionChangedError();
  }
  if (error || data.session?.user.id !== context.owner.userId) {
    saveSession.setUser(error ? null : data.session?.user.id ?? null);
    throw new SaveSessionChangedError();
  }
  const res = await fetch("/api/campaign-influencers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ record }),
    signal: context.signal,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || "Failed to save influencer");
  if (!payload.data || typeof payload.data.id !== "string") throw new Error("The save response was incomplete. Please retry.");
  return normalizeRecord(payload.data);
});
influencerSaves.setOwner(saveSession.snapshot().owner);
saveSession.subscribe((session) => influencerSaves.setOwner(session.owner));
const influencerSaveView = createCampaignSaveView(influencerSaves);

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (event) => {
    if (influencerSaves.snapshots().length === 0) return;
    influencerSaves.flush();
    event.preventDefault();
    event.returnValue = "";
  });
}

export function InfluencerCampaignDashboard() {
  const saveOwner = saveSession.snapshot().owner;
  const {
    campaignsLoading,
    campaignsError,
    reloadCampaigns,
    selectedCampaign,
    selectedCampaignSegment,
    updateCampaign,
    archiveCampaign,
    duplicateCampaign,
    createCampaign,
  } = useCampaigns();
  const gmailStatus = useApi<GmailStatusResponse>("/api/gmail/status");
  const mounted = useRef(false);
  const saveSnapshot = useSyncExternalStore(
    influencerSaveView.subscribe, influencerSaveView.getSnapshot, influencerSaveView.getServerSnapshot
  );
  const pendingSaves = saveSnapshot.pending;
  const [records, setRecords] = useState<InfluencerRecord[]>([]);
  const [recordsRequest, setRecordsRequest] = useState<string | null>(null);
  const [loadedResponse, setLoadedResponse] = useState<CampaignInfluencersResponse | null>(null);
  const [archiveSaveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const saveStates = { ...saveSnapshot.states, ...archiveSaveStates };
  const [campaignActionError, setCampaignActionError] = useState<string | null>(null);
  const [statusDefinitions, setStatusDefinitions] = useState<StatusDefinition[]>(
    DEFAULT_STATUS_DEFINITIONS
  );
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<Platform | "All">("All");
  const [status, setStatus] = useState<string>("All");
  const [sortKey, setSortKey] = useState<ActiveSortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [panelOpen, setPanelOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importContext, setImportContext] = useState<{ campaign: Campaign; segment: TrackerSegment; subcategoryId: string | null } | null>(null);
  const [campaignEditorOpen, setCampaignEditorOpen] = useState(false);
  const [editing, setEditing] = useState<InfluencerRecord | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [panelSaving, setPanelSaving] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"tracker" | "overview">("tracker");
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<InfluencerRecord | null>(null);
  const [deleteCampaignTarget, setDeleteCampaignTarget] = useState<Campaign | null>(null);
  const pageContext = JSON.stringify([
    selectedCampaign?.id, selectedCampaignSegment, query, platform, status, sortKey, sortDir,
  ]);
  const [pagination, setPagination] = useState({ key: pageContext, page: 0 });
  const currentPage = reconcileCampaignPage(pagination, pageContext);
  if (currentPage !== pagination) setPagination(currentPage);
  const page = currentPage.page;
  function setPage(update: (current: number) => number) {
    setPagination((current) => ({ key: pageContext, page: update(reconcileCampaignPage(current, pageContext).page) }));
  }

  const campaignInfluencersUrl = useMemo(() => {
    if (!selectedCampaign) return null;
    const params = new URLSearchParams({
      campaignId: selectedCampaign.id,
      segment: selectedCampaignSegment,
      limit: String(CAMPAIGN_PAGE_SIZE),
      offset: String(page * CAMPAIGN_PAGE_SIZE),
    });
    if (sortKey) {
      params.set("sort", sortKey);
      params.set("dir", sortDir);
    }
    if (query.trim()) params.set("query", query.trim());
    if (platform !== "All") params.set("platform", platform);
    if (status !== "All") params.set("status", status);
    return `/api/campaign-influencers?${params.toString()}`;
  }, [
    selectedCampaign,
    selectedCampaignSegment,
    sortKey,
    sortDir,
    page,
    query,
    platform,
    status,
  ]);

  const campaignInfluencers = useApi<CampaignInfluencersResponse>(
    campaignInfluencersUrl,
    { cache: false, keepDataOnReload: true }
  );
  const reloadCampaignInfluencers = campaignInfluencers.reload;

  // Reconcile the editable copy only when its server snapshot changes. React
  // retries this render before committing children, so old rows never render
  // under new campaign/filter parameters and pending drafts remain intact.
  if (campaignInfluencers.data && (
    campaignInfluencers.data !== loadedResponse || campaignInfluencers.requestUrl !== recordsRequest
  )) {
    setLoadedResponse(campaignInfluencers.data);
    setRecords(mergeCampaignDrafts(campaignInfluencers.data.data, pendingSaves, normalizeRecord));
    setRecordsRequest(campaignInfluencers.requestUrl);

    const validStatuses = campaignInfluencers.data.statuses.filter(
      isStatusDefinition
    );
    setStatusDefinitions(
      mergeStatusDefinitions(
        [...DEFAULT_STATUS_DEFINITIONS, ...validStatuses],
        campaignInfluencers.data.data
      )
    );
  }

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = influencerSaves.subscribe((entry) => {
      if (entry.state === "reset") {
        setRecords([]);
        setSaveStates({});
        return;
      }
      if (entry.state === "saved") {
        reloadCampaignInfluencers();
        setRecords((current) => current.map((row) => row.id === entry.record.id || row.id === entry.replacedId ? entry.record : row));
      }
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      influencerSaves.flush();
    };
  }, [reloadCampaignInfluencers]);

  const workflowStatuses = useMemo(
    () => mergeStatusDefinitions(statusDefinitions, records),
    [records, statusDefinitions]
  );

  const rowsReady = canEditRequest(recordsRequest, campaignInfluencersUrl, campaignInfluencers);
  const campaignRows = rowsReady ? records : [];
  const scopedRows = campaignRows;

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scopedRows
      .filter((row) => {
        const deliverableLinks = (row.deliverables ?? [])
          .map((deliverable) => deliverable.finalLink)
          .join(" ");
        const matchesQuery =
          !q ||
          row.creatorName.toLowerCase().includes(q) ||
          row.handle.toLowerCase().includes(q) ||
          (row.name ?? "").toLowerCase().includes(q) ||
          (row.email ?? "").toLowerCase().includes(q) ||
          (row.finalLink ?? "").toLowerCase().includes(q) ||
          deliverableLinks.toLowerCase().includes(q);
        const matchesPlatform = platform === "All" || row.platform === platform;
        const matchesStatus = status === "All" || row.status === status;
        return (
          matchesQuery &&
          matchesPlatform &&
          matchesStatus
        );
      })
      .sort((a, b) =>
        sortKey
          ? compareRows(a, b, sortKey, sortDir)
          : compareRows(a, b, "lastUpdated", "desc")
      );
  }, [
    scopedRows,
    query,
    platform,
    status,
    sortKey,
    sortDir,
  ]);

  const stats = useMemo<CampaignSummaryStats>(() => {
    const apiSummary = campaignInfluencers.data?.summary;
    if (apiSummary) {
      return {
        ...apiSummary,
        statusCounts: workflowStatuses.map((definition) => ({
          ...definition,
          count:
            apiSummary.statusCounts.find((item) => item.label === definition.label)
              ?.count ?? 0,
        })),
      };
    }

    const total = scopedRows.length;
    const avgRate =
      total === 0
        ? 0
        : scopedRows.reduce((sum, row) => sum + row.negotiatedRate, 0) / total;
    const posted = scopedRows.filter((r) => r.status === "Posted").length;
    const stale = scopedRows.filter((r) => isStale(r.lastUpdated)).length;
    const dueFollowUps = scopedRows.filter((r) => isDue(r.nextFollowUp)).length;
    const overdueDeliverables = scopedRows.filter((r) => isDue(r.deliverableDue)).length;
    const statusCounts = workflowStatuses.map((definition) => ({
      ...definition,
      count: scopedRows.filter((row) => row.status === definition.label).length,
    }));
    return {
      total,
      avgRate,
      posted,
      stale,
      dueFollowUps,
      overdueDeliverables,
      statusCounts,
    };
  }, [campaignInfluencers.data?.summary, scopedRows, workflowStatuses]);

  const filteredTotal = campaignInfluencers.data?.meta.filteredTotal ?? visibleRows.length;
  const pageStart = filteredTotal === 0 ? 0 : page * CAMPAIGN_PAGE_SIZE + 1;
  const pageEnd = Math.min(filteredTotal, page * CAMPAIGN_PAGE_SIZE + visibleRows.length);
  const hasPrevPage = page > 0;
  const hasNextPage = (page + 1) * CAMPAIGN_PAGE_SIZE < filteredTotal;
  const selectedSubcategoryId = customSegmentId(selectedCampaignSegment);
  const trackerSegment = getCampaignTrackerKind(
    selectedCampaign,
    selectedCampaignSegment
  );
  const visibleSeedingRows = useMemo(
    () => visibleRows.filter((row) => isInCampaignSegment(row, "seeding")),
    [visibleRows]
  );
  const visiblePaidRows = useMemo(
    () => visibleRows.filter((row) => isInCampaignSegment(row, "paid")),
    [visibleRows]
  );
  function queueRecordSave(record: InfluencerRecord) {
    // Failure remains in the queue and visible retry UI; this event has no caller to await it.
    void influencerSaves.save(record, false, saveOwner).catch(() => undefined);
  }

  function saveRecord(record: InfluencerRecord) {
    return influencerSaves.save(record, true, saveOwner);
  }

  function requestArchiveInfluencer(row: InfluencerRecord) {
    if (influencerSaves.snapshots().some((entry) => entry.record.id === row.id)) {
      setCampaignActionError("Finish saving this influencer's changes before archiving.");
      return;
    }
    setArchiveTarget(row);
  }

  async function archiveInfluencer(row: InfluencerRecord) {
    setSaveStates((current) => ({ ...current, [row.id]: "saving" }));
    try {
      const res = await fetch(`/api/campaign-influencers/${row.id}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to archive influencer");
      setRecords((current) => current.filter((item) => item.id !== row.id));
      setSaveStates((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      campaignInfluencers.reload();
    } catch (err) {
      console.error("Failed to archive influencer", err);
      setSaveStates((current) => ({ ...current, [row.id]: "error" }));
    }
  }

  async function handleDuplicateCampaign() {
    if (!selectedCampaign) return;
    setCampaignActionError(null);
    try {
      await duplicateCampaign(selectedCampaign.id);
    } catch (err) {
      setCampaignActionError(
        err instanceof Error ? err.message : "Failed to duplicate campaign"
      );
    }
  }

  function requestDeleteCampaign(campaign = selectedCampaign) {
    if (!campaign) return;
    setDeleteCampaignTarget(campaign);
  }

  async function handleDeleteCampaign(campaign: Campaign) {
    setCampaignActionError(null);
    try {
      await archiveCampaign(campaign.id);
    } catch (err) {
      setCampaignActionError(
        err instanceof Error ? err.message : "Failed to delete campaign"
      );
      throw err;
    }
  }

  async function createStarterCampaign(name: string) {
    if (!name) return;
    setCampaignActionError(null);
    try {
      await createCampaign({
        name,
        brand: name,
        startsAt: todayIso(),
        endsAt: addDaysIso(todayIso(), 30),
        stage: "Planning",
        budget: 0,
        notes: "",
      });
    } catch (err) {
      setCampaignActionError(
        err instanceof Error ? err.message : "Failed to create campaign."
      );
      throw err;
    }
  }

  async function deleteCampaignFromEditor(campaign: Campaign) {
    setCampaignActionError(null);
    try {
      await archiveCampaign(campaign.id);
    } catch (err) {
      setCampaignActionError(
        err instanceof Error ? err.message : "Failed to delete campaign"
      );
      throw err;
    }
  }

  function handleSort(key: SortKey) {
    if (key !== sortKey) {
      setSortKey(key);
      setSortDir("asc");
      return;
    }
    if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir("desc");
    }
  }

  function clearSort() {
    setSortKey(null);
    setSortDir("desc");
  }

  function updateRecord(id: string, patch: Partial<InfluencerRecord>) {
    if (!rowsReady) return;
    const currentRecord = records.find((row) => row.id === id);
    if (!currentRecord) return;
    const nextRecord = normalizeRecord({
      ...currentRecord,
      ...patch,
      statusHistory: buildStatusHistory(currentRecord, patch.status),
      lastUpdated: todayIso(),
    });
    setRecords((current) =>
      current.map((row) => (row.id === id ? nextRecord : row))
    );
    queueRecordSave(nextRecord);
  }

  function openAddPanel() {
    if (!selectedCampaign) return;
    setEditingCampaign(selectedCampaign);
    setPanelError(null);
    setEditing(
      normalizeRecord({
        ...emptyForm,
        id: makeId(),
        lastContacted: todayIso(),
        lastUpdated: todayIso(),
        negotiatedRate: trackerSegment === "seeding" ? 0 : emptyForm.negotiatedRate,
        rateType: trackerSegment === "seeding" ? "Gifted" : "Flat",
        deliverables: [createBlankDeliverable()],
        campaignIds: [selectedCampaign.id],
        subcategoryIds: selectedSubcategoryId ? [selectedSubcategoryId] : [],
      })
    );
    setPanelOpen(true);
  }

  function openEditPanel(row: InfluencerRecord) {
    if (!selectedCampaign) return;
    setEditingCampaign(selectedCampaign);
    setPanelError(null);
    setEditing(row);
    setPanelOpen(true);
  }

  async function savePanel(row: InfluencerRecord) {
    if (panelSaving) return;
    const previous = records.find((record) => record.id === row.id);
    const next = normalizeRecord({
      ...row,
      handle: row.handle.startsWith("@") ? row.handle : `@${row.handle}`,
      campaignIds: row.campaignIds,
      subcategoryIds: row.subcategoryIds ?? [],
      statusHistory: previous ? buildStatusHistory(previous, row.status) : row.statusHistory,
      lastUpdated: todayIso(),
    });
    setPanelSaving(true);
    setPanelError(null);
    try {
      await saveRecord(next);
      if (!mounted.current) return;
      campaignInfluencers.reload();
      setPanelOpen(false);
      setEditing(null);
    } catch (error) {
      if (mounted.current) setPanelError(error instanceof Error ? error.message : "Failed to save influencer");
    } finally {
      if (mounted.current) setPanelSaving(false);
    }
  }

  function applyGmailSyncPatch(
    id: string,
    patch: Pick<InfluencerRecord, "lastContacted" | "lastUpdated" | "gmailThreads">
  ) {
    setRecords((current) =>
      current.map((row) =>
        row.id === id ? normalizeRecord({ ...row, ...patch }) : row
      )
    );
    setEditing((current) =>
      current?.id === id ? normalizeRecord({ ...current, ...patch }) : current
    );
  }

  async function importCollection(source: CollectionNode, retryRecords?: InfluencerRecord[]) {
    if (!importContext) throw new Error("Select a campaign before importing.");
    const members = retryRecords ? [] : await loadCollectionMembers(source);
    const imported = retryRecords ?? members.map((member) =>
      memberToInfluencer(
        member,
        importContext.campaign,
        source.name,
        importContext.segment,
        importContext.subcategoryId
      )
    );
    const result = await saveRecordBatch(imported, saveRecord);
    if (mounted.current) campaignInfluencers.reload();
    return result;
  }

  async function addStatusDefinition(label: string, color: StatusColor) {
    if (!rowsReady) throw new Error("Wait for this campaign's statuses to load.");
    const trimmed = label.trim();
    if (!trimmed || !selectedCampaign) return;
    const id = makeStatusId(trimmed, statusDefinitions);
    const res = await fetch(`/api/campaigns/${selectedCampaign.id}/statuses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, label: trimmed, color }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Failed to save workflow status");
    if (mounted.current) campaignInfluencers.reload();
  }

  async function removeStatusDefinition(id: string) {
    if (!rowsReady) throw new Error("Wait for this campaign's statuses to load.");
    const definition = workflowStatuses.find((item) => item.id === id);
    if (!definition) return;
    const inUse = Boolean(
      stats.statusCounts.find((item) => item.label === definition.label)?.count
    );
    if (inUse) {
      throw new Error(`Move influencers out of "${definition.label}" before deleting that status.`);
    }
    const res = await fetch(`/api/campaign-statuses/${id}`, { method: "DELETE" });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || "Failed to delete workflow status");
    if (mounted.current) campaignInfluencers.reload();
  }

  function exportCsv() {
    const campaignName = selectedCampaign?.name ?? "Unassigned Campaign";
    const csv =
      selectedCampaignSegment === "all"
        ? [
            csvTrackerSection("Seeding", "seeding", visibleSeedingRows),
            "",
            csvTrackerSection("Paid", "paid", visiblePaidRows),
          ].join("\n")
        : csvTrackerSection(
            segmentLabel(selectedCampaignSegment, selectedCampaign),
            trackerSegment,
            visibleRows
          );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      selectedCampaignSegment === "all"
        ? `${slugify(campaignName)}-trackers.csv`
        : `${slugify(campaignName)}-${slugify(
            segmentLabel(selectedCampaignSegment, selectedCampaign)
          )}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (campaignsError) {
    return <div className="p-5"><ReadError message={`Campaigns could not be loaded. ${campaignsError}`} onRetry={reloadCampaigns} /></div>;
  }
  if (campaignsLoading) {
    return <div role="status" className="p-5 text-sm text-gray-600">Loading campaigns...</div>;
  }
  if (!selectedCampaign) {
    return (
      <div className="p-5">
        <div className="rounded-2xl bg-pastel-sage p-6">
          <div className="max-w-xl">
            <h1 className="font-display text-xl font-semibold tracking-tight text-gray-900">
              No campaign selected yet
            </h1>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              Campaigns organize creator outreach into Seeding, Paid, and any custom
              subcategories your team adds. Create a campaign to start tracking
              influencer details, outreach status, Gmail threads, and notes.
            </p>
            {campaignActionError ? (
              <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {campaignActionError}
              </div>
            ) : null}
            <button
              onClick={() => setCreateCampaignOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-600 py-2 pl-5 pr-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Create campaign
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                <Plus size={14} />
              </span>
            </button>
          </div>
        </div>
        <NameDialog
          open={createCampaignOpen}
          title="Create campaign"
          label="Campaign name"
          placeholder="e.g. Summer Launch"
          submitLabel="Create"
          onSubmit={createStarterCampaign}
          onClose={() => setCreateCampaignOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">
            {selectedCampaign.name}
            {selectedCampaignSegment !== "all" ? (
              <span className="text-gray-400">
                {" "}
                / {segmentLabel(selectedCampaignSegment, selectedCampaign)}
              </span>
            ) : null}
          </h1>
          <p className="text-xs text-gray-400">{selectedCampaign.brand}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCampaignEditorOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-(--border) bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Pencil size={15} /> Edit
          </button>
          <div className="relative">
            <button
              onClick={() => setActionsMenuOpen((open) => !open)}
              aria-label="More campaign actions"
              aria-expanded={actionsMenuOpen}
              className="flex items-center rounded-lg border border-(--border) bg-white px-2.5 py-2 text-gray-700 hover:bg-gray-50"
            >
              <MoreHorizontal size={17} />
            </button>
            {actionsMenuOpen ? (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setActionsMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-(--border) bg-white py-1.5 shadow-xl">
                  <MenuItem
                    icon={<Copy size={15} />}
                    label="Duplicate campaign"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      handleDuplicateCampaign();
                    }}
                  />
                  <MenuItem
                    icon={<Download size={15} />}
                    label="Export CSV"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      exportCsv();
                    }}
                  />
                  <MenuItem
                    icon={<Upload size={15} />}
                    label="Import from Collection"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      setImportContext({ campaign: selectedCampaign, segment: trackerSegment, subcategoryId: selectedSubcategoryId });
                      setImportOpen(true);
                    }}
                  />
                  <div className="my-1.5 border-t border-(--border)" />
                  <MenuItem
                    icon={<Trash2 size={15} />}
                    label="Delete campaign"
                    danger
                    onClick={() => {
                      setActionsMenuOpen(false);
                      requestDeleteCampaign();
                    }}
                  />
                </div>
              </>
            ) : null}
          </div>
          <button
            onClick={openAddPanel}
            className="flex items-center gap-2 rounded-full bg-brand-600 py-2 pl-4 pr-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Add Influencer
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
              <Plus size={14} />
            </span>
          </button>
        </div>
      </div>
      {pendingSaves.filter((entry) => entry.record.campaignIds.includes(selectedCampaign.id)).length > 0 ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" aria-live="polite">
          <p>Changes are kept in this tab until saved. Keep the tab open while saving or retrying.</p>
          {pendingSaves.filter((entry) => entry.record.campaignIds.includes(selectedCampaign.id)).map((entry) => (
            <div key={entry.record.id} className="mt-2 flex flex-wrap items-center gap-2">
              <span>{entry.record.creatorName || entry.record.handle}: {entry.state === "error" ? entry.error : "Saving..."}</span>
              {entry.state === "error" ? <>
                <button type="button" className="rounded-sm border border-amber-300 bg-white px-2 py-1" onClick={() => { void saveRecord(entry.record).catch(() => undefined); }}>Retry save</button>
                <button type="button" className="rounded-sm border border-amber-300 bg-white px-2 py-1" onClick={() => openEditPanel(entry.record)}>Review draft</button>
              </> : null}
            </div>
          ))}
        </div>
      ) : null}
      {campaignActionError ? (
        <div className="mb-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {campaignActionError}
        </div>
      ) : null}
      <CampaignEditorDialog
        campaign={selectedCampaign}
        open={campaignEditorOpen}
        onClose={() => setCampaignEditorOpen(false)}
        onSave={updateCampaign}
        onDelete={deleteCampaignFromEditor}
      />

      {gmailStatus.data && !gmailStatus.data.data.connected ? (
        <GmailWorkflowBanner status={gmailStatus} />
      ) : null}

      {/* Tabs: Tracker is the daily-work surface; Overview holds campaign meta */}
      <div
        role="tablist"
        aria-label="Campaign sections"
        className="mb-3 flex items-center gap-1 border-b border-(--border)"
      >
        <TabButton
          active={activeTab === "tracker"}
          onClick={() => setActiveTab("tracker")}
          label="Tracker"
          count={filteredTotal}
        />
        <TabButton
          active={activeTab === "overview"}
          onClick={() => setActiveTab("overview")}
          label="Overview"
        />
      </div>

      {campaignInfluencers.error ? <ReadError message={`Campaign rows could not be loaded. ${campaignInfluencers.error}`} onRetry={campaignInfluencers.reload} /> : null}
      {activeTab === "overview" ? (
        <div>
          <CampaignSummary key={selectedCampaign.id} campaign={selectedCampaign} onUpdate={updateCampaign} />
          {rowsReady ? <>
          <SummaryStats stats={stats} />
          <CampaignWorkflowPanel
            rows={scopedRows}
            visibleRows={visibleRows}
            onEdit={openEditPanel}
          />
          </> : !campaignInfluencers.error ? <p role="status" className="p-4 text-sm text-gray-600">Loading campaign rows...</p> : null}
        </div>
      ) : (
        <div>
      <div className="mb-3 rounded-xl border border-(--border) bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <SlidersHorizontal size={13} /> Search and filters
          </div>
          {rowsReady ? <WorkflowStatusManager
            key={selectedCampaign.id}
            statusDefinitions={statusDefinitions}
            onAddStatus={addStatusDefinition}
            onRemoveStatus={removeStatusDefinition}
          /> : null}
        </div>
        <div className="grid gap-2 lg:grid-cols-[1.7fr_0.8fr_0.9fr]">
          <label className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search campaign influencers"
              placeholder="Search name, email, or Final Link URL"
              className="w-full rounded-lg border border-(--border) py-2 pl-9 pr-3 text-sm outline-hidden focus:border-brand-400"
            />
          </label>
          <FilterSelect
            value={platform}
            ariaLabel="Filter by platform"
            onChange={(v) => setPlatform(v as Platform | "All")}
          >
            <option value="All">All platforms</option>
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect value={status} ariaLabel="Filter by status" onChange={setStatus}>
            <option value="All">All statuses</option>
            {workflowStatuses.map((s) => (
              <option key={s.id} value={s.label}>
                {s.label}
              </option>
            ))}
          </FilterSelect>
        </div>
      </div>

      {rowsReady ? <>
      {selectedCampaignSegment === "all" ? (
        <div className="space-y-4">
          <TrackerSection
            title="Seeding"
            rows={visibleSeedingRows}
            segment="seeding"
            statusDefinitions={workflowStatuses}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onClearSort={clearSort}
            onInlineUpdate={updateRecord}
            onEdit={openEditPanel}
            onArchive={requestArchiveInfluencer}
            saveStates={saveStates}
          />
          <TrackerSection
            title="Paid"
            rows={visiblePaidRows}
            segment="paid"
            statusDefinitions={workflowStatuses}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onClearSort={clearSort}
            onInlineUpdate={updateRecord}
            onEdit={openEditPanel}
            onArchive={requestArchiveInfluencer}
            saveStates={saveStates}
          />
        </div>
      ) : (
        <InfluencerTable
          rows={visibleRows}
          segment={trackerSegment}
          statusDefinitions={workflowStatuses}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onClearSort={clearSort}
          onInlineUpdate={updateRecord}
          onEdit={openEditPanel}
          onArchive={requestArchiveInfluencer}
          saveStates={saveStates}
        />      )}
          <CampaignPagination
            start={pageStart}
            end={pageEnd}
            total={filteredTotal}
            loading={campaignInfluencers.loading}
            hasPrev={hasPrevPage}
            hasNext={hasNextPage}
            onPrev={() => setPage((current) => Math.max(0, current - 1))}
            onNext={() => setPage((current) => current + 1)}
          />
          </> : !campaignInfluencers.error ? <p role="status" className="p-4 text-sm text-gray-600">Loading campaign rows...</p> : null}
        </div>
      )}
      <ConfirmDialog
        open={!!archiveTarget}
        title="Archive influencer?"
        message={`Archive ${archiveTarget?.creatorName || archiveTarget?.handle || "this influencer"}? They are removed from the active tracker but their record is kept.`}
        confirmLabel="Archive"
        danger
        onConfirm={() => {
          if (archiveTarget) archiveInfluencer(archiveTarget);
          setArchiveTarget(null);
        }}
        onClose={() => setArchiveTarget(null)}
      />
      <ConfirmDialog
        key={deleteCampaignTarget?.id ?? "no-campaign-delete"}
        open={!!deleteCampaignTarget}
        title="Delete campaign?"
        message={`Delete ${deleteCampaignTarget?.name ?? "this campaign"}? This removes it from the active Campaigns list.`}
        confirmLabel="Delete campaign"
        danger
        onConfirm={async () => {
          if (deleteCampaignTarget) await handleDeleteCampaign(deleteCampaignTarget);
          setDeleteCampaignTarget((current) => current?.id === deleteCampaignTarget?.id ? null : current);
        }}
        onClose={() => setDeleteCampaignTarget(null)}
      />

      {panelOpen && editing && editingCampaign && (
        <InfluencerPanel
          record={editing}
          statusDefinitions={workflowStatuses}
          campaign={editingCampaign}
          saving={panelSaving}
          saveError={panelError}
          canSyncGmail={records.some((row) => row.id === editing.id)}
          onGmailSync={applyGmailSyncPatch}
          onClose={() => {
            if (panelSaving) return;
            setPanelOpen(false);
            setEditing(null);
          }}
          onSave={(record) => { void savePanel(record); }}
        />
      )}

      {importOpen && importContext && (
        <CollectionImportPanel
          selectedCampaignName={importContext.campaign.name}
          onClose={() => setImportOpen(false)}
          onImport={importCollection}
        />
      )}
    </div>
  );
}

const CAMPAIGN_STAGES: CampaignStage[] = [
  "Planning",
  "Outreach",
  "Live",
  "Complete",
];

function CampaignSummary({
  campaign,
  onUpdate,
}: {
  campaign: Campaign;
  onUpdate: (id: string, patch: Partial<Campaign>) => Promise<Campaign>;
}) {
  return (
    <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <EditableCampaignField
        label="Campaign"
        value={campaign.name}
        onSave={(value) => onUpdate(campaign.id, { name: value })}
      />
      <EditableCampaignField
        label="Brand"
        value={campaign.brand}
        onSave={(value) => onUpdate(campaign.id, { brand: value })}
      />
      <EditableCampaignField
        label="Stage"
        value={campaign.stage}
        inputKind="select"
        options={CAMPAIGN_STAGES}
        onSave={(value) =>
          onUpdate(campaign.id, { stage: value as CampaignStage })
        }
      />
      <EditableCampaignField
        label="Budget"
        value={String(campaign.budget)}
        displayValue={formatCurrency(campaign.budget)}
        inputKind="number"
        onSave={(value) =>
          onUpdate(campaign.id, { budget: Number(value) || 0 })
        }
      />
      <EditableCampaignField
        label="Start Date"
        value={campaign.startsAt}
        displayValue={formatDate(campaign.startsAt)}
        inputKind="date"
        onSave={(value) => onUpdate(campaign.id, { startsAt: value })}
      />
      <EditableCampaignField
        label="End Date"
        value={campaign.endsAt}
        displayValue={formatDate(campaign.endsAt)}
        inputKind="date"
        onSave={(value) => onUpdate(campaign.id, { endsAt: value })}
      />
    </div>
  );
}

export function EditableCampaignField({
  label,
  value,
  displayValue,
  inputKind = "text",
  options = [],
  onSave,
}: {
  label: string;
  value: string;
  displayValue?: string;
  inputKind?: "text" | "number" | "date" | "select";
  options?: string[];
  onSave: (value: string) => Promise<unknown>;
}) {
  const action = useConfirmedAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function startEditing() {
    if (editing) return;
    action.clearError();
    setDraft(value);
    setEditing(true);
  }

  function save(next = draft.trim()) {
    if (!editing || action.busy) return;
    if (next === value && !action.error) { setEditing(false); return; }
    void action.run(() => onSave(next), () => setEditing(false));
  }

  function cancel() {
    if (action.busy) return;
    action.clearError();
    setDraft(value);
    setEditing(false);
  }

  return (
    <div
      onDoubleClick={startEditing}
      className="group rounded-xl border border-(--border) bg-white p-3 transition hover:border-brand-200"
    >
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-gray-600">
        <span>{label}</span>
        {!editing ? (
          <button
            onClick={startEditing}
            aria-label={`Edit ${label}`}
            className="rounded-sm p-0.5 text-gray-400 opacity-0 transition hover:text-brand-700 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Pencil size={13} />
          </button>
        ) : null}
      </div>
      {editing ? (
        inputKind === "select" ? (
          <select
            autoFocus
            aria-label={label}
            disabled={action.busy}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              save(e.target.value);
            }}
            onBlur={() => { if (!action.error) save(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); save(); }
              if (e.key === "Escape") { e.preventDefault(); cancel(); }
            }}
            className="mt-1 w-full rounded-lg border border-brand-300 bg-white px-2 py-1.5 text-sm font-semibold text-gray-900 outline-hidden"
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            autoFocus
            aria-label={label}
            disabled={action.busy}
            type={inputKind}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { if (!action.error) save(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); save(); }
              if (e.key === "Escape") { e.preventDefault(); cancel(); }
            }}
            className="mt-1 w-full rounded-lg border border-brand-300 px-2 py-1.5 text-sm font-semibold text-gray-900 outline-hidden"
          />
        )
      ) : (
        <div className="mt-1 truncate text-xl font-semibold text-gray-900">
          {displayValue ?? value}
        </div>
      )}
      {action.busy ? <p role="status" className="mt-1 text-xs text-gray-500">Saving...</p> : null}
      {action.error ? <div className="mt-2 text-xs text-rose-700">
        <p role="alert">{action.error}</p>
        <button type="button" onClick={() => save()} disabled={action.busy} className="mr-3 underline">Retry save</button>
        <button type="button" onClick={cancel} disabled={action.busy} className="underline">Discard edit</button>
      </div> : null}
    </div>
  );
}

function GmailWorkflowBanner({
  status,
}: {
  status: ReturnType<typeof useApi<GmailStatusResponse>>;
}) {
  const gmail = status.data?.data;

  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--border) bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Mail size={16} className={gmail?.connected ? "text-emerald-600" : "text-gray-400"} />
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {gmail?.connected ? "Gmail connected" : "Gmail not connected"}
          </div>
          <div className="text-xs text-gray-400">
            {status.loading
              ? "Checking Gmail status..."
              : gmail?.connected
                ? `${gmail.email ?? "Connected account"}${gmail.lastSyncedAt ? ` - last synced ${formatDate(gmail.lastSyncedAt)}` : ""}`
                : "Attach a thread URL now, then connect Gmail to sync sender and latest-message details."}
          </div>
        </div>
      </div>
      {!status.loading && !gmail?.connected ? (
        <a
          href={gmail?.configured === false ? "/settings" : "/api/gmail/oauth/start"}
          className="inline-flex items-center gap-1.5 rounded-lg border border-(--border) px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <ExternalLink size={14} />
          {gmail?.configured === false ? "Configure Gmail" : "Connect Gmail"}
        </a>
      ) : null}
    </div>
  );
}

function SummaryStats({
  stats,
}: {
  stats: {
    total: number;
    avgRate: number;
    posted: number;
    stale: number;
    dueFollowUps: number;
    overdueDeliverables: number;
    statusCounts: (StatusDefinition & { count: number })[];
  };
}) {
  return (
    <div className="mb-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total tracked" value={String(stats.total)} />
        <StatCard label="Avg. rate" value={formatCurrency(stats.avgRate)} />
        <StatCard label="Posted" value={String(stats.posted)} tone="emerald" />
        <StatCard label="Needs follow-up" value={String(stats.dueFollowUps)} tone={stats.dueFollowUps ? "amber" : "gray"} />
        <StatCard label="Stale 30+ days" value={String(stats.stale)} tone={stats.stale ? "rose" : "gray"} />
        <StatCard label="Deliverables due" value={String(stats.overdueDeliverables)} tone={stats.overdueDeliverables ? "violet" : "gray"} />
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border border-(--border) bg-white px-3 py-2">
        {stats.statusCounts.map((status) => (
          <span
            key={status.id}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ring-1 ${STATUS_BADGES[status.color]}`}
          >
            {status.label}
            <span className="font-semibold">{status.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function CampaignWorkflowPanel({
  rows,
  visibleRows,
  onEdit,
}: {
  rows: InfluencerRecord[];
  visibleRows: InfluencerRecord[];
  onEdit: (row: InfluencerRecord) => void;
}) {
  const dueRows = rows
    .filter((row) => isDue(row.nextFollowUp) || isDue(row.deliverableDue))
    .sort((a, b) =>
      String(a.nextFollowUp || a.deliverableDue).localeCompare(
        String(b.nextFollowUp || b.deliverableDue)
      )
    )
    .slice(0, 5);
  const activityRows = [...visibleRows]
    .sort((a, b) => String(b.lastUpdated).localeCompare(String(a.lastUpdated)))
    .slice(0, 5);

  return (
    <div className="mb-3 grid gap-3 xl:grid-cols-[1fr_1fr]">
      <section className="rounded-xl border border-(--border) bg-white p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <CalendarClock size={13} /> Follow-up queue
        </div>
        {dueRows.length ? (
          <div className="space-y-2">
            {dueRows.map((row) => (
              <button
                key={row.id}
                onClick={() => onEdit(row)}
                className="flex w-full items-center gap-3 rounded-lg border border-(--border) px-3 py-2 text-left hover:bg-gray-50"
              >
                <UserRound size={15} className="text-gray-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-800">
                    {row.creatorName || row.handle}
                  </div>
                  <div className="truncate text-xs text-gray-400">
                    {row.nextFollowUp ? `Follow up ${formatDate(row.nextFollowUp)}` : ""}
                    {row.nextFollowUp && row.deliverableDue ? " - " : ""}
                    {row.deliverableDue ? `Deliverable ${formatDate(row.deliverableDue)}` : ""}
                  </div>
                </div>
                <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                  {row.priority || "Normal"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-(--border) px-3 py-6 text-center text-sm text-gray-400">
            No follow-ups or deliverables are due.
          </div>
        )}
      </section>

      <section className="rounded-xl border border-(--border) bg-white p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <MessageSquare size={13} /> Recent relationship activity
        </div>
        {activityRows.length ? (
          <div className="space-y-2">
            {activityRows.map((row) => {
              const thread = latestThread(row.gmailThreads);
              return (
                <button
                  key={row.id}
                  onClick={() => onEdit(row)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-50"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${isStale(row.lastUpdated) ? "bg-rose-400" : "bg-emerald-400"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-800">
                      {row.creatorName || row.handle}
                    </div>
                    <div className="truncate text-xs text-gray-400">
                      {row.status} - updated {formatDate(row.lastUpdated)}
                      {thread ? ` - ${thread.subject}` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-(--border) px-3 py-6 text-center text-sm text-gray-400">
            No influencers match the current filters yet.
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: StatusColor;
}) {
  return (
    <div
      className={`rounded-2xl p-3.5 ${tone ? STAT_CARD_TONES[tone] : "bg-pastel-mist"}`}
    >
      <div className="text-xs font-medium text-gray-600">{label}</div>
      <div className="mt-1 truncate text-xl font-semibold text-gray-900">
        {value}
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
        danger
          ? "text-rose-600 hover:bg-rose-50"
          : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      <span className={danger ? "text-rose-500" : "text-gray-400"}>{icon}</span>
      {label}
    </button>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
        active
          ? "border-brand-600 text-brand-700"
          : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-800"
      }`}
    >
      {label}
      {typeof count === "number" ? (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
            active ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function CampaignPagination({
  start,
  end,
  total,
  loading,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  start: number;
  end: number;
  total: number;
  loading: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-(--border) bg-white px-3 py-2 text-sm text-gray-500">
      <span>
        {loading ? "Loading campaign rows..." : `Showing ${start}-${end} of ${total}`}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          disabled={!hasPrev || loading}
          className="inline-flex items-center gap-1 rounded-lg border border-(--border) px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={14} /> Previous
        </button>
        <button
          onClick={onNext}
          disabled={!hasNext || loading}
          className="inline-flex items-center gap-1 rounded-lg border border-(--border) px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function WorkflowStatusManager({
  statusDefinitions,
  onAddStatus,
  onRemoveStatus,
}: {
  statusDefinitions: StatusDefinition[];
  onAddStatus: (label: string, color: StatusColor) => Promise<void>;
  onRemoveStatus: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState<StatusColor>("sky");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function changeStatus(action: () => Promise<void>, added = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      if (mounted.current && added) { setLabel(""); setColor("sky"); }
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : "Failed to update workflow status");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-(--border) px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        Workflow Statuses
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-[340px] rounded-xl border border-(--border) bg-white p-3 shadow-xl">
          <div className="space-y-2">
            {statusDefinitions.map((definition) => (
              <div
                key={definition.id}
                className="flex items-center gap-2 rounded-lg border border-(--border) px-2 py-1.5"
              >
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS_BADGES[definition.color]}`}
                >
                  {definition.label}
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => { void changeStatus(() => onRemoveStatus(definition.id)); }}
                  disabled={busy}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-rose-600"
                  aria-label={`Remove ${definition.label}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_92px_36px] gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Status name"
              className="rounded-lg border border-(--border) px-3 py-2 text-sm outline-hidden focus:border-brand-400"
            />
            <select
              value={color}
              onChange={(e) => setColor(e.target.value as StatusColor)}
              className="rounded-lg border border-(--border) bg-white px-2 py-2 text-sm outline-hidden focus:border-brand-400"
            >
              {Object.keys(STATUS_BADGES).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              onClick={() => { void changeStatus(() => onAddStatus(label, color), true); }}
              disabled={busy || !label.trim()}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              aria-label="Add workflow status"
            >
              <Plus size={16} />
            </button>
          </div>
          {error ? <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

function TrackerSection({
  title,
  rows,
  segment,
  statusDefinitions,
  sortKey,
  sortDir,
  onSort,
  onClearSort,
  onInlineUpdate,
  onEdit,
  onArchive,
  saveStates,
}: {
  title: string;
  rows: InfluencerRecord[];
  segment: TrackerSegment;
  statusDefinitions: StatusDefinition[];
  sortKey: ActiveSortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onClearSort: () => void;
  onInlineUpdate: (id: string, patch: Partial<InfluencerRecord>) => void;
  onEdit: (row: InfluencerRecord) => void;
  onArchive: (row: InfluencerRecord) => void;
  saveStates: Record<string, SaveState>;
}) {
  const groups = useMemo(() => groupInfluencerRows(rows, segment), [rows, segment]);
  const deliverableCount = groups.reduce(
    (total, group) => total + group.deliverables.length,
    0
  );
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-gray-800">{title}</h2>
        <span className="text-xs text-gray-400">
          {groups.length} {groups.length === 1 ? "deal" : "deals"} - {deliverableCount} videos
        </span>
      </div>
      <InfluencerTable
        rows={rows}
        segment={segment}
        statusDefinitions={statusDefinitions}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        onClearSort={onClearSort}
        onInlineUpdate={onInlineUpdate}
        onEdit={onEdit}
        onArchive={onArchive}
        saveStates={saveStates}
      />
    </section>
  );
}

function InfluencerTable({
  rows,
  segment,
  statusDefinitions,
  sortKey,
  sortDir,
  onSort,
  onClearSort,
  onInlineUpdate,
  onEdit,
  onArchive,
  saveStates,
}: {
  rows: InfluencerRecord[];
  segment: TrackerSegment;
  statusDefinitions: StatusDefinition[];
  sortKey: ActiveSortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onClearSort: () => void;
  onInlineUpdate: (id: string, patch: Partial<InfluencerRecord>) => void;
  onEdit: (row: InfluencerRecord) => void;
  onArchive: (row: InfluencerRecord) => void;
  saveStates: Record<string, SaveState>;
}) {
  const columns = getTrackerColumns(segment);
  const groups = useMemo(() => groupInfluencerRows(rows, segment), [rows, segment]);
  const tableMinWidth = segment === "seeding" ? "min-w-[2140px]" : "min-w-[1520px]";
  return (
    <div className="overflow-x-auto rounded-lg border border-(--border) bg-white scroll-thin">
      <table className={`w-full ${tableMinWidth} text-xs`}>
        <thead>
          <tr className="border-b border-(--border) bg-gray-50 text-left text-[11px] text-gray-500">
            <th className="w-10 px-2 py-2 font-medium"></th>
            {columns.map((column) => (
              <SortableTrackerHeader
                key={`${segment}-${String(column.field)}-${column.label}`}
                column={column}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
                onClearSort={onClearSort}
              />
            ))}
            <th className="sticky right-0 bg-gray-50 px-2 py-2 text-right font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <InfluencerGroupRows
              key={group.id}
              group={group}
              columns={columns}
              segment={segment}
              statusDefinitions={statusDefinitions}
              saveStates={saveStates}
              onInlineUpdate={onInlineUpdate}
              onEdit={onEdit}
              onArchive={onArchive}
            />
          ))}
          {groups.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} className="px-3 py-10 text-center text-gray-400">
                No influencers match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SaveStateBadge({ state }: { state: SaveState }) {
  if (state === "saving") {
    return <span className="text-[11px] font-medium text-amber-600">Saving</span>;
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
        <CheckCircle size={12} /> Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
        <AlertTriangle size={12} /> Failed
      </span>
    );
  }
  return <span className="text-[11px] text-gray-300">Idle</span>;
}

function TrackerCell({
  row,
  column,
  statusDefinitions,
  onInlineUpdate,
}: {
  row: InfluencerRecord;
  column: TrackerColumn;
  statusDefinitions: StatusDefinition[];
  onInlineUpdate: (id: string, patch: Partial<InfluencerRecord>) => void;
}) {
  const value = trackerCellInputValue(row, column);
  const options =
    column.field === "status"
      ? statusDefinitions.map((definition) => definition.label)
      : column.options ?? [];

  function update(value: string) {
    const next =
      column.input === "number"
        ? numericTrackerValue(column.field, value)
        : value;
    onInlineUpdate(row.id, { [column.field]: next } as Partial<InfluencerRecord>);
  }

  function updateChecked(checked: boolean) {
    onInlineUpdate(row.id, {
      [column.field]: checked,
    } as Partial<InfluencerRecord>);
  }

  if (column.input === "gmail-thread") {
    return <GmailThreadLinkCell row={row} width={column.width} />;
  }

  if (column.input === "checkbox") {
    return (
      <label className={`${column.width} inline-flex items-center justify-center`}>
        <input
          type="checkbox"
          checked={booleanTrackerValue(trackerCellValue(row, column))}
          onChange={(e) => updateChecked(e.target.checked)}
          className="h-3.5 w-3.5 rounded-sm border-gray-300 text-brand-600 focus:ring-brand-400"
          aria-label={column.label}
        />
      </label>
    );
  }

  if (column.input === "select") {
    const isBubbleSelect =
      column.field === "concept" ||
      column.field === "source" ||
      column.field === "videoQuality";
    return (
      <select
        value={value}
        onChange={(e) => update(e.target.value)}
        className={`${column.width} border border-(--border) bg-white px-1.5 py-1 text-xs outline-hidden focus:border-brand-400 ${
          column.field === "status"
            ? `font-medium ring-1 ${getStatusClasses(row.status, statusDefinitions)}`
            : "text-gray-700"
        } ${isBubbleSelect ? "rounded-full bg-gray-50 font-medium" : "rounded-md"}`}
      >
        {options.map((option) => (
          <option key={option || "blank"} value={option}>
            {option || "-"}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      value={value}
      type={column.input}
      min={column.input === "number" ? "0" : undefined}
      onChange={(e) => update(e.target.value)}
      className={`${column.width} rounded-md border border-(--border) bg-white px-1.5 py-1 text-xs text-gray-700 outline-hidden focus:border-brand-400 ${
        column.align === "right" ? "text-right" : ""
      }`}
    />
  );
}

function getTrackerColumns(segment: TrackerSegment) {
  return segment === "paid" ? PAID_COLUMNS : SEEDING_COLUMNS;
}

function trackerSortKeyForColumn(field: TrackerField): SortKey | null {
  if (field === "creatorName") return "creatorName";
  if (field === "profile") return "handle";
  if (field === "name") return "creatorName";
  if (field === "platform") return "platform";
  if (field === "followerCount") return "followerCount";
  if (field === "negotiatedRate") return "negotiatedRate";
  if (field === "status") return "status";
  if (field === "date" || field === "lastContacted") return "lastContacted";
  if (field === "nextFollowUp") return "nextFollowUp";
  if (field === "deliverableDue") return "deliverableDue";
  if (field === "priority") return "priority";
  return null;
}

function trackerCellInputValue(row: InfluencerRecord, column: TrackerColumn) {
  const value = trackerCellValue(row, column);
  return value === null || value === undefined ? "" : String(value);
}

function trackerCellValue(
  row: InfluencerRecord,
  column: TrackerColumn
): string | number | boolean {
  if (column.field === "creatorName") return displayCreatorName(row);
  if (column.field === "profile") return row.profile || row.handle;
  if (column.field === "name") return row.name || row.creatorName;
  if (column.field === "source") return row.source || row.category;
  if (column.field === "concept") return row.concept || row.category;
  if (column.field === "date") return row.date || row.lastContacted;
  if (column.field === "views") return row.views ?? "";
  if (column.field === "likes") return row.likes ?? "";
  if (column.field === "comments") return row.comments ?? "";
  if (column.field === "saves") return row.saves ?? "";
  if (column.field === "shares") return row.shares ?? "";
  if (column.field === "gmailThreadUrl") return latestThread(row.gmailThreads)?.url ?? "";
  const value = (row as unknown as Record<string, unknown>)[column.field];
  return typeof value === "number" || typeof value === "string" || typeof value === "boolean"
    ? value
    : "";
}

function displayCreatorName(row: InfluencerRecord) {
  const name = row.creatorName?.trim();
  if (name && !/^https?:\/\//i.test(name)) return name;
  return row.handle || row.profile || "";
}

function numericTrackerValue(field: TrackerField, value: string) {
  if (value.trim() === "") {
    return field === "followerCount" || field === "negotiatedRate"
      ? 0
      : undefined;
  }
  return Number(value) || 0;
}

function booleanTrackerValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "checked"].includes(normalized)) return true;
    if (["false", "no", "0", ""].includes(normalized)) return false;
  }
  return false;
}

function groupInfluencerRows(
  rows: InfluencerRecord[],
  segment: TrackerSegment
): InfluencerGroup[] {
  const groups = new Map<string, InfluencerGroup>();

  for (const row of rows) {
    const key = influencerGroupKey(row, segment);
    const existing = groups.get(key);
    const deliverables = deliverablesForRecord(row).map((deliverable) => ({
      ...deliverable,
      row,
    }));

    if (existing) {
      existing.rows.push(row);
      existing.deliverables.push(...deliverables);
    } else {
      groups.set(key, {
        id: key,
        parent: row,
        rows: [row],
        deliverables,
      });
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    deliverables: group.deliverables.length
      ? group.deliverables
      : [{ ...createBlankDeliverable(), row: group.parent }],
  }));
}

function influencerGroupKey(row: InfluencerRecord, segment: TrackerSegment) {
  return [
    segment,
    row.handle.trim().toLowerCase(),
    row.platform,
    row.rateType,
    row.negotiatedRate,
    (row.subcategoryIds ?? []).join("|"),
  ].join("::");
}

function deliverablesForRecord(row: InfluencerRecord): CampaignDeliverable[] {
  const explicit = sanitizeDeliverables(row.deliverables);
  if (explicit.length > 0) return explicit;
  const fallback = deliverableFromRecord(row);
  return hasDeliverableValue(fallback) ? [fallback] : [];
}

function deliverablesPatch(
  row: InfluencerRecord,
  deliverableId: string,
  patch: Partial<CampaignDeliverable>
): Partial<InfluencerRecord> {
  const existing = deliverablesForRecord(row);
  const target =
    existing.find((deliverable) => deliverable.id === deliverableId) ??
    existing[0] ??
    createBlankDeliverable();
  const deliverables = existing.length ? existing : [target];
  const nextDeliverables = deliverables.map((deliverable) =>
    deliverable.id === target.id
      ? normalizeDeliverable({ ...deliverable, ...patch, id: deliverable.id })
      : deliverable
  );
  const isPaid = isInCampaignSegment(row, "paid");
  const visibleDeliverables = isPaid
    ? nextDeliverables.map(stripPaidDeliverableMetadata).filter(hasDeliverableValue)
    : nextDeliverables;
  const primary = visibleDeliverables[0] ?? createBlankDeliverable();

  return {
    deliverables: visibleDeliverables,
    finalLink: primary.finalLink,
    concept: isPaid ? "" : primary.concept,
    source: isPaid ? "" : primary.source,
    date: primary.date,
    story: primary.story,
    usageRights: primary.usageRights,
    videoQuality: primary.videoQuality,
  };
}

function mergeRowVideoFlags(
  deliverables: CampaignDeliverable[],
  row: InfluencerRecord
) {
  if (deliverables.length === 0) return deliverables;
  const rowStory = booleanTrackerValue(row.story);
  const rowUsageRights = booleanTrackerValue(row.usageRights);
  if (!rowStory && !rowUsageRights) return deliverables;

  return deliverables.map((deliverable, index) =>
    index === 0
      ? {
          ...deliverable,
          story: deliverable.story || rowStory,
          usageRights: deliverable.usageRights || rowUsageRights,
        }
      : deliverable
  );
}

function sanitizeDeliverables(value: unknown): CampaignDeliverable[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => normalizeDeliverable(item as Partial<CampaignDeliverable>))
    .filter(hasDeliverableValue);
}

function deliverableFromRecord(row: InfluencerRecord): CampaignDeliverable {
  return normalizeDeliverable({
    id: `${row.id || makeId()}-deliverable`,
    finalLink: row.finalLink ?? "",
    concept: row.concept ?? "",
    source: normalizeExternalVendorLabel(row.source ?? ""),
    videoQuality: row.videoQuality ?? "",
    date: row.date ?? "",
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    saves: row.saves,
    shares: row.shares,
    story: booleanTrackerValue(row.story),
    usageRights: booleanTrackerValue(row.usageRights),
    notes: "",
  });
}

function normalizeDeliverable(
  deliverable: Partial<CampaignDeliverable>
): CampaignDeliverable {
  return {
    id: deliverable.id || makeId(),
    finalLink: deliverable.finalLink ?? "",
    concept: deliverable.concept ?? "",
    source: normalizeExternalVendorLabel(deliverable.source ?? ""),
    videoQuality: normalizeVideoQuality(deliverable.videoQuality ?? ""),
    date: deliverable.date ?? "",
    views: optionalNumber(deliverable.views),
    likes: optionalNumber(deliverable.likes),
    comments: optionalNumber(deliverable.comments),
    saves: optionalNumber(deliverable.saves),
    shares: optionalNumber(deliverable.shares),
    story: booleanTrackerValue(deliverable.story),
    usageRights: booleanTrackerValue(deliverable.usageRights),
    notes: deliverable.notes ?? "",
    videoId: deliverable.videoId ?? "",
    linkedVideoUrl: deliverable.linkedVideoUrl ?? "",
    metricSource: deliverable.metricSource ?? "",
    metricCapturedAt: deliverable.metricCapturedAt ?? "",
    collectionIds: Array.isArray(deliverable.collectionIds)
      ? deliverable.collectionIds.filter((value): value is string => typeof value === "string")
      : [],
    collectionNames: Array.isArray(deliverable.collectionNames)
      ? deliverable.collectionNames.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function hasDeliverableValue(deliverable: CampaignDeliverable) {
  return Boolean(
    deliverable.finalLink ||
      deliverable.concept ||
      deliverable.source ||
      deliverable.videoQuality ||
      deliverable.date ||
      deliverable.notes ||
      deliverable.views ||
      deliverable.likes ||
      deliverable.comments ||
      deliverable.saves ||
      deliverable.shares ||
      deliverable.story ||
      deliverable.usageRights ||
      deliverable.videoId
  );
}

function stripPaidDeliverableMetadata(
  deliverable: CampaignDeliverable
): CampaignDeliverable {
  return { ...deliverable, concept: "", source: "" };
}

function createBlankDeliverable(): CampaignDeliverable {
  return {
    id: makeId(),
    finalLink: "",
    concept: "",
    source: "",
    videoQuality: "",
    date: "",
    views: undefined,
    likes: undefined,
    comments: undefined,
    saves: undefined,
    shares: undefined,
    story: false,
    usageRights: false,
    notes: "",
    videoId: "",
    linkedVideoUrl: "",
    metricSource: "",
    metricCapturedAt: "",
    collectionIds: [],
    collectionNames: [],
  };
}

function optionalNumber(value: unknown) {
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (value === undefined || value === null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : undefined;
}

function normalizeVideoQuality(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "oof") return "OOF";
  if (normalized === "okay") return "Okay";
  if (normalized === "good") return "Good";
  if (normalized === "amazing") return "AMAZING";
  if (normalized === "in progress") return "In Progress";
  if (normalized === "blacklist") return "Blacklist";
  return value.trim();
}

function normalizeExternalVendorLabel(value: string) {
  const trimmed = value.trim();
  return /^\?{3,}$/.test(trimmed) ? "외부업체" : trimmed;
}

function GmailThreadSummary({ threads }: { threads: GmailThreadAttachment[] }) {
  if (threads.length === 0) {
    return <span className="text-xs text-gray-400">None</span>;
  }

  const first = threads[0];
  return (
    <a
      href={first.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
    >
      <Mail size={13} />
      {threads.length} {threads.length === 1 ? "thread" : "threads"}
    </a>
  );
}

interface InfluencerGroup {
  id: string;
  parent: InfluencerRecord;
  rows: InfluencerRecord[];
  deliverables: GroupDeliverable[];
}

interface GroupDeliverable extends CampaignDeliverable {
  row: InfluencerRecord;
}

function InfluencerGroupRows({
  group,
  columns,
  segment,
  statusDefinitions,
  saveStates,
  onInlineUpdate,
  onEdit,
  onArchive,
}: {
  group: InfluencerGroup;
  columns: TrackerColumn[];
  segment: TrackerSegment;
  statusDefinitions: StatusDefinition[];
  saveStates: Record<string, SaveState>;
  onInlineUpdate: (id: string, patch: Partial<InfluencerRecord>) => void;
  onEdit: (row: InfluencerRecord) => void;
  onArchive: (row: InfluencerRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const row = group.parent;
  const saveState = group.rows.some((item) => saveStates[item.id] === "saving")
    ? "saving"
    : group.rows.some((item) => saveStates[item.id] === "error")
      ? "error"
      : group.rows.some((item) => saveStates[item.id] === "saved")
        ? "saved"
        : "idle";

  return (
    <>
      <tr
        onDoubleClick={() => onEdit(row)}
        className="border-b border-(--border) hover:bg-gray-50"
      >
        <td className="whitespace-nowrap px-2 py-1.5">
          <button
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label={`${expanded ? "Collapse" : "Expand"} ${row.creatorName || row.handle}`}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </td>
        {columns.map((column) => (
          <td
            key={`${row.id}-${String(column.field)}-${column.label}`}
            className="whitespace-nowrap px-2 py-1.5"
          >
            <TrackerCell
              row={row}
              column={column}
              statusDefinitions={statusDefinitions}
              onInlineUpdate={onInlineUpdate}
            />
          </td>
        ))}
        <td className="sticky right-0 whitespace-nowrap bg-white px-2 py-1.5 text-right shadow-[-8px_0_12px_rgba(255,255,255,0.85)]">
          <div className="inline-flex items-center gap-1">
            <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {group.deliverables.length}
            </span>
            <SaveStateBadge state={saveState} />
            <button
              onClick={() => onEdit(row)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label={`Edit ${row.creatorName || row.handle}`}
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onArchive(row)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-rose-600"
              aria-label={`Archive ${row.creatorName || row.handle}`}
            >
              <Archive size={13} />
            </button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-(--border) bg-gray-50/60">
          <td colSpan={columns.length + 2} className="px-3 py-2">
            <DeliverablesDetailTable
              segment={segment}
              deliverables={group.deliverables}
              onInlineUpdate={onInlineUpdate}
              onEdit={onEdit}
            />
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DeliverablesDetailTable({
  segment,
  deliverables,
  onInlineUpdate,
  onEdit,
}: {
  segment: TrackerSegment;
  deliverables: GroupDeliverable[];
  onInlineUpdate: (id: string, patch: Partial<InfluencerRecord>) => void;
  onEdit: (row: InfluencerRecord) => void;
}) {
  const showPaidMetadata = segment !== "paid";
  return (
    <div className="overflow-x-auto rounded-lg border border-(--border) bg-white">
      <table className={`w-full text-xs ${showPaidMetadata ? "min-w-[1080px]" : "min-w-[820px]"}`}>
        <thead>
          <tr className="border-b border-(--border) bg-gray-50 text-left text-gray-500">
            <th className="px-3 py-2 font-medium">Final Link</th>
            {showPaidMetadata ? (
              <>
                <th className="px-3 py-2 font-medium">Concept</th>
                <th className="px-3 py-2 font-medium">Source</th>
              </>
            ) : null}
            <th className="px-3 py-2 font-medium">Video Quality</th>
            <th className="px-3 py-2 font-medium">Posted Date</th>
            <th className="px-3 py-2 font-medium">Story</th>
            <th className="px-3 py-2 font-medium">Usage Rights</th>
            <th className="px-3 py-2 font-medium">Notes</th>
            <th className="px-3 py-2 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {deliverables.map((deliverable) => (
            <tr key={`${deliverable.row.id}-${deliverable.id}`} className="border-b border-(--border) last:border-0">
              <td className="max-w-[260px] px-3 py-2">
                <DeliverableTextInput
                  value={deliverable.finalLink}
                  placeholder="https://..."
                  onChange={(value) =>
                    onInlineUpdate(
                      deliverable.row.id,
                      deliverablesPatch(deliverable.row, deliverable.id, {
                        finalLink: value,
                      })
                    )
                  }
                />
              </td>
              {showPaidMetadata ? (
                <>
                  <td className="px-3 py-2 text-gray-600">
                    <DeliverableSelect
                      value={deliverable.concept}
                      options={CONCEPT_OPTIONS}
                      onChange={(value) =>
                        onInlineUpdate(
                          deliverable.row.id,
                          deliverablesPatch(deliverable.row, deliverable.id, {
                            concept: value,
                          })
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    <DeliverableSelect
                      value={deliverable.source}
                      options={SOURCE_OPTIONS}
                      onChange={(value) =>
                        onInlineUpdate(
                          deliverable.row.id,
                          deliverablesPatch(deliverable.row, deliverable.id, {
                            source: value,
                          })
                        )
                      }
                    />
                  </td>
                </>
              ) : null}
              <td className="px-3 py-2 text-gray-600">
                <DeliverableSelect
                  value={deliverable.videoQuality}
                  options={VIDEO_QUALITY_OPTIONS}
                  onChange={(value) =>
                    onInlineUpdate(
                      deliverable.row.id,
                      deliverablesPatch(deliverable.row, deliverable.id, {
                        videoQuality: value,
                      })
                    )
                  }
                />
              </td>
              <td className="px-3 py-2 text-gray-600">
                <DeliverableTextInput
                  type="date"
                  value={deliverable.date}
                  onChange={(value) =>
                    onInlineUpdate(
                      deliverable.row.id,
                      deliverablesPatch(deliverable.row, deliverable.id, {
                        date: value,
                      })
                    )
                  }
                />
              </td>
              <td className="px-3 py-2 text-center text-gray-600">
                <DeliverableCheckbox
                  checked={deliverable.story}
                  label="Story"
                  onChange={(checked) =>
                    onInlineUpdate(
                      deliverable.row.id,
                      deliverablesPatch(deliverable.row, deliverable.id, {
                        story: checked,
                      })
                    )
                  }
                />
              </td>
              <td className="px-3 py-2 text-center text-gray-600">
                <DeliverableCheckbox
                  checked={deliverable.usageRights}
                  label="Usage Rights"
                  onChange={(checked) =>
                    onInlineUpdate(
                      deliverable.row.id,
                      deliverablesPatch(deliverable.row, deliverable.id, {
                        usageRights: checked,
                      })
                    )
                  }
                />
              </td>
              <td className="max-w-[280px] truncate px-3 py-2 text-gray-600">
                <DeliverableTextInput
                  value={deliverable.notes}
                  onChange={(value) =>
                    onInlineUpdate(
                      deliverable.row.id,
                      deliverablesPatch(deliverable.row, deliverable.id, {
                        notes: value,
                      })
                    )
                  }
                />
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => onEdit(deliverable.row)}
                  className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeliverableTextInput({
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date";
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md border border-(--border) bg-white px-2 py-1 text-xs text-gray-700 outline-hidden focus:border-brand-400"
    />
  );
}

function DeliverableSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-md border border-(--border) bg-white px-2 py-1 text-xs text-gray-700 outline-hidden focus:border-brand-400"
    >
      {options.map((option) => (
        <option key={option || "blank"} value={option}>
          {option || "-"}
        </option>
      ))}
    </select>
  );
}

function DeliverableCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded-sm border-gray-300 text-brand-600 focus:ring-brand-400"
        aria-label={label}
      />
    </label>
  );
}

function GmailThreadLinkCell({
  row,
  width,
}: {
  row: InfluencerRecord;
  width: string;
}) {
  const thread = latestThread(row.gmailThreads);
  if (!thread?.url) {
    return (
      <span className={`${width} truncate rounded-md border border-transparent px-1.5 py-1 text-xs text-gray-400`}>
        -
      </span>
    );
  }

  return (
    <a
      href={thread.url}
      target="_blank"
      rel="noreferrer"
      title={thread.url}
      className={`${width} inline-flex items-center gap-1 rounded-md border border-sky-100 bg-sky-50 px-1.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100`}
    >
      <Mail size={13} className="shrink-0" />
      <span className="truncate">{thread.subject || "Gmail thread"}</span>
    </a>
  );
}

function SortableTrackerHeader({
  column,
  sortKey,
  sortDir,
  onSort,
  onClearSort,
}: {
  column: TrackerColumn;
  sortKey: ActiveSortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onClearSort: () => void;
}) {
  const sortableField = trackerSortKeyForColumn(column.field);
  if (!sortableField) {
    return (
      <th
        className={`whitespace-nowrap px-2 py-2 font-medium ${
          column.align === "right" ? "text-right" : ""
        }`}
      >
        {column.label}
      </th>
    );
  }

  return (
    <SortableHeader
      label={column.label}
      field={sortableField}
      sortKey={sortKey}
      sortDir={sortDir}
      onSort={onSort}
      onClearSort={onClearSort}
      align={column.align}
    />
  );
}

function SortableHeader({
  label,
  field,
  sortKey,
  sortDir,
  onSort,
  onClearSort,
  align,
}: {
  label: string;
  field: SortKey;
  sortKey: ActiveSortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  onClearSort: () => void;
  align?: "right";
}) {
  const active = sortKey === field;
  return (
    <th
      onClick={() => onSort(field)}
      title={active ? "Click to change sort. Use the x to clear it." : "Sort column"}
      className={`cursor-pointer select-none whitespace-nowrap px-2 py-2 font-medium hover:text-gray-800 ${
        align === "right" ? "text-right" : ""
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          <span className="inline-flex items-center gap-0.5 text-brand-600">
            {sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            <button
              onClick={(event) => {
                event.stopPropagation();
                onClearSort();
              }}
              className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-gray-400 hover:bg-gray-200 hover:text-gray-700"
              aria-label={`Clear ${label} sort`}
            >
              <X size={10} />
            </button>
          </span>
        ) : null}
      </span>
    </th>
  );
}

function InfluencerPanel({
  record,
  statusDefinitions,
  campaign,
  saving,
  saveError,
  canSyncGmail,
  onGmailSync,
  onClose,
  onSave,
}: {
  record: InfluencerRecord;
  statusDefinitions: StatusDefinition[];
  campaign: Campaign;
  saving: boolean;
  saveError: string | null;
  canSyncGmail: boolean;
  onGmailSync: (
    id: string,
    patch: Pick<InfluencerRecord, "lastContacted" | "lastUpdated" | "gmailThreads">
  ) => void;
  onClose: () => void;
  onSave: (row: InfluencerRecord) => void;
}) {
  const [form, setForm] = useState<InfluencerRecord>(record);
  const [syncingThreadId, setSyncingThreadId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  function setField<K extends keyof InfluencerRecord>(
    key: K,
    value: InfluencerRecord[K]
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setDeliverables(deliverables: CampaignDeliverable[]) {
    setForm((current) => ({ ...current, deliverables }));
  }

  async function syncGmailThread(thread: GmailThreadAttachment) {
    if (!form.id) return;
    if (!canSyncGmail) {
      setSyncError("Save this influencer before syncing Gmail.");
      return;
    }
    setSyncingThreadId(thread.id);
    setSyncError(null);
    try {
      const res = await fetch("/api/gmail/sync-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId: form.id, thread }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Failed to sync Gmail thread");
      const data = payload.data as Pick<
        InfluencerRecord,
        "lastContacted" | "lastUpdated" | "gmailThreads"
      >;
      setForm((current) => normalizeRecord({ ...current, ...data }));
      onGmailSync(form.id, data);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Failed to sync Gmail thread");
    } finally {
      setSyncingThreadId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label={record.creatorName ? "Edit influencer" : "Add influencer"}>
      <div className="flex h-full w-full max-w-5xl flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-(--border) px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">
              {record.creatorName ? "Edit Influencer" : "Add Influencer"}
            </h2>
            <p className="text-xs text-gray-400">
              {campaign.name} - Last Updated will be set to today when saved.
            </p>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Close influencer editor" className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <fieldset disabled={saving} className="min-w-0 flex-1 overflow-y-auto p-5 scroll-thin">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput
              label="Creator Name"
              value={form.creatorName}
              onChange={(v) => setField("creatorName", v)}
            />
            <FormInput
              label="Handle"
              value={form.handle}
              onChange={(v) => setField("handle", v)}
            />
            <FormSelect
              label="Platform"
              value={form.platform}
              onChange={(v) => setField("platform", v as Platform)}
              options={PLATFORMS}
            />
            <FormInput
              label="Follower Count"
              type="number"
              value={String(form.followerCount)}
              onChange={(v) => setField("followerCount", Number(v) || 0)}
            />
            <FormInput
              label="Engagement Rate"
              type="number"
              value={String(form.engagementRate)}
              onChange={(v) => setField("engagementRate", Number(v) || 0)}
            />
            <FormInput
              label="Negotiated Rate"
              type="number"
              value={String(form.negotiatedRate)}
              onChange={(v) => setField("negotiatedRate", Number(v) || 0)}
            />
            <FormSelect
              label="Rate Type"
              value={form.rateType}
              onChange={(v) => setField("rateType", v as RateType)}
              options={RATE_TYPES}
            />
            <FormInput
              label="Last Contacted"
              type="date"
              value={form.lastContacted}
              onChange={(v) => setField("lastContacted", v)}
            />
            <FormSelect
              label="Status"
              value={form.status}
              onChange={(v) => setField("status", v)}
              options={statusDefinitions.map((definition) => definition.label)}
            />
            <FormSelect
              label="Priority"
              value={form.priority || "Normal"}
              onChange={(v) => setField("priority", v)}
              options={PRIORITIES}
            />
            <FormInput
              label="Next Follow-up"
              type="date"
              value={form.nextFollowUp ?? ""}
              onChange={(v) => setField("nextFollowUp", v)}
            />
            <FormInput
              label="Deliverable Due"
              type="date"
              value={form.deliverableDue ?? ""}
              onChange={(v) => setField("deliverableDue", v)}
            />
          </div>

          <DeliverablesEditor
            segment={form.rateType === "Gifted" ? "seeding" : "paid"}
            deliverables={form.deliverables ?? []}
            onChange={setDeliverables}
          />

          <div className="mt-5 border-t border-(--border) pt-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <Archive size={13} /> Fulfillment Details
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormInput
                label="Address"
                value={form.address ?? ""}
                onChange={(v) => setField("address", v)}
              />
              <FormInput
                label="City"
                value={form.city ?? ""}
                onChange={(v) => setField("city", v)}
              />
              <FormInput
                label="State"
                value={form.state ?? ""}
                onChange={(v) => setField("state", v)}
              />
              <FormInput
                label="Zipcode"
                value={form.zipcode ?? ""}
                onChange={(v) => setField("zipcode", v)}
              />
              <FormInput
                label="Tracking #"
                value={form.trackingNumber ?? ""}
                onChange={(v) => setField("trackingNumber", v)}
              />
              <FormInput
                label="Shipped Date"
                type="date"
                value={form.shippedDate ?? ""}
                onChange={(v) => setField("shippedDate", v)}
              />
              <FormInput
                label="Delivery Status"
                value={form.deliveryStatus ?? ""}
                onChange={(v) => setField("deliveryStatus", v)}
              />
            </div>
          </div>

          <label className="mt-3 block text-xs font-medium text-gray-500">
            Notes
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              className="mt-1 h-24 w-full resize-none rounded-lg border border-(--border) px-3 py-2 text-sm outline-hidden focus:border-brand-400"
            />
          </label>

          <CreatorProfileSnapshot record={form} />

          <GmailThreadsEditor
            threads={form.gmailThreads}
            onChange={(threads) => setField("gmailThreads", threads)}
            onSyncThread={syncGmailThread}
            canAutoSync={canSyncGmail}
            syncingThreadId={syncingThreadId}
            syncError={syncError}
          />
        </fieldset>

        {saveError ? <p role="alert" className="mx-5 mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{saveError} Your draft is still here. Try saving again.</p> : null}
        <div className="flex justify-end gap-2 border-t border-(--border) px-5 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-(--border) px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.creatorName.trim() || !form.handle.trim()}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Influencer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreatorProfileSnapshot({ record }: { record: InfluencerRecord }) {
  const latest = latestThread(record.gmailThreads);
  return (
    <div className="mt-4 rounded-xl border border-(--border) bg-gray-50/70 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
        <UserRound size={13} /> Creator Profile
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <ProfileFact label="Followers" value={formatCompactNumber(record.followerCount)} />
        <ProfileFact label="Engagement" value={`${record.engagementRate}%`} />
        <ProfileFact label="Rate" value={formatCurrency(record.negotiatedRate)} />
        <ProfileFact label="Last Contacted" value={record.lastContacted ? formatDate(record.lastContacted) : "-"} />
        <ProfileFact label="Next Follow-up" value={record.nextFollowUp ? formatDate(record.nextFollowUp) : "-"} />
        <ProfileFact label="Deliverable Due" value={record.deliverableDue ? formatDate(record.deliverableDue) : "-"} />
      </div>
      {latest ? (
        <div className="mt-3 rounded-lg bg-white px-3 py-2 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Latest Gmail:</span>{" "}
          {latest.subject} {latest.lastSender ? `from ${latest.lastSender}` : ""}
        </div>
      ) : null}
      {record.statusHistory?.length ? (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-gray-500">Status history</div>
          <div className="space-y-1">
            {record.statusHistory.slice(-4).reverse().map((entry, index) => (
              <div key={`${entry}-${index}`} className="text-xs text-gray-500">
                {entry}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-gray-800">
        {value}
      </div>
    </div>
  );
}

function DeliverablesEditor({
  segment,
  deliverables,
  onChange,
}: {
  segment: TrackerSegment;
  deliverables: CampaignDeliverable[];
  onChange: (deliverables: CampaignDeliverable[]) => void;
}) {
  const rows = deliverables.length ? deliverables : [createBlankDeliverable()];
  const showPaidMetadata = segment !== "paid";

  function updateDeliverable<K extends keyof CampaignDeliverable>(
    index: number,
    key: K,
    value: CampaignDeliverable[K]
  ) {
    onChange(
      rows.map((deliverable, currentIndex) =>
        currentIndex === index
          ? normalizeDeliverable({ ...deliverable, [key]: value })
          : deliverable
      )
    );
  }

  function removeDeliverable(index: number) {
    const next = rows.filter((_, currentIndex) => currentIndex !== index);
    onChange(next.length ? next : [createBlankDeliverable()]);
  }

  return (
    <div className="mt-5 border-t border-(--border) pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
          <CalendarClock size={13} /> Deliverables
        </div>
        <button
          onClick={() => onChange([...rows, createBlankDeliverable()])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-(--border) px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Plus size={15} /> Add Video
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((deliverable, index) => (
          <div
            key={deliverable.id}
            className="rounded-xl border border-(--border) bg-gray-50/50 p-3"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-800">
                Video {index + 1}
              </div>
              <button
                onClick={() => removeDeliverable(index)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-white hover:text-rose-600"
                aria-label={`Remove video ${index + 1}`}
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className={`grid gap-3 ${showPaidMetadata ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
              <label className="block text-xs font-medium text-gray-500 lg:col-span-2">
                Final Link
                <input
                  value={deliverable.finalLink}
                  onChange={(event) =>
                    updateDeliverable(index, "finalLink", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-(--border) px-3 py-2 text-sm outline-hidden focus:border-brand-400"
                />
              </label>
              {showPaidMetadata ? (
                <>
                  <FormSelect
                    label="Concept"
                    value={deliverable.concept}
                    onChange={(value) => updateDeliverable(index, "concept", value)}
                    options={CONCEPT_OPTIONS}
                  />
                  <FormSelect
                    label="Source"
                    value={deliverable.source}
                    onChange={(value) => updateDeliverable(index, "source", value)}
                    options={SOURCE_OPTIONS}
                  />
                </>
              ) : null}
              <FormSelect
                label="Video Quality"
                value={deliverable.videoQuality}
                onChange={(value) => updateDeliverable(index, "videoQuality", value)}
                options={VIDEO_QUALITY_OPTIONS}
              />
              <FormInput
                label="Posted Date"
                type="date"
                value={deliverable.date}
                onChange={(value) => updateDeliverable(index, "date", value)}
              />
              <label className="flex items-center gap-2 self-end rounded-lg border border-(--border) bg-white px-3 py-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={deliverable.story}
                  onChange={(event) =>
                    updateDeliverable(index, "story", event.target.checked)
                  }
                  className="h-4 w-4 rounded-sm border-gray-300 text-brand-600 focus:ring-brand-400"
                />
                Story
              </label>
              <label className="flex items-center gap-2 self-end rounded-lg border border-(--border) bg-white px-3 py-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={deliverable.usageRights}
                  onChange={(event) =>
                    updateDeliverable(index, "usageRights", event.target.checked)
                  }
                  className="h-4 w-4 rounded-sm border-gray-300 text-brand-600 focus:ring-brand-400"
                />
                Usage Rights
              </label>
              <label className="block text-xs font-medium text-gray-500 lg:col-span-4">
                Notes
                <input
                  value={deliverable.notes}
                  onChange={(event) =>
                    updateDeliverable(index, "notes", event.target.value)
                  }
                  className="mt-1 w-full rounded-lg border border-(--border) px-3 py-2 text-sm outline-hidden focus:border-brand-400"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GmailThreadsEditor({
  threads,
  onChange,
  onSyncThread,
  canAutoSync,
  syncingThreadId,
  syncError,
}: {
  threads: GmailThreadAttachment[];
  onChange: (threads: GmailThreadAttachment[]) => void;
  onSyncThread?: (thread: GmailThreadAttachment) => Promise<void>;
  canAutoSync?: boolean;
  syncingThreadId?: string | null;
  syncError?: string | null;
}) {
  const [draft, setDraft] = useState<GmailThreadAttachment>(emptyThread);

  function setDraftField<K extends keyof GmailThreadAttachment>(
    key: K,
    value: GmailThreadAttachment[K]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function addThread() {
    if (!draft.url.trim() && !draft.subject.trim()) return;
    const nextThread = {
      ...draft,
      id: makeId(),
      subject: draft.subject.trim() || "Gmail thread",
      url: draft.url.trim(),
      notes: draft.notes.trim(),
    };
    onChange([
      ...threads,
      nextThread,
    ]);
    setDraft(emptyThread);
    if (canAutoSync && onSyncThread && nextThread.url.trim()) {
      void onSyncThread(nextThread);
    }
  }

  return (
    <div className="mt-5 border-t border-(--border) pt-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
        <Mail size={13} /> Gmail Threads
      </div>

      {threads.length > 0 && (
        <div className="mb-3 space-y-2">
          {threads.map((thread) => (
            <div
              key={thread.id}
              className="flex items-start gap-2 rounded-lg border border-(--border) px-3 py-2"
            >
              <Mail size={14} className="mt-0.5 shrink-0 text-sky-600" />
              <div className="min-w-0 flex-1">
                <a
                  href={thread.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium text-sky-700 hover:underline"
                >
                  {thread.subject}
                </a>
                <div className="text-xs text-gray-400">
                  {thread.lastMessageAt ? formatDate(thread.lastMessageAt) : "No date"}
                </div>
                {thread.lastSender ? (
                  <div className="mt-1 truncate text-xs text-gray-400">
                    {thread.lastSender}
                  </div>
                ) : null}
                {thread.notes ? (
                  <div className="mt-1 text-xs text-gray-500">{thread.notes}</div>
                ) : null}
              </div>
              {onSyncThread ? (
                <button
                  onClick={() => onSyncThread(thread)}
                  disabled={syncingThreadId === thread.id}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-sky-700 disabled:opacity-50"
                  aria-label={`Sync ${thread.subject}`}
                >
                  <RefreshCw
                    size={14}
                    className={syncingThreadId === thread.id ? "animate-spin" : ""}
                  />
                </button>
              ) : null}
              <button
                onClick={() =>
                  onChange(threads.filter((item) => item.id !== thread.id))
                }
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-rose-600"
                aria-label={`Remove ${thread.subject}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {syncError ? (
        <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {syncError}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <FormInput
          label="Gmail Thread URL"
          value={draft.url}
          onChange={(v) => setDraftField("url", v)}
        />
        <FormInput
          label="Subject"
          value={draft.subject}
          onChange={(v) => setDraftField("subject", v)}
        />
        <FormInput
          label="Last Message"
          type="date"
          value={draft.lastMessageAt}
          onChange={(v) => setDraftField("lastMessageAt", v)}
        />
        <label className="block text-xs font-medium text-gray-500">
          Thread Notes
          <textarea
            value={draft.notes}
            onChange={(e) => setDraftField("notes", e.target.value)}
            className="mt-1 h-10 w-full resize-none rounded-lg border border-(--border) px-3 py-2 text-sm outline-hidden focus:border-brand-400"
          />
        </label>
      </div>
      <button
        onClick={addThread}
        disabled={!draft.url.trim() && !draft.subject.trim()}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-(--border) px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <Plus size={15} /> Attach Thread
      </button>
    </div>
  );
}

function CollectionImportPanel({
  selectedCampaignName,
  onClose,
  onImport,
}: {
  selectedCampaignName: string;
  onClose: () => void;
  onImport: (source: CollectionNode, retryRecords?: InfluencerRecord[]) => Promise<BatchSaveResult<InfluencerRecord>>;
}) {
  const { data, loading, error: loadError, reload } = useApi<{ data: CollectionNode[] }>("/api/collections");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<{ source: CollectionNode; succeeded: number; failures: BatchSaveResult<InfluencerRecord>["failures"] } | null>(null);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const collections = useMemo(() => flattenCollections(data?.data ?? []), [data]);

  async function handleImport(source: CollectionNode, retryRecords?: InfluencerRecord[]) {
    if (busyId) return;
    setBusyId(source.id);
    setError(null);
    try {
      const result = await onImport(source, retryRecords);
      if (!mounted.current) return;
      setReport((previous) => ({
        source,
        succeeded: (retryRecords ? previous?.succeeded ?? 0 : 0) + result.succeeded.length,
        failures: result.failures,
      }));
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Import from collection">
      <div className="flex max-h-[82vh] w-full max-w-xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-(--border) px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Import from Collection</h2>
            <p className="text-xs text-gray-400">
              Creators represented by the collection videos will be added to {selectedCampaignName}.
            </p>
          </div>
          <button onClick={onClose} disabled={busyId !== null} aria-label="Close collection import" className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scroll-thin">
          {loadError ? <ReadError message={`Collections could not be loaded. ${loadError}`} onRetry={reload} /> : loading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-12 w-full" />
              ))}
            </div>
          ) : collections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-(--border) p-4 text-sm text-gray-400">
              No collections are available to import from.
            </div>
          ) : (
            <div className="space-y-2">
              {collections.map(({ node, depth }) => (
                <div
                  key={node.id}
                  className="flex items-center gap-3 rounded-lg border border-(--border) px-3 py-2"
                >
                  <div className="min-w-0 flex-1" style={{ paddingLeft: depth * 12 }}>
                    <div className="truncate text-sm font-medium text-gray-800">
                      {node.name}
                    </div>
                    <div className="text-xs text-gray-400">
                      {node.accountCount || node.videoCount} creators - {node.videoCount} videos
                    </div>
                  </div>
                  <button
                    onClick={() => handleImport(node)}
                    disabled={busyId !== null}
                    className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                  >
                    {busyId === node.id ? "Importing..." : "Import"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {report ? (
            <div className="mt-3 rounded-lg border border-(--border) bg-gray-50 p-3 text-sm" aria-live="polite">
              <p>{report.succeeded} saved; {report.failures.length} failed from {report.source.name}.</p>
              {report.failures.map((failure) => <p key={failure.record.id} className="mt-1 text-xs text-rose-700">{failure.record.creatorName || failure.record.handle}: {failure.error}</p>)}
              {report.failures.length > 0 ? <button type="button" disabled={busyId !== null} className="mt-2 rounded-lg border border-(--border) bg-white px-3 py-2 disabled:opacity-50" onClick={() => { void handleImport(report.source, report.failures.map((failure) => failure.record)); }}>Retry failed records</button> : null}
            </div>
          ) : null}
          {error && (
            <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">
              {error}
            </p>
          )}
          <button type="button" disabled={busyId !== null} onClick={onClose} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busyId ? "Importing..." : "Done"}</button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-(--border) bg-white px-3 py-2 text-sm outline-hidden focus:border-brand-400"
    >
      {children}
    </select>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-xs font-medium text-gray-500">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-(--border) px-3 py-2 text-sm outline-hidden focus:border-brand-400"
      />
    </label>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block text-xs font-medium text-gray-500">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-(--border) bg-white px-3 py-2 text-sm outline-hidden focus:border-brand-400"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function normalizeRecord(record: InfluencerRecord): InfluencerRecord {
  const handle = normalizeHandle(record.handle);
  const isPaid = record.rateType !== "Gifted";
  const deliverables = sanitizeDeliverables(record.deliverables);
  const fallbackDeliverable = deliverableFromRecord(record);
  const normalizedDeliverables =
    deliverables.length > 0
      ? mergeRowVideoFlags(deliverables, record)
      : hasDeliverableValue(fallbackDeliverable)
        ? [fallbackDeliverable]
        : [];
  const visibleDeliverables = isPaid
    ? normalizedDeliverables.map(stripPaidDeliverableMetadata).filter(hasDeliverableValue)
    : normalizedDeliverables;
  const primaryDeliverable = visibleDeliverables[0];
  const campaignIds = mergeUnique(record.campaignIds ?? [], [
    ...((record.campaignNames ?? [])
      .map(legacyCampaignIdFromName)
      .filter(Boolean) as string[]),
  ]);
  return {
    ...record,
    handle,
    profile: record.profile || handle,
    name: record.name || record.creatorName,
    source: isPaid
      ? ""
      : normalizeExternalVendorLabel(
          primaryDeliverable?.source || record.source || record.category
        ),
    concept: isPaid ? "" : primaryDeliverable?.concept || record.concept || record.category,
    date: primaryDeliverable?.date || record.date || "",
    finalLink: primaryDeliverable?.finalLink ?? record.finalLink ?? "",
    views: primaryDeliverable?.views ?? record.views,
    likes: primaryDeliverable?.likes ?? record.likes,
    comments: primaryDeliverable?.comments ?? record.comments,
    saves: primaryDeliverable?.saves ?? record.saves,
    shares: primaryDeliverable?.shares ?? record.shares,
    address: record.address ?? "",
    city: record.city ?? "",
    state: record.state ?? "",
    zipcode: record.zipcode ?? "",
    trackingNumber: record.trackingNumber ?? "",
    shippedDate: record.shippedDate ?? "",
    shipped: booleanTrackerValue(record.shipped),
    delivered: booleanTrackerValue(record.delivered),
    received: booleanTrackerValue(record.received),
    deliveryStatus: record.deliveryStatus ?? "",
    byouId: record.byouId ?? "",
    managedBy: normalizeExternalVendorLabel(record.managedBy ?? ""),
    email: record.email ?? "",
    story: primaryDeliverable?.story ?? booleanTrackerValue(record.story),
    usageRights: primaryDeliverable?.usageRights ?? booleanTrackerValue(record.usageRights),
    lastCheckIn: record.lastCheckIn ?? "",
    videoQuality: primaryDeliverable?.videoQuality || normalizeVideoQuality(record.videoQuality ?? ""),
    nextFollowUp: record.nextFollowUp ?? "",
    deliverableDue: record.deliverableDue ?? "",
    priority: record.priority || "Normal",
    statusHistory: Array.isArray(record.statusHistory)
      ? record.statusHistory.filter((entry): entry is string => typeof entry === "string")
      : [],
    deliverables: visibleDeliverables,
    followerCount: Number(record.followerCount) || 0,
    engagementRate: Number(record.engagementRate) || 0,
    negotiatedRate: Number(record.negotiatedRate) || 0,
    status: normalizeStatus(record.status),
    campaignIds,
    subcategoryIds: record.subcategoryIds ?? [],
    gmailThreads: (record.gmailThreads ?? []).map(normalizeGmailThread),
  };
}

function isInCampaignSegment(
  row: InfluencerRecord,
  segment: CampaignSegment
) {
  if (segment === "all") return true;
  if (segment === "seeding") return row.rateType === "Gifted";
  if (segment === "paid") return row.rateType !== "Gifted";
  const subcategoryId = customSegmentId(segment);
  return Boolean(subcategoryId && row.subcategoryIds?.includes(subcategoryId));
}

function segmentLabel(segment: CampaignSegment, campaign?: Campaign | null) {
  if (segment === "seeding") return "Seeding";
  if (segment === "paid") return "Paid";
  const subcategoryId = customSegmentId(segment);
  if (subcategoryId) {
    return (
      campaign?.subcategories.find((subcategory) => subcategory.id === subcategoryId)
        ?.name ?? "Subcategory"
    );
  }
  return "All";
}

function getCampaignTrackerKind(
  campaign: Campaign | null,
  segment: CampaignSegment
): CampaignTrackerKind {
  if (segment === "paid") return "paid";
  if (segment === "seeding" || segment === "all") return "seeding";
  const subcategoryId = customSegmentId(segment);
  return (
    campaign?.subcategories.find((subcategory) => subcategory.id === subcategoryId)
      ?.trackerKind ?? "seeding"
  );
}

function customSegmentId(segment: CampaignSegment) {
  return segment.startsWith("custom:") ? segment.slice("custom:".length) : null;
}

function normalizeGmailThread(thread: GmailThreadAttachment): GmailThreadAttachment {
  return {
    id: thread.id || makeId(),
    subject: thread.subject || "Gmail thread",
    url: thread.url || "",
    lastMessageAt: thread.lastMessageAt || todayIso(),
    notes: thread.notes || "",
    gmailThreadId: thread.gmailThreadId || "",
    syncedAt: thread.syncedAt || "",
    lastSender: thread.lastSender || "",
  };
}

function normalizeHandle(handle: string) {
  const trimmed = String(handle ?? "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

function legacyCampaignIdFromName(_name: string) { return ''; }

function normalizeStatus(status: string) {
  const legacy: Record<string, string> = {
    Active: "Posted",
    "In Negotiation": "Open",
    Blacklisted: "Open",
    Sourcing: "Open",
    Contacted: "Open",
    Negotiating: "Open",
    "Contract Sent": "Open",
    "Content Pending": "Open",
    Paid: "Open",
    Inactive: "Open",
    "Do Not Book": "Open",
  };
  return legacy[status] ?? status ?? "Open";
}

function mergeStatusDefinitions(
  definitions: StatusDefinition[],
  records: InfluencerRecord[]
) {
  const dedupedDefinitions = dedupeStatusDefinitions(definitions);
  const known = new Set(
    dedupedDefinitions.map((definition) => definition.label.trim().toLowerCase())
  );
  const used = Array.from(new Set(records.map((record) => record.status)))
    .map((label) => label.trim())
    .filter((label) => label && !known.has(label.toLowerCase()))
    .map((label) => ({
      id: makeStatusId(label, dedupedDefinitions),
      label,
      color: "gray" as const,
    }));
  return dedupeStatusDefinitions([...dedupedDefinitions, ...used]);
}

function dedupeStatusDefinitions(definitions: StatusDefinition[]) {
  const byLabel = new Map<string, StatusDefinition>();
  for (const definition of definitions) {
    const label = definition.label.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (byLabel.has(key)) continue;
    byLabel.set(key, { ...definition, label });
  }
  return Array.from(byLabel.values());
}

function getStatusClasses(status: string, definitions: StatusDefinition[]) {
  const match = definitions.find((definition) => definition.label === status);
  return STATUS_BADGES[match?.color ?? "gray"];
}

function isStatusDefinition(value: StatusDefinition) {
  return (
    typeof value?.id === "string" &&
    typeof value?.label === "string" &&
    value.label.trim().length > 0 &&
    value.color in STATUS_BADGES
  );
}

function mergeUnique<T>(current: T[], next: T[]) {
  return Array.from(new Set([...current, ...next].filter(Boolean)));
}

function flattenCollections(
  nodes: CollectionNode[],
  depth = 0
): { node: CollectionNode; depth: number }[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenCollections(node.children, depth + 1),
  ]);
}

async function loadCollectionMembers(source: CollectionNode) {
  const nodes = flattenCollections([source]).map((entry) => entry.node);
  const responses = await Promise.all(
    nodes.map(async (node) => {
      const res = await fetch(`/api/collections/${node.id}/items`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to import ${node.name}`);
      }
      const json = (await res.json()) as { data: { accounts: CollectionMember[] } };
      return json.data.accounts;
    })
  );
  const byId = new Map<string, CollectionMember>();
  for (const account of responses.flat()) byId.set(account.id, account);
  return Array.from(byId.values());
}

function memberToInfluencer(
  member: CollectionMember,
  campaign: Campaign,
  sourceName: string,
  trackerKind: CampaignTrackerKind,
  subcategoryId: string | null
): InfluencerRecord {
  const handle = normalizeHandle(member.handle);
  const seed = hashString(handle);
  return normalizeRecord({
    id: `import-${member.id}-${campaign.id}`,
    creatorName: member.displayName || handle.replace("@", ""),
    handle,
    platform: toDashboardPlatform(member.platform),
    category: sourceName,
    followerCount: 50000 + (seed % 450000),
    engagementRate: Number((2.5 + (seed % 72) / 10).toFixed(1)),
    negotiatedRate: 0,
    rateType: trackerKind === "seeding" ? "Gifted" : "Flat",
    lastContacted: todayIso(),
    lastUpdated: todayIso(),
    status: "Open",
    notes: "",
    campaignIds: [campaign.id],
    campaignNames: [campaign.name],
    subcategoryIds: subcategoryId ? [subcategoryId] : [],
    gmailThreads: [],
  });
}

function mergeImportedInfluencers(
  current: InfluencerRecord[],
  imported: InfluencerRecord[]
) {
  const byHandle = new Map(
    current.map((row) => [row.handle.toLowerCase(), normalizeRecord(row)])
  );
  for (const incoming of imported) {
    const key = incoming.handle.toLowerCase();
    const existing = byHandle.get(key);
    if (!existing) {
      byHandle.set(key, incoming);
      continue;
    }
    byHandle.set(key, {
      ...existing,
      campaignIds: mergeUnique(existing.campaignIds, incoming.campaignIds),
      subcategoryIds: mergeUnique(
        existing.subcategoryIds ?? [],
        incoming.subcategoryIds ?? []
      ),
      category: existing.category || incoming.category,
      notes: existing.notes || incoming.notes,
      gmailThreads: existing.gmailThreads,
      lastUpdated: todayIso(),
    });
  }
  return Array.from(byHandle.values());
}

function toDashboardPlatform(platform: string): Platform {
  const normalized = platform.toLowerCase();
  if (normalized === "instagram") return "Instagram";
  if (normalized === "youtube") return "YouTube";
  if (normalized === "facebook") return "Facebook";
  if (normalized === "snapchat") return "Snapchat";
  if (normalized === "x") return "X";
  return "TikTok";
}

function compareRows(
  a: InfluencerRecord,
  b: InfluencerRecord,
  key: SortKey,
  dir: SortDir
) {
  const left = a[key];
  const right = b[key];
  let result = 0;
  if (typeof left === "number" && typeof right === "number") {
    result = left - right;
  } else {
    result = String(left).localeCompare(String(right));
  }
  return dir === "asc" ? result : -result;
}

function buildStatusHistory(
  record: InfluencerRecord,
  nextStatus: string | undefined
) {
  if (!nextStatus || nextStatus === record.status) {
    return record.statusHistory ?? [];
  }
  return [
    ...(record.statusHistory ?? []),
    `${todayIso()}: ${record.status || "Open"} -> ${nextStatus}`,
  ].slice(-12);
}

function latestThread(threads: GmailThreadAttachment[]) {
  return [...threads]
    .filter((thread) => thread.subject || thread.url)
    .sort((a, b) => String(b.lastMessageAt).localeCompare(String(a.lastMessageAt)))[0];
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isStale(date: string) {
  const ms = Date.now() - new Date(`${date}T00:00:00`).getTime();
  return ms > 30 * 86_400_000;
}

function isDue(date?: string) {
  if (!date) return false;
  const target = new Date(`${date}T23:59:59`).getTime();
  return Number.isFinite(target) && target <= Date.now();
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeStatusId(label: string, existing: StatusDefinition[]) {
  const base = slugify(label) || "status";
  let next = base;
  let index = 2;
  const ids = new Set(existing.map((item) => item.id));
  while (ids.has(next)) {
    next = `${base}-${index}`;
    index += 1;
  }
  return next;
}

function sameText(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function csvTrackerSection(
  title: string,
  segment: TrackerSegment,
  rows: InfluencerRecord[]
) {
  const columns = getTrackerColumns(segment);
  const groups = groupInfluencerRows(rows, segment);
  const includeDeliverableMetadata = segment !== "paid";
  const deliverableColumns = [
    "Deliverable #",
    "Deliverable Final Link",
    ...(includeDeliverableMetadata
      ? ["Deliverable Concept", "Deliverable Source"]
      : []),
    "Deliverable Video Quality",
    "Deliverable Posted Date",
    "Deliverable Views",
    "Deliverable Likes",
    "Deliverable Comments",
    "Deliverable Saves",
    "Deliverable Shares",
    "Deliverable Story",
    "Deliverable Notes",
  ];
  return [
    csvCell(title),
    [...columns.map((column) => column.label), ...deliverableColumns]
      .map(csvCell)
      .join(","),
    ...groups.flatMap((group) =>
      group.deliverables.map((deliverable, index) => {
        const row = deliverable.row;
        return [
          ...columns.map((column) => trackerCellValue(row, column)),
          index + 1,
          deliverable.finalLink,
          ...(includeDeliverableMetadata
            ? [deliverable.concept, deliverable.source]
            : []),
          deliverable.videoQuality,
          deliverable.date,
          deliverable.views ?? "",
          deliverable.likes ?? "",
          deliverable.comments ?? "",
          deliverable.saves ?? "",
          deliverable.shares ?? "",
          deliverable.story,
          deliverable.notes,
        ]
          .map(csvCell)
          .join(",");
      })
    ),
  ].join("\n");
}

function csvCell(value: string | number | boolean) { return safeCsvCell(String(value)); }
