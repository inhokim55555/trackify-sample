"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  FileUp,
  FolderOpen,
  Link2,
  Loader2,
  X,
} from "lucide-react";
import { useApi } from "@/lib/useApi";
import type { CollectionNode } from "@/app/api/collections/route";

type ImportProgressStatus =
  | "queued"
  | "importing"
  | "imported"
  | "already_tracked"
  | "failed";

interface ImportProgressRow {
  url: string;
  status: ImportProgressStatus;
  source?: string;
  error?: string;
}

interface ImportBatch {
  urls: string[];
  concurrency: number;
}

interface ImportApiItem {
  inputUrl?: string;
  videoUrl?: string;
  status?: unknown;
  source?: unknown;
  error?: unknown;
}

interface ImportBatchResult {
  imported: number;
  alreadyTracked: number;
  failures: string[];
  sources: string[];
}

const DEFAULT_IMPORT_CHUNK_SIZE = 10;
const DEFAULT_IMPORT_CONCURRENCY = 4;
const INSTAGRAM_IMPORT_CHUNK_SIZE = 1;
const INSTAGRAM_IMPORT_CONCURRENCY = 1;

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s,"']+/g) ?? [];
  return Array.from(new Set(matches.map((url) => url.trim())));
}

function invalidUrlLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/https?:\/\/[^\s,"']+/.test(line));
}

