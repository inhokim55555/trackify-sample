import { NextRequest, NextResponse } from "next/server";
import {
  handleApiError,
  parseOptionalString,
  readJsonObject,
} from "@/lib/api";
import { getCurrentUserContext, requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { COLLECTION_TYPES } from "@/lib/constants";
import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

export interface CollectionNode {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  accountCount: number;
  videoCount: number;
  children: CollectionNode[];
}

export async function GET(_req: NextRequest) {
  try {
    const { org } = await getCurrentUserContext();
    const collections = await prisma.collection.findMany({
      where: { organisationId: org.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, parentId: true },
    });

    // Direct video counts plus creators represented by those videos.
    const grouped = await prisma.collectionItem.groupBy({
      by: ["collectionId"],
      where: { collection: { organisationId: org.id } },
      _count: { videoId: true },
    });
    type GroupRow = {
      collectionId: string;
      _count: { videoId: number };
    };
    const videoItems = await prisma.collectionItem.findMany({
      where: {
        collection: { organisationId: org.id },
        videoId: { not: null },
      },
      select: {
        collectionId: true,
        video: { select: { accountId: true } },
      },
    });
    const creatorsByCollection = new Map<string, Set<string>>();
    for (const item of videoItems) {
      if (!item.video?.accountId) continue;
      const creators = creatorsByCollection.get(item.collectionId) ?? new Set<string>();
      creators.add(item.video.accountId);
      creatorsByCollection.set(item.collectionId, creators);
    }
    const countMap = new Map<string, { accounts: number; videos: number }>(
      grouped.map((g: GroupRow) => [
        g.collectionId,
        {
          accounts: creatorsByCollection.get(g.collectionId)?.size ?? 0,
          videos: g._count.videoId,
        },
      ])
    );

    const nodes = new Map<string, CollectionNode>();
    for (const c of collections) {
      const counts = countMap.get(c.id) ?? { accounts: 0, videos: 0 };
      nodes.set(c.id, {
        id: c.id,
        name: c.name,
        type: c.type,
        parentId: c.parentId,
        accountCount: counts.accounts,
        videoCount: counts.videos,
        children: [],
      });
    }

    const roots: CollectionNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    // Roll descendant counts up so a brand shows totals of its sub-collections.
    function rollup(node: CollectionNode): { accounts: number; videos: number } {
      let a = node.accountCount;
      let v = node.videoCount;
      for (const child of node.children) {
        const r = rollup(child);
        a += r.accounts;
        v += r.videos;
      }
      node.accountCount = a;
      node.videoCount = v;
      return { accounts: a, videos: v };
    }
    roots.forEach(rollup);

    return NextResponse.json({ data: roots });
  } catch (err) {
    return handleApiError(
      "GET /api/collections",
      err,
      "Failed to load collections"
    );
  }
}

// Create a new collection (optionally nested under a parent).
export async function POST(req: NextRequest) {
  try {
    const { org } = await requireEditor();
    const body = await readJsonObject(req);
    const name = parseOptionalString(body.name);
    const parentId = parseOptionalString(body.parentId);
    const type = typeof body.type === "string" ? body.type : "custom";

    if (!name) throw badRequest("Name is required");
    if (!(COLLECTION_TYPES as readonly string[]).includes(type)) {
      throw badRequest(`type must be one of: ${COLLECTION_TYPES.join(", ")}`);
    }
    if (parentId) {
      const parent = await prisma.collection.findFirst({
        where: { id: parentId, organisationId: org.id },
      });
      if (!parent) {
        throw badRequest("Parent collection not found");
      }
    }

    const created = await prisma.collection.create({
      data: { organisationId: org.id, name, parentId, type },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (err) {
    return handleApiError(
      "POST /api/collections",
      err,
      "Failed to create collection"
    );
  }
}
