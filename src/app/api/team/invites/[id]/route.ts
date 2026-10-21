import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { assertActingAdmin, withWorkspaceAccess } from "@/lib/workspace-access";
import { notFound } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { org, user, authUser } = await requireAdmin();
    const routeParams = await params;
    await withWorkspaceAccess(async (tx) => {
      await assertActingAdmin(tx, { userId: user.id, organisationId: org.id, supabaseUserId: authUser.id });
      const invite = await tx.teamInvite.findFirst({
        where: { id: routeParams.id, organisationId: org.id, status: "pending" },
        select: { id: true },
      });
      if (!invite) throw notFound("Invite not found");

      await tx.teamInvite.update({
        where: { id: routeParams.id },
        data: { status: "revoked" },
      });
    });

    return NextResponse.json({ data: { id: routeParams.id, revoked: true } });
  } catch (err) {
    return handleApiError(
      "DELETE /api/team/invites/[id]",
      err,
      "Failed to revoke invite"
    );
  }
}
