import { Prisma } from "@prisma/client";
import { getAvailabilityByAssetId } from "@/lib/asset-availability";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canManageDomainForUser,
  canViewDomainForUser,
} from "@/lib/permissions";

const assetDetailSelect = Prisma.validator<Prisma.AssetSelect>()({
  assetNo: true,
  assetQuantity: true,
  createdAt: true,
  createdBy: { select: { email: true, name: true } },
  domain: { select: { code: true, inventoryFamily: true, name: true } },
  id: true,
  imageRef: true,
  isActive: true,
  legacyFg: true,
  legacyQty: true,
  location: { select: { code: true, name: true } },
  locationText: true,
  migrationBatch: { select: { fileName: true, sourceSystem: true } },
  note: true,
  requestLockedAt: true,
  requestLockedBy: { select: { email: true, name: true } },
  serialNo: true,
  sourceRecordId: true,
  sourceSystem: true,
  status: true,
  stockCode: true,
  updatedAt: true,
  updatedBy: { select: { email: true, name: true } },
  assetModel: {
    select: {
      assetType: { select: { trackMethod: true } },
      brand: true,
      category: { select: { name: true } },
      description: true,
      modelNo: true,
      name: true,
      partNo: true,
      typeName: true,
    },
  },
  statusHistories: {
    orderBy: { changedAt: "desc" },
    select: {
      actionType: true,
      changedAt: true,
      changedBy: { select: { email: true, name: true } },
      fromStatus: true,
      id: true,
      note: true,
      toStatus: true,
      transaction: {
        select: {
          createdBy: { select: { email: true, name: true } },
          documentRef: true,
          dueDate: true,
          purpose: true,
          requestedBy: { select: { email: true, name: true } },
          status: true,
          transactionNo: true,
          type: true,
        },
      },
    },
    take: 50,
  },
  transactionItems: {
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      fromStatus: true,
      id: true,
      note: true,
      returnedAt: true,
      returnedBy: { select: { email: true, name: true } },
      toStatus: true,
      transaction: {
        select: {
          status: true,
          transactionNo: true,
          type: true,
        },
      },
    },
    take: 10,
  },
});

type AssetDetailPayload = Prisma.AssetGetPayload<{
  select: typeof assetDetailSelect;
}>;

export type AssetDetailRecord = AssetDetailPayload & {
  availableQuantity: number;
  reservedQuantity: number;
  totalQuantity: number;
};

export type AssetDetailResult =
  | { asset: AssetDetailRecord; canManage: boolean; kind: "ok" }
  | { kind: "forbidden" }
  | { kind: "notFound" };

export async function getAssetDetailForUser(
  user: CurrentUser,
  assetId: string,
): Promise<AssetDetailResult> {
  const asset = await db.asset.findUnique({
    select: assetDetailSelect,
    where: { id: assetId },
  });

  if (!asset || !asset.isActive) {
    return { kind: "notFound" };
  }

  if (!canViewDomainForUser(user, asset.domain.code)) {
    return { kind: "forbidden" };
  }

  const availabilityById = await getAvailabilityByAssetId([asset], { userId: user.id });
  const availability = availabilityById.get(asset.id);

  return {
    asset: {
      ...asset,
      availableQuantity: availability?.availableQuantity ?? 0,
      reservedQuantity: availability?.reservedQuantity ?? 0,
      totalQuantity: availability?.totalQuantity ?? asset.assetQuantity,
    },
    canManage: canManageDomainForUser(user, asset.domain.code),
    kind: "ok",
  };
}



