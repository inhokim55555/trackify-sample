import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PLATFORMS, RANGE_PRESETS, type Platform } from "@/lib/constants";

const MAX_FILTER_DAYS = 365;

export interface Filters {
  collectionId: string | null;
  platform: Platform | null;
  from: Date;
  to: Date;
  days: number;
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

/**
 * Parse + validate the universal filter query params. Invalid values fall back
 * to safe defaults rather than throwing, so a malformed URL never 500s.
 */
export function parseFilters(searchParams: URLSearchParams): Filters {
  const to = utcMidnight(new Date());

  const preset = searchParams.get("range") ?? "7d";
  const presetDef =
    RANGE_PRESETS.find((p) => p.id === preset) ?? RANGE_PRESETS[0];
  let days: number = presetDef.days;
  let from = addDays(to, -(days - 1));

  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  if (fromParam && toParam) {
    const f = new Date(fromParam);
    const t = new Date(toParam);
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f <= t) {
      from = utcMidnight(f);
      const t2 = utcMidnight(t);
      days = Math.round((t2.getTime() - from.getTime()) / 86_400_000) + 1;
      if (days > MAX_FILTER_DAYS) {
        days = MAX_FILTER_DAYS;
        from = addDays(t2, -(MAX_FILTER_DAYS - 1));
      }
      return {
        collectionId: parseCollectionId(searchParams),
        platform: parsePlatform(searchParams),
        from,
        to: t2,
        days,
      };
    }
  }

  return {
    collectionId: parseCollectionId(searchParams),
    platform: parsePlatform(searchParams),
    from,
    to,
    days,
  };
}

function parsePlatform(searchParams: URLSearchParams): Platform | null {
  const p = searchParams.get("platform");
  if (!p || p === "all") return null;
  return (PLATFORMS as readonly string[]).includes(p) ? (p as Platform) : null;
}

function parseCollectionId(searchParams: URLSearchParams): string | null {
  const c = searchParams.get("collectionId");
  return c && c.length > 0 ? c : null;
}

/** The default (only) organisation in this single-tenant prototype. */
export async function getDefaultOrg() {
  const org = await prisma.organisation.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!org) throw new Error("No organisation found. Did you run the seed?");
  return org;
}

/** Collect a collection id plus all of its descendant ids (nested tree). */
export async function descendantCollectionIds(
  organisationId: string,
  rootId: string
): Promise<string[]> {
  const all = await prisma.collection.findMany({
    where: { organisationId },
    select: { id: true, parentId: true },
  });
  if (!all.some((c) => c.id === rootId)) return [];

  const childrenByParent = new Map<string, string[]>();
  for (const c of all) {
    if (!c.parentId) continue;
    const list = childrenByParent.get(c.parentId) ?? [];
    list.push(c.id);
    childrenByParent.set(c.parentId, list);
  }
  const result: string[] = [];
  const stack = [rootId];
  const visited=new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if(visited.has(id))continue;visited.add(id);
    result.push(id);
    const kids = childrenByParent.get(id);
    if (kids) stack.push(...kids);
  }
  return result;
}

/**
 * Resolve the set of video ids that match the current filters. Collection
 * filters use explicit video membership only, so a creator's other campaign
 * videos do not bleed into this collection.
 */
export async function videoIdsForFilters(
  organisationId: string,
  filters: Filters
): Promise<string[]> {
  const where = await videoWhereForFilters(organisationId, filters);
  const videos = await prisma.video.findMany({
    where,
    select: { id: true },
  });
  return videos.map((v: { id: string }) => v.id);
}

export async function videoWhereForFilters(
  organisationId: string,
  filters: Filters
): Promise<Prisma.VideoWhereInput> {
  const platformWhere = filters.platform ? { platform: filters.platform } : {};

  if (!filters.collectionId) {
    return { organisationId, ...platformWhere };
  }

  const collectionIds = await descendantCollectionIds(
    organisationId,
    filters.collectionId
  );
  if (collectionIds.length === 0) return emptyVideoWhere(organisationId);

  const items = await prisma.collectionItem.findMany({
    where: {
      collectionId: { in: collectionIds },
      collection: { organisationId },
    },
    select: { videoId: true },
  });
  type ItemRow = { videoId: string | null };
  const directVideoIds = items
    .map((i: ItemRow) => i.videoId)
    .filter((x: string | null): x is string => !!x);
  if (directVideoIds.length === 0) {
    return emptyVideoWhere(organisationId);
  }

  return {
    organisationId,
    ...platformWhere,
    id: { in: directVideoIds },
  };
}

function emptyVideoWhere(organisationId: string): Prisma.VideoWhereInput {
  return { organisationId, id: { in: [] } };
}
