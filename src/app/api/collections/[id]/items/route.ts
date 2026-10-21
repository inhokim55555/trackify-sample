import { NextRequest, NextResponse } from "next/server";
import {
  handleApiError,
  readJsonObject,
} from "@/lib/api";
import {
  assertCollectionMemberEntityBelongsToOrg,
  ensureCollectionMember,
  parseCollectionMemberBody,
} from "@/lib/collections";
import { getCurrentUserContext, requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function ensureCollection(organisationId: string, id: string) {
  return prisma.collection.findFirst({ where: { id, organisationId } });
}

// List creators represented by directly linked collection videos.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await getCurrentUserContext();
    const routeParams = await params;
    const collection = await ensureCollection(org.id, routeParams.id);
    if (!collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const items = await prisma.collectionItem.findMany({
      where: { collectionId: routeParams.id, videoId: { not: null } },
      include: {
        video: {
          select: {
            account: {
              select: { id: true, handle: true, platform: true, displayName: true },
            },
          },
        },
      },
    });

    type Creator = { id: string; handle: string; platform: string; displayName: string };
    const byId = new Map<string, Creator>();
    for (const item of items) {
      const creator = item.video?.account ?? null;
      if (creator) byId.set(creator.id, creator);
    }
    const accounts = Array.from(byId.values());

    return NextResponse.json({ data: { accounts } });
  } catch (err) {
    return handleApiError(
      "GET /api/collections/[id]/items",
      err,
      "Failed to load members"
    );
  }
}

// Add a video to this collection.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await requireEditor();
    const routeParams = await params;
    const collection = await ensureCollection(org.id, routeParams.id);
    if (!collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const member = parseCollectionMemberBody(await readJsonObject(req));
    await assertCollectionMemberEntityBelongsToOrg(org.id, member);

    const result = await ensureCollectionMember(routeParams.id, member);
    return NextResponse.json(
      { data: result.item },
      { status: result.created ? 201 : 200 }
    );
  } catch (err) {
    return handleApiError(
      "POST /api/collections/[id]/items",
      err,
      "Failed to add member"
    );
  }
}

// Remove a video from this collection.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await requireEditor();
    const routeParams = await params;
    const collection = await ensureCollection(org.id, routeParams.id);
    if (!collection) {
      return NextResponse.json({ error: "Collection not found" }, { status: 404 });
    }

    const member = parseCollectionMemberBody(await readJsonObject(req));

    const result = await prisma.collectionItem.deleteMany({
      where: { collectionId: routeParams.id, ...member },
    });
    return NextResponse.json({ data: { removed: result.count } });
  } catch (err) {
    return handleApiError(
      "DELETE /api/collections/[id]/items",
      err,
      "Failed to remove member"
    );
  }
}
