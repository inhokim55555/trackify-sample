"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { RANGE_PRESETS, type Platform, type RangePresetId } from "@/lib/constants";

export interface FilterState {
  collectionId: string | null;
  collectionName: string | null;
  platform: Platform | "all";
  range: RangePresetId;
  from: string | null;
  to: string | null;
  rangeLabel: string;
}

interface FilterContextValue extends FilterState {
  setCollection: (id: string | null, name: string | null) => void;
  setPlatform: (p: Platform | "all") => void;
  setRange: (r: RangePresetId) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  /** Build the shared query string consumed by every API route. */
  toQuery: (extra?: Record<string, string>) => string;
}

const FilterCtx = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [range, setRange] = useState<RangePresetId>("7d");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  const value = useMemo<FilterContextValue>(() => {
    const preset = RANGE_PRESETS.find((r) => r.id === range);
    const rangeLabel =
      from && to ? `${from} to ${to}` : preset?.label ?? "Last 7 days";

    return {
      collectionId,
      collectionName,
      platform,
      range,
      from,
      to,
      rangeLabel,
      setCollection: (id, name) => {
        setCollectionId(id);
        setCollectionName(name);
      },
      setPlatform,
      setRange: (r) => {
        setRange(r);
        setFrom(null);
        setTo(null);
      },
      setDateRange: (nextFrom, nextTo) => {
        setFrom(nextFrom);
        setTo(nextTo);
      },
      toQuery: (extra) => {
        const params = new URLSearchParams();
        if (collectionId) params.set("collectionId", collectionId);
        if (platform !== "all") params.set("platform", platform);
        if (from && to) {
          params.set("from", from);
          params.set("to", to);
        } else {
          params.set("range", range);
        }
        if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
        return params.toString();
      },
    };
  }, [collectionId, collectionName, platform, range, from, to]);

  return <FilterCtx.Provider value={value}>{children}</FilterCtx.Provider>;
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterCtx);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}
