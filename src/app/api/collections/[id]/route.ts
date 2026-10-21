import { NextRequest, NextResponse } from "next/server";
import {
  handleApiError,
  parseOptionalString,
  readJsonObject,
} from "@/lib/api";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/db";

import { badRequest } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Rename a collection, or move it under a different parent.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await requireEditor();
    const routeParams = await params;
    const body = await readJsonObject(req);

    const updated=await prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(72831001)`;
    const existing = await tx.collection.findFirst({
      where: { id: routeParams.id, organisationId: org.id },
    });
    if(!existing)throw badRequest('Collection not found');

    const data: { name?: string; parentId?: string | null } = {};

    if (typeof body.name === "string") {
      const name = parseOptionalString(body.name);
      if (!name) throw badRequest("Name cannot be empty");
      data.name = name;
    }

    if ("parentId" in body) {
      const parentId = parseOptionalString(body.parentId);
      if (parentId) {
        if (parentId === routeParams.id) {
          throw badRequest("A collection cannot be its own parent");
        }
        // Prevent cycles: the new parent must not be a descendant of this node.
        const rows=await tx.collection.findMany({where:{organisationId:org.id},select:{id:true,parentId:true}});const descendants:string[]=[];const pending=[routeParams.id];const seen=new Set<string>();while(pending.length){const id=pending.pop()!;if(seen.has(id))continue;seen.add(id);descendants.push(id);pending.push(...rows.filter(r=>r.parentId===id).map(r=>r.id));}
        if (descendants.includes(parentId)) {
          throw badRequest(
            "Cannot move a collection inside one of its descendants"
          );
        }
        const parent = await tx.collection.findFirst({
          where: { id: parentId, organisationId: org.id },
        });
        if (!parent) {
          throw badRequest("Parent collection not found");
        }
      }
      data.parentId = parentId;
    }

    return await tx.collection.update({
      where: { id: routeParams.id },
      data,
    });

    });
    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleApiError(
      "PATCH /api/collections/[id]",
      err,
      "Failed to update collection"
    );
  }
}

// Delete a collection. Children and memberships cascade via the schema.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org } = await requireEditor();
    const routeParams = await params;
    const existing = await prisma.collection.findFirst({
      where: { id: routeParams.id, organisationId: org.id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Collection not found" },
        { status: 404 }
      );
    }
    await prisma.collection.delete({ where: { id: routeParams.id } });
    return NextResponse.json({ data: { id: routeParams.id, deleted: true } });
  } catch (err) {
    return handleApiError(
      "DELETE /api/collections/[id]",
      err,
      "Failed to delete collection"
    );
  }
}
