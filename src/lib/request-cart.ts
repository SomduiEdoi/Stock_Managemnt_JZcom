import { AssetStatus, Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { getVisibleDomainCodes } from "@/lib/assets";
import { db } from "@/lib/db";
import { canRequestAssetsForUser } from "@/lib/permissions";

const requestCartAssetSelect = Prisma.validator<Prisma.AssetSelect>()({
  id: true,
  locationText: true,
  requestLockedAt: true,
  requestLockedBy: { select: { email: true, name: true } },
  serialNo: true,
  status: true,
  stockCode: true,
  domain: { select: { code: true, name: true } },
  location: { select: { name: true } },
  assetModel: {
    select: {
      brand: true,
      category: { select: { name: true } },
      name: true,
      typeName: true,
    },
  },
});

export type RequestCartAsset = Prisma.AssetGetPayload<{
  select: typeof requestCartAssetSelect;
}>;

export async function getRequestCartForUser(user: CurrentUser) {
  if (!canRequestAssetsForUser(user)) {
    return { canRequest: false as const };
  }

  const assets = await db.asset.findMany({
    orderBy: [{ requestLockedAt: "desc" }, { serialNo: "asc" }],
    select: requestCartAssetSelect,
    where: {
      domain: { code: { in: getVisibleDomainCodes(user) } },
      isActive: true,
      requestLockedById: user.id,
      status: AssetStatus.REQUEST,
    },
  });

  return { assets, canRequest: true as const };
}

export async function getRequestQueueForLog() {
  const assets = await db.asset.findMany({
    orderBy: [{ requestLockedAt: "desc" }, { serialNo: "asc" }],
    select: requestCartAssetSelect,
    where: {
      isActive: true,
      requestLockedById: { not: null },
      status: AssetStatus.REQUEST,
    },
  });

  return { assets };
}