function flattenCollections(
  nodes: CollectionNode[],
  depth = 0
): { id: string; label: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${"  ".repeat(depth)}${node.name}` },
    ...flattenCollections(node.children, depth + 1),
  ]);
}

interface TrackDialogProps {
  open: boolean;
  collectionId?: string | null;
  onClose: () => void;
  onDone: () => void;
}

export function TrackDialog({ open, ...props }: TrackDialogProps) {
  // Keep pasted URLs when closing and reopening; results belong to one open session.
  const [input, setInput] = useState("");
  if (!open) return null;
  return <TrackDialogSession key={props.collectionId ?? ""} {...props} input={input} setInput={setInput} />;
}

function TrackDialogSession({ collectionId, onClose, onDone, input, setInput }: Omit<TrackDialogProps, "open"> & {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [progressRows, setProgressRows] = useState<ImportProgressRow[]>([]);
  const [destinationId, setDestinationId] = useState<string>(() => collectionId ?? "");
  const [cancelPending, setCancelPending] = useState(false);
  const cancelRequested = useRef(false);
  const mounted = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const collections = useApi<{ data: CollectionNode[] }>(
    "/api/collections"
  );
  const flatCollections = useMemo(
    () => flattenCollections(collections.data?.data ?? []),
    [collections.data]
  );

  const urls = useMemo(() => extractUrls(input), [input]);
  const invalidLines = useMemo(() => invalidUrlLines(input), [input]);
  const completedCount = progressRows.filter((row) =>
    ["imported", "already_tracked", "failed"].includes(row.status)
  ).length;
  const progressPercent =
    progressRows.length > 0
      ? Math.round((completedCount / progressRows.length) * 100)
      : 0;

  useEffect(() => {
    mounted.current = true;
    cancelRequested.current = false;
    textareaRef.current?.focus();
    return () => {
      mounted.current = false;
      cancelRequested.current = true;
    };
  }, []);

  // Escape closes when idle (never mid-import).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onClose]);

  function setRowStatuses(
    targets: string[],
    status: ImportProgressStatus,
    patch?: Partial<ImportProgressRow>
  ) {
    if (!mounted.current) return;
    const targetSet = new Set(targets);
    setProgressRows((current) =>
      current.map((row) =>
        targetSet.has(row.url) ? { ...row, status, ...patch } : row
      )
    );
  }

  async function submit(targetUrls = urls) {
    if (submitting) return;
    if (targetUrls.length === 0) {
      setError(
        input.trim()
          ? "No valid video links were found. Paste a full TikTok, Instagram, YouTube, Facebook, Snapchat, or X URL."
          : "Paste at least one video link."
      );
      return;
    }
    setSubmitting(true);
    setFinished(false);
    setError(null);
    setResult(null);
    cancelRequested.current = false;
    setCancelPending(false);
    setProgressRows(targetUrls.map((url) => ({ url, status: "queued" })));

    let imported = 0;
    let alreadyTracked = 0;
    const failures: string[] = [];
    const sources: string[] = [];
    let cancelledEarly = false;

    for (const batch of buildImportBatches(targetUrls)) {
      if (cancelRequested.current) {
        cancelledEarly = true;
        break;
      }

      const batchResult = await importBatch(batch, true);
      if (!mounted.current) return;
      imported += batchResult.imported;
      alreadyTracked += batchResult.alreadyTracked;
      failures.push(...batchResult.failures);
      sources.push(...batchResult.sources);
    }

    if (failures.length) {
      const visibleFailures = failures.slice(0, 3).join(" | ");
      const remaining =
        failures.length > 3 ? ` | +${failures.length - 3} more` : "";
      setError(
        `${failures.length} import${failures.length === 1 ? "" : "s"} failed. ${visibleFailures}${remaining}`
      );
    }
    if (imported > 0 || alreadyTracked > 0) {
      setResult(
        [
          imported > 0
            ? `Imported ${imported} video${imported === 1 ? "" : "s"} via ${formatSources(sources)}`
            : "",
          alreadyTracked > 0 ? `${alreadyTracked} already tracked` : "",
          cancelledEarly ? "import cancelled before finishing" : "",
        ]
          .filter(Boolean)
          .join("; ") + "."
      );
      onDone();
    } else if (cancelledEarly) {
      setResult("Import cancelled.");
    }

    setSubmitting(false);
    setFinished(true);
  }

  async function importBatch(
    batch: ImportBatch,
    retryIndividually: boolean
  ): Promise<ImportBatchResult> {
    if (!mounted.current) return { imported: 0, alreadyTracked: 0, failures: [], sources: [] };
    setRowStatuses(batch.urls, "importing", { error: undefined });

    try {
      const items = await requestImport(batch.urls, batch.concurrency);
      if (!mounted.current) return { imported: 0, alreadyTracked: 0, failures: [], sources: [] };
      return applyImportItems(batch.urls, items);
    } catch (e: unknown) {
      if (retryIndividually && batch.urls.length > 1) {
        return combineBatchResults(
          await serialMap(batch.urls, (url) =>
            importBatch(
              { urls: [url], concurrency: INSTAGRAM_IMPORT_CONCURRENCY },
              false
            )
          )
        );
      }

      const message = importErrorMessage(e);
      setRowStatuses(batch.urls, "failed", { error: message });
      return {
        imported: 0,
        alreadyTracked: 0,
        failures: batch.urls.map((url) => `${url}: ${message}`),
        sources: [],
      };
    }
  }

  async function requestImport(urlBatch: string[], concurrency: number) {
    const res = await fetch("/api/track/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoUrls: urlBatch,
        collectionId: destinationId || undefined,
        concurrency,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(apiErrorMessage(json) || `Request failed (${res.status})`);
    }
    return Array.isArray(json?.data?.items)
      ? (json.data.items as ImportApiItem[])
      : [];
  }

  function applyImportItems(
    urlBatch: string[],
    items: ImportApiItem[]
  ): ImportBatchResult {
    const byInputUrl = new Map(
      items.flatMap((item) => {
        const keys = [item.inputUrl, item.videoUrl].filter(
          (value): value is string => typeof value === "string" && value.length > 0
        );
        return keys.map((key) => [key, item] as const);
      })
    );
    const result: ImportBatchResult = {
      imported: 0,
      alreadyTracked: 0,
      failures: [],
      sources: [],
    };
    const rowUpdates = new Map<string, Partial<ImportProgressRow>>();

    for (const url of urlBatch) {
      const item = byInputUrl.get(url);
      if (!item) {
        result.failures.push(`${url}: No result returned`);
        rowUpdates.set(url, { status: "failed", error: "No result returned" });
        continue;
      }

      const status = normalizeImportStatus(item.status);
      const source = typeof item.source === "string" ? item.source : undefined;
      const error = typeof item.error === "string" ? item.error : undefined;

      if (status === "imported") {
        result.imported += 1;
        if (source) result.sources.push(source);
      } else if (status === "already_tracked") {
        result.alreadyTracked += 1;
      } else {
        result.failures.push(`${url}: ${error || "Request failed"}`);
      }

      rowUpdates.set(url, {
        status,
        source,
        error,
      });
    }

    setProgressRows((current) =>
      current.map((row) => {
        const update = rowUpdates.get(row.url);
        return update ? { ...row, ...update } : row;
      })
    );

    return result;
  }

  async function handleCsv(file: File | null) {
    if (!file) return;
    const text = await file.text();
    if (!mounted.current) return;
    const found = extractUrls(text);
    setInput((current) =>
      [current.trim(), found.join("\n")].filter(Boolean).join("\n")
    );
  }

  function handleInputChange(value: string) {
    setInput(value);
    if (!submitting) {
      setProgressRows([]);
      setResult(null);
      setError(null);
      setFinished(false);
    }
  }

  function startNewImport() {
    setInput("");
    setProgressRows([]);
    setResult(null);
    setError(null);
    setFinished(false);
    textareaRef.current?.focus();
  }

  const destinationName =
    flatCollections.find((c) => c.id === destinationId)?.label.trim() ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Import posts"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-(--border) px-5 py-3">
          <div>
            <h3 className="font-display text-base font-semibold">Import Posts</h3>
            <p className="text-xs text-gray-500">
              Paste one link, multiple links, or upload a CSV containing URLs.
              Videos and photo carousels are tracked as individual posts.
            </p>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            aria-label="Close import dialog"
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-(--border) px-4 py-3 text-sm text-gray-600 hover:bg-gray-50">
              <FileUp size={16} />
              Upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleCsv(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
              <Link2 size={14} />
              {urls.length} URL{urls.length === 1 ? "" : "s"} detected
            </div>
          </div>

          <div className="mb-3">
            <label
              htmlFor="track-destination"
              className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600"
            >
              <FolderOpen size={13} className="text-gray-400" />
              Destination collection
            </label>
            <select
              id="track-destination"
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              disabled={submitting}
              className="w-full rounded-lg border border-(--border) bg-white px-3 py-2 text-sm outline-hidden focus:border-brand-400 disabled:opacity-60"
            >
              <option value="">No collection (just track)</option>
              {flatCollections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.label}
                </option>
              ))}
            </select>
          </div>

          <p className="mb-3 text-xs text-gray-500">
            TikTok and Instagram photo carousels can be submitted as full post links. If SocialCrawl reports a temporary failure, wait at least 30 seconds before retrying. Available metrics depend on what the platform exposes.
          </p>

          <label
            htmlFor="track-urls"
            className="mb-1 block text-xs font-medium text-gray-600"
          >
            Post URLs
          </label>
          <textarea
            id="track-urls"
            ref={textareaRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            disabled={submitting}
            placeholder={
              "https://www.tiktok.com/@creator/video/123...\nhttps://www.instagram.com/reel/abc..."
            }
            className="h-36 w-full resize-none rounded-lg border border-(--border) px-3 py-2 text-sm outline-hidden focus:border-brand-400 disabled:bg-gray-50"
          />

          {invalidLines.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <div className="font-medium">
                {invalidLines.length} line{invalidLines.length === 1 ? "" : "s"}{" "}
                will be skipped.
              </div>
              <div className="mt-1 space-y-0.5">
                {invalidLines.slice(0, 4).map((line, index) => (
                  <div key={`${line}-${index}`} className="truncate">
                    {line}
                  </div>
                ))}
                {invalidLines.length > 4 ? (
                  <div>+{invalidLines.length - 4} more invalid lines</div>
                ) : null}
              </div>
            </div>
          )}

          {progressRows.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-(--border)">
              <div className="flex items-center justify-between border-b border-(--border) bg-gray-50 px-3 py-2">
                <div className="text-xs font-semibold text-gray-600">
                  Import progress
                </div>
                <div className="text-xs text-gray-500">
                  {completedCount}/{progressRows.length} complete
                </div>
              </div>
              <div className="h-1 bg-gray-100">
                <div
                  className="h-full bg-brand-600 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="max-h-44 overflow-y-auto scroll-thin">
                {progressRows.map((row) => (
                  <div
                    key={row.url}
                    className="flex items-start gap-2 border-b border-(--border) px-3 py-2 last:border-0"
                  >
                    <span className="mt-0.5 shrink-0">
                      {progressIcon(row.status)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-gray-600">
                        {row.url}
                      </div>
                      <div className={progressStatusClass(row.status)}>
                        {progressStatusLabel(row)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </p>
          )}
          {result && (
            <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {result}
              {destinationName && !error ? ` Added to ${destinationName}.` : ""}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-(--border) px-5 py-3">
          {submitting ? (
            <button
              onClick={() => {
                cancelRequested.current = true;
                setCancelPending(true);
              }}
              className="rounded-lg border border-(--border) px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              {cancelPending
                ? "Stopping after this batch..."
                : "Cancel import"}
            </button>
          ) : finished ? (
            <>
              {progressRows.some((row) => row.status === "failed") && (
                <button onClick={() => submit(progressRows.filter((row) => row.status === "failed").map((row) => row.url))}
                  className="rounded-lg border border-(--border) px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  Retry failed posts
                </button>
              )}
              <button
                onClick={startNewImport}
                className="rounded-lg border border-(--border) px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Import more
              </button>
              <button
                onClick={onClose}
                className="rounded-full bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="rounded-lg border border-(--border) px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => submit()}
                disabled={urls.length === 0}
                className="rounded-full bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Import {urls.length} Post{urls.length === 1 ? "" : "s"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSources(sources: string[]) {
  const unique = Array.from(
    new Set(sources.map((source) => source.toLowerCase()))
  );
  if (unique.length === 0) return "configured source";
  return unique.map(formatSourceName).join(" + ");
}

function formatSourceName(source: string) {
  if (source === "socialcrawl") return "SocialCrawl";
  if (source === "apify") return "Apify";
  if (source === "youtube") return "YouTube";
  if (source === "mock") return "Mock";
  return source;
}

function buildImportBatches(urls: string[]): ImportBatch[] {
  const batches: ImportBatch[] = [];
  let index = 0;

  while (index < urls.length) {
    const settings = importSettings(urls[index]);
    const batchUrls: string[] = [];

    while (
      index < urls.length &&
      batchUrls.length < settings.chunkSize &&
      isSameImportLane(urls[index], settings)
    ) {
      batchUrls.push(urls[index]);
      index += 1;
    }

    batches.push({
      urls: batchUrls,
      concurrency: settings.concurrency,
    });
  }

  return batches;
}

function importSettings(url: string) {
  if (isInstagramUrl(url)) {
    return {
      chunkSize: INSTAGRAM_IMPORT_CHUNK_SIZE,
      concurrency: INSTAGRAM_IMPORT_CONCURRENCY,
    };
  }

  return {
    chunkSize: DEFAULT_IMPORT_CHUNK_SIZE,
    concurrency: DEFAULT_IMPORT_CONCURRENCY,
  };
}

function isSameImportLane(
  url: string,
  settings: { chunkSize: number; concurrency: number }
) {
  const next = importSettings(url);
  return (
    next.chunkSize === settings.chunkSize &&
    next.concurrency === settings.concurrency
  );
}

function isInstagramUrl(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === "instagram.com" || host.endsWith(".instagram.com");
  } catch {
    return false;
  }
}

async function serialMap<T, R>(
  values: T[],
  mapper: (value: T) => Promise<R>
) {
  const results: R[] = [];
  for (const value of values) {
    results.push(await mapper(value));
  }
  return results;
}

function combineBatchResults(results: ImportBatchResult[]): ImportBatchResult {
  return results.reduce<ImportBatchResult>(
    (combined, result) => ({
      imported: combined.imported + result.imported,
      alreadyTracked: combined.alreadyTracked + result.alreadyTracked,
      failures: [...combined.failures, ...result.failures],
      sources: [...combined.sources, ...result.sources],
    }),
    { imported: 0, alreadyTracked: 0, failures: [], sources: [] }
  );
}

function apiErrorMessage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" ? error : "";
}

function importErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Request failed";
}

function normalizeImportStatus(status: unknown): ImportProgressStatus {
  if (status === "imported") return "imported";
  if (status === "already_tracked") return "already_tracked";
  if (status === "failed") return "failed";
  return "failed";
}

function progressIcon(status: ImportProgressStatus) {
  if (status === "importing") {
    return <Loader2 size={14} className="animate-spin text-brand-600" />;
  }
  if (status === "imported" || status === "already_tracked") {
    return <CheckCircle2 size={14} className="text-emerald-600" />;
  }
  if (status === "failed") {
    return <AlertCircle size={14} className="text-rose-600" />;
  }
  return <CircleDashed size={14} className="text-gray-400" />;
}

function progressStatusClass(status: ImportProgressStatus) {
  const base = "mt-0.5 text-[11px]";
  if (status === "failed") return `${base} text-rose-600`;
  if (status === "imported" || status === "already_tracked") {
    return `${base} text-emerald-700`;
  }
  if (status === "importing") return `${base} text-brand-700`;
  return `${base} text-gray-500`;
}

function progressStatusLabel(row: ImportProgressRow) {
  if (row.status === "importing") return "Importing...";
  if (row.status === "imported") {
    return `Imported${row.source ? ` via ${formatSourceName(row.source.toLowerCase())}` : ""}`;
  }
  if (row.status === "already_tracked") return "Already tracked";
  if (row.status === "failed") return row.error || "Import failed";
  return "Queued";
}
