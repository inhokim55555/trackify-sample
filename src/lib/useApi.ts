"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { currentRequestState, RequestGate } from "@/lib/request-state";
import { saveSession } from "@/lib/save-session";

interface ApiState<T> {
  requestUrl: string | null;
  data: T | null;
  error: string | null;
  /** True only when there is no data to show yet (first visit to a URL). */
  loading: boolean;
  /** True while revalidating in the background with cached data on screen. */
  refreshing: boolean;
}

interface UseApiOptions {
  cache?: boolean;
  keepDataOnReload?: boolean;
}

interface ApiRequestState<T> extends ApiState<T> {
  nonce: number;
  shouldCache: boolean;
  keepDataOnReload: boolean;
}

/**
 * Module-level stale-while-revalidate cache. Navigating back to a page (or
 * re-applying a filter combination already seen) renders instantly from
 * cache while a background fetch revalidates the data. Bounded so long
 * sessions don't grow memory without limit.
 */
interface CacheEntry {
  data: unknown;
  bytes: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_MAX_ENTRIES = 24;
const CACHE_MAX_TOTAL_BYTES = 1_000_000;
const CACHE_MAX_RESPONSE_BYTES = 150_000;
let cacheBytes = 0;

function cacheSet(url: string, data: unknown) {
  const bytes = estimateCacheBytes(data);
  if (bytes > CACHE_MAX_RESPONSE_BYTES) return;

  const existing = cache.get(url);
  if (existing) {
    cache.delete(url);
    cacheBytes -= existing.bytes;
  }
  cache.set(url, { data, bytes });
  cacheBytes += bytes;
  while (cache.size > CACHE_MAX_ENTRIES || cacheBytes > CACHE_MAX_TOTAL_BYTES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const entry = cache.get(oldest);
    if (entry) cacheBytes -= entry.bytes;
    cache.delete(oldest);
  }
}

function cacheGet<T>(url: string): T | undefined {
  return cache.get(url)?.data as T | undefined;
}

/** Drop cached responses, e.g. after a mutation. No prefix clears everything. */
export function invalidateApiCache(urlPrefix?: string) {
  if (!urlPrefix) {
    cache.clear();
    cacheBytes = 0;
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (key.startsWith(urlPrefix)) {
      const entry = cache.get(key);
      if (entry) cacheBytes -= entry.bytes;
      cache.delete(key);
    }
  }
}

/**
 * Minimal data-fetching hook (no extra deps). Re-fetches whenever `url`
 * changes - pass a url built from the shared filter query string so every
 * view stays in sync with the universal filter bar.
 */
export function useApi<T>(
  url: string | null,
  options: UseApiOptions = {}
): ApiState<T> & { reload: () => void } {
  const shouldCache = Boolean(
    url && options.cache !== false && isCacheableUrl(url)
  );
  const keepDataOnReload = options.keepDataOnReload === true;
  const [nonce, setNonce] = useState(0);
  const initialCached =
    shouldCache && url ? cacheGet<T>(url) : undefined;
  const [state, setState] = useState<ApiRequestState<T>>({
    nonce,
    shouldCache,
    keepDataOnReload,
    requestUrl: url,
    data: initialCached ?? null,
    error: null,
    loading: Boolean(url) && initialCached === undefined,
    refreshing: initialCached !== undefined,
  });
  const requests = useRef(new RequestGate());
  const reload = useCallback(() => {
    requests.current.cancel();
    setNonce((n) => n + 1);
  }, []);

  let visibleState = state;
  if (state.requestUrl !== url || state.nonce !== nonce ||
      state.shouldCache !== shouldCache || state.keepDataOnReload !== keepDataOnReload) {
    const cached = shouldCache && url ? cacheGet<T>(url) : undefined;
    const data = url
      ? cached ?? (keepDataOnReload && state.requestUrl === url ? state.data : null)
      : null;
    visibleState = {
      requestUrl: url, nonce, shouldCache, keepDataOnReload, data, error: null,
      loading: Boolean(url) && data === null,
      refreshing: data !== null,
    };
    // A query transition is rendered once with its own loading state, before fetching.
    setState(visibleState);
  }

  useEffect(() => {
    if (!url) return;
    const requestGate = requests.current;
    const controller = requestGate.begin();
    const owner = saveSession.snapshot().owner;
    const isCurrent = () => requestGate.isCurrent(controller) && saveSession.snapshot().owner === owner;

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!isCurrent()) throw new DOMException("Request cancelled", "AbortError");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!isCurrent()) throw new DOMException("Request cancelled", "AbortError");
          if (res.status === 401 && typeof window !== "undefined") {
            const next = `${window.location.pathname}${window.location.search}`;
            // Expired authentication must discard cached authenticated page state.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = `/login?next=${encodeURIComponent(next)}`;
          }
          throw new Error(body.error || `Request failed (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (!isCurrent()) return;
        if (shouldCache) cacheSet(url, data);
        setState({ requestUrl: url, nonce, shouldCache, keepDataOnReload, data, error: null, loading: false, refreshing: false });
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        if (isCurrent())
          setState((s) => ({
            nonce, shouldCache, keepDataOnReload,
            requestUrl: url,
            // Keep stale data visible on background-refresh failures.
            data: s.data,
            error: String(err.message || err),
            loading: false,
            refreshing: false,
          }));
      });
    return () => {
      requestGate.cancel(controller);
    };
  }, [url, nonce, shouldCache, keepDataOnReload]);

  return { ...currentRequestState(visibleState, url), reload };
}

function isCacheableUrl(url: string) {
  return ![
    "/api/overview",
    "/api/videos",
    "/api/campaign-influencers",
    "/api/notifications",
  ].some((prefix) => url.startsWith(prefix));
}

function estimateCacheBytes(data: unknown) {
  try {
    return JSON.stringify(data).length;
  } catch {
    return CACHE_MAX_RESPONSE_BYTES + 1;
  }
}
