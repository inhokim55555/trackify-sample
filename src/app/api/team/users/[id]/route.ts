import { NextRequest, NextResponse } from "next/server";
import { handleApiError, readJsonObject } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { updateWorkspaceUserAccess, withWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org, user: currentUser, authUser } = await requireAdmin();
    const routeParams = await params;
    const body = await readJsonObject(req);

    const data: { role?: string; disabledAt?: Date | null } = {};
    if ("role" in body) data.role = body.role === "Admin" ? "Admin" : "Editor";
    if ("disabled" in body) {
      const disabled = body.disabled === true;
      data.disabledAt = disabled ? new Date() : null;
    }

    const updated = await withWorkspaceAccess((tx) => updateWorkspaceUserAccess(tx, {
      userId: currentUser.id, organisationId: org.id, supabaseUserId: authUser.id,
    }, routeParams.id, data));

    return NextResponse.json({
      data: {
        ...updated,
        disabledAt: updated.disabledAt?.toISOString() ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return handleApiError("PATCH /api/team/users/[id]", err, "Failed to update user");
  }
}
