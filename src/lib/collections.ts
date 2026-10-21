import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { badRequest, notFound } from "@/lib/errors";

export type CollectionMember =
  { videoId: string };

export async function assertCollectionBelongsToOrg(
  organisationId: string,
  collectionId: string
) {
  const collection = await prisma.collection.findFirst({
    where: { id: collectionId, organisationId },
    select: { id: true },
  });
  if (!collection) throw notFound("Collection not found");
}

export function parseCollectionMemberBody(
  body: Record<string, unknown>
): CollectionMember {
  const accountId =
    typeof body.accountId === "string" && body.accountId.trim().length > 0
      ? body.accountId.trim()
      : null;
  const videoId =
    typeof body.videoId === "string" && body.videoId.trim().length > 0
      ? body.videoId.trim()
      : null;

  if (accountId) {
    throw badRequest("Collections can only contain specific videos.");
  }
  if (!videoId) {
    throw badRequest("Provide videoId");
  }

  return { videoId };
}

export async function assertCollectionMemberEntityBelongsToOrg(
  organisationId: string,
  member: CollectionMember
) {
  const video = await prisma.video.findFirst({
    where: { id: member.videoId, organisationId },
    select: { id: true },
  });
  if (!video) throw badRequest("Video not found");
}

export async function ensureCollectionMember(
  collectionId: string,
  member: CollectionMember
) {
  const videoId = member.videoId;
  if (!videoId) throw badRequest("Video not found");

  try {
    const item = await prisma.collectionItem.create({
      data: { collectionId, videoId },
    });
    return { item, created: true };
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
    const item = await prisma.collectionItem.findUnique({
      where: {
        collectionId_videoId: { collectionId, videoId },
      },
    });
    if (!item) throw err;
    return { item, created: false };
  }
}

function isUniqueConstraintError(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
