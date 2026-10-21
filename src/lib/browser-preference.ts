"use client";

import { useSyncExternalStore } from "react";

/** A browser preference with stable snapshots and a deterministic server default. */
export function createBrowserPreference<T>(
  key: string,
  fallback: T,
  decode: (raw: string) => T,
  encode: (value: T) => string = JSON.stringify
) {
  let previousRaw: string | null | undefined;
  let value = fallback;
  let volatileValue: { value: T } | undefined;
  const listeners = new Set<() => void>();

  const getSnapshot = () => {
    if (typeof window === "undefined") return fallback;
    if (volatileValue) return volatileValue.value;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== previousRaw) {
        previousRaw = raw;
        try { value = raw === null ? fallback : decode(raw); }
        catch { value = fallback; }
      }
    } catch {
      // A blocked storage API must not prevent using the page.
    }
    return value;
  };
  const notify = () => listeners.forEach((listener) => listener());
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== key) return;
    previousRaw = undefined;
    volatileValue = undefined;
    notify();
  };

  return {
    getSnapshot,
    getServerSnapshot: () => fallback,
    subscribe(listener: () => void) {
      if (listeners.size === 0) window.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", onStorage);
      };
    },
    set(next: T | ((previous: T) => T)) {
      value = typeof next === "function"
        ? (next as (previous: T) => T)(getSnapshot())
        : next;
      try {
        const raw = encode(value);
        window.localStorage.setItem(key, raw);
        previousRaw = raw;
        volatileValue = undefined;
      } catch {
        // Keep the user's edit for this page session even when persistence fails.
        volatileValue = { value };
      }
      notify();
    },
  };
}

export function useBrowserPreference<T>(store: ReturnType<typeof createBrowserPreference<T>>) {
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return [value, store.set] as const;
}
