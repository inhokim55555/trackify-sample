import { NextRequest, NextResponse } from "next/server";
import { handleApiError, parseOptionalString, readJsonObject } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest } from "@/lib/errors";
import { assertActingAdmin, updateWorkspaceUserAccess, withWorkspaceAccess } from "@/lib/workspace-access";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const { org } = await requireAdmin();
    const [users, invites] = await Promise.all([
      prisma.user.findMany({
        where: { organisationId: org.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          disabledAt: true,
          createdAt: true,
        },
      }),
      prisma.teamInvite.findMany({
        where: { organisationId: org.id, status: "pending" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      data: {
        users: users.map((user) => ({
          ...user,
          disabledAt: user.disabledAt?.toISOString() ?? null,
          createdAt: user.createdAt.toISOString(),
        })),
        invites: invites.map((invite) => ({
          ...invite,
          createdAt: invite.createdAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    return handleApiError("GET /api/team", err, "Failed to load team");
  }
}

export async function POST(req: NextRequest) {
  try {
    const { org, user, authUser } = await requireAdmin();
    const body = await readJsonObject(req);
    const email = normalizeEmail(parseOptionalString(body.email) ?? "");
    if (!email) throw badRequest("Email is required");
    const role = parseRole(body.role);

    const invite = await withWorkspaceAccess(async (tx) => {
      const actor = { userId: user.id, organisationId: org.id, supabaseUserId: authUser.id };
      await assertActingAdmin(tx, actor);
      const existingUser = await tx.user.findUnique({ where: { email } });
      if (existingUser?.organisationId === org.id) {
        await updateWorkspaceUserAccess(tx, actor, existingUser.id, { role, disabledAt: null });
      }

      return tx.teamInvite.upsert({
        where: {
          organisationId_email: {
            organisationId: org.id,
            email,
          },
        },
        create: {
          organisationId: org.id,
          email,
          role,
          status: existingUser ? "accepted" : "pending",
          acceptedAt: existingUser ? new Date() : null,
          invitedById: user.id,
        },
        update: {
          role,
          status: existingUser ? "accepted" : "pending",
          acceptedAt: existingUser ? new Date() : null,
          invitedById: user.id,
        },
      });
    });

    return NextResponse.json({
      data: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        createdAt: invite.createdAt.toISOString(),
      },
    });
  } catch (err) {
    return handleApiError("POST /api/team", err, "Failed to invite teammate");
  }
}

function parseRole(value: unknown) {
  return value === "Admin" ? "Admin" : "Editor";
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}
