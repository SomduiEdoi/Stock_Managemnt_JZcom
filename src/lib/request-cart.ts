import { AssetStatus, Prisma } from "@prisma/client";
import { getAvailabilityByAssetId } from "@/lib/asset-availability";
import type { CurrentUser } from "@/lib/auth";
import { getVisibleWarehouseCodesForUser } from "@/lib/assets";
import { db } from "@/lib/db";
import { canRequestAssetsForUser } from "@/lib/permissions";

const pendingSubmittedRequestWhere = {
  transaction: {
    workflowStatus: "PENDING",
  },
} satisfies Prisma.TransactionItemWhereInput;

const requestCartAssetSelect = Prisma.validator<Prisma.AssetSelect>()({
  assetQuantity: true,
  id: true,
  locationText: true,
  requestLockedAt: true,
  requestLockedById: true,
  requestLockedBy: { select: { email: true, name: true } },
  serialNo: true,
  status: true,
  stockCode: true,
  warehouse: { select: { code: true, inventoryFamily: true, name: true } },
  location: { select: { name: true } },
  assetModel: {
    select: {
      assetType: { select: { trackMethod: true } },
      brand: true,
      category: { select: { name: true } },
      name: true,
      typeName: true,
    },
  },
});

export type RequestCartAsset = Prisma.AssetGetPayload<{
  select: typeof requestCartAssetSelect;
}> & {
  availableQuantity: number;
  requestedQuantity: number;
  reservedQuantity: number;
  totalQuantity: number;
};

async function attachCartQuantities(
  assets: Prisma.AssetGetPayload<{ select: typeof requestCartAssetSelect }>[],
  userId?: string,
) {
  const availabilityById = await getAvailabilityByAssetId(assets, { userId });

  return assets.map((asset) => {
    const availability = availabilityById.get(asset.id);

    return {
      ...asset,
      availableQuantity: availability?.availableQuantity ?? 0,
      requestedQuantity:
        availability?.ownReservedQuantity && availability.ownReservedQuantity > 0
          ? availability.ownReservedQuantity
          : 1,
      reservedQuantity: availability?.reservedQuantity ?? 0,
      totalQuantity: availability?.totalQuantity ?? 1,
    };
  });
}

export async function getRequestCartForUser(user: CurrentUser) {
  if (!canRequestAssetsForUser(user)) {
    return { canRequest: false as const };
  }

  const visibleWarehouseCodes = await getVisibleWarehouseCodesForUser(user);
  const serialAssets = await db.asset.findMany({
    orderBy: [{ requestLockedAt: "desc" }, { serialNo: "asc" }],
    select: requestCartAssetSelect,
    where: {
      warehouse: { code: { in: visibleWarehouseCodes } },
      isActive: true,
      requestLockedById: user.id,
      status: AssetStatus.REQUEST,
      transactionItems: {
        none: {
          transaction: {
            requestedById: user.id,
            workflowStatus: "PENDING",
          },
        },
      },
    },
  });
  const reservations = await db.assetReservation.findMany({
    orderBy: [{ updatedAt: "desc" }],
    select: {
      asset: { select: requestCartAssetSelect },
    },
    where: {
      asset: {
        warehouse: { code: { in: visibleWarehouseCodes } },
        isActive: true,
        transactionItems: {
          none: {
            transaction: {
              requestedById: user.id,
              workflowStatus: "PENDING",
            },
          },
        },
      },
      userId: user.id,
    },
  });
  const assets = await attachCartQuantities(
    [...serialAssets, ...reservations.map((reservation) => reservation.asset)],
    user.id,
  );

  return { assets, canRequest: true as const };
}

export async function getRequestQueueForLog() {
  const [serialAssets, reservations] = await Promise.all([
    db.asset.findMany({
    orderBy: [{ requestLockedAt: "desc" }, { serialNo: "asc" }],
    select: requestCartAssetSelect,
    where: {
      isActive: true,
      requestLockedById: { not: null },
      status: AssetStatus.REQUEST,
      transactionItems: {
        none: pendingSubmittedRequestWhere,
      },
    },
    }),
    db.assetReservation.findMany({
      orderBy: [{ updatedAt: "desc" }],
      select: {
        quantity: true,
        createdAt: true,
        userId: true,
        user: { select: { email: true, name: true } },
        asset: { select: requestCartAssetSelect },
      },
      where: {
        asset: {
          isActive: true,
          transactionItems: {
            none: pendingSubmittedRequestWhere,
          },
        },
      },
    }),
  ]);
  const assets = await attachCartQuantities([
    ...serialAssets,
    ...reservations.map((reservation) => ({
      ...reservation.asset,
      requestLockedAt: reservation.createdAt,
      requestLockedBy: reservation.user,
      requestLockedById: reservation.userId,
    })),
  ]);

  return {
    assets: assets.map((asset) => {
      const reservation = reservations.find(
        (item) => item.asset.id === asset.id && item.userId === asset.requestLockedById,
      );

      return reservation
        ? { ...asset, requestedQuantity: reservation.quantity }
        : asset;
    }),
  };
}

