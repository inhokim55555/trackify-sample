import type { MetricName } from "@/lib/datasource/types";
import type { MetricSnapshotInput } from "@/lib/metric-snapshots";

const METRIC_NAMES: MetricName[] = ["views", "likes", "comments", "shares", "saves"];
const MAX_METRIC_COUNT = 2_147_483_647; // Existing PostgreSQL integer columns.

/** Blank cells are omitted observations; only an explicit zero clears a count. */
export function parseManualMetricPoint(input: unknown, now = new Date()): MetricSnapshotInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Expected a metric update object");
  }
  const record = input as Record<string, unknown>;
  const observed: Partial<Record<MetricName, boolean>> = {};
  const counts = {} as Record<MetricName, number>;
  let hasObservation = false;
  for (const name of METRIC_NAMES) {
    const count = parseCount(record[name], name);
    observed[name] = count !== undefined;
    counts[name] = count ?? 0;
    hasObservation ||= count !== undefined;
  }
  if (!hasObservation) throw new Error("Provide at least one metric count; blank cells do not change counts");

  return { date: parseCaptureDate(record.capturedAt, now), ...counts, observed };
}

function parseCount(value: unknown, field: MetricName): number | undefined {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    return undefined;
  }
  let count: number;
  if (typeof value === "number") {
    count = value;
  } else if (typeof value === "string") {
    const match = value.trim().toLowerCase().match(/^(\d+|\d{1,3}(?:,\d{3})+)(\.\d+)?([km])?$/);
    if (!match) throw invalidCount(field);
    const base = Number(`${match[1].replace(/,/g, "")}${match[2] ?? ""}`);
    count = base * (match[3] === "m" ? 1_000_000 : match[3] === "k" ? 1_000 : 1);
  } else {
    throw invalidCount(field);
  }
  if (!Number.isFinite(count) || count < 0 || count > MAX_METRIC_COUNT) throw invalidCount(field);
  return Math.round(count);
}

function invalidCount(field: MetricName) {
  return new Error(`${field} must be a non-negative count up to ${MAX_METRIC_COUNT}; use a blank cell to leave it unchanged`);
}

function parseCaptureDate(value: unknown, now: Date): Date {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
    return now;
  }
  const message = "capturedAt must be a valid YYYY-MM-DD date or ISO timestamp with a timezone";
  if (typeof value !== "string") throw new Error(message);
  const text = value.trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/);
  if (!match) throw new Error(message);
  const calendarDate = new Date(`${text.slice(0, 10)}T00:00:00.000Z`);
  const date = new Date(text);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(calendarDate.getTime()) ||
      calendarDate.toISOString().slice(0, 10) !== text.slice(0, 10)) {
    throw new Error(message);
  }
  return date;
}
