import {
  AssetStatus,
  AssetTrackMethod,
  Prisma,
  TransactionWorkflowStatus,
} from "@prisma/client";
import { db } from "@/lib/db";

type QueryClient = typeof db | Prisma.TransactionClient;

export type AvailabilityAsset = {
  assetModel: {
    assetType: { trackMethod: AssetTrackMethod } | null;
  };
  assetQuantity: number;
  id: string;
  requestLockedById?: string | null;
  status: AssetStatus;
};

export type AssetAvailability = {
  availableQuantity: number;
  ownReservedQuantity: number;
  reservedQuantity: number;
  totalQuantity: number;
  trackMethod: AssetTrackMethod;
};

function isQuantityAsset(asset: AvailabilityAsset) {
  return asset.assetModel.assetType?.trackMethod === AssetTrackMethod.QUANTITY;
}

async function sumDraftReservations(
  client: QueryClient,
  assetIds: string[],
  userId?: string,
) {
  if (assetIds.length === 0) {
    return new Map<string, number>();
  }

  const reservations = await client.assetReservation.groupBy({
    by: ["assetId"],
    _sum: { quantity: true },
    where: {
      assetId: { in: assetIds },
      ...(userId ? { userId } : {}),
    },
  });

  return new Map<string, number>(
    reservations.map((reservation) => [
      reservation.assetId,
      reservation._sum.quantity ?? 0,
    ]),
  );
}

async function sumOpenTransactionQuantities(
  client: QueryClient,
  assetIds: string[],
) {
  if (assetIds.length === 0) {
    return new Map<string, number>();
  }

  const items = await client.transactionItem.groupBy({
    by: ["assetId"],
    _sum: { requestedQuantity: true },
    where: {
      assetId: { in: assetIds },
      returnedAt: null,
      toStatus: { in: [AssetStatus.BORROW, AssetStatus.USING] },
      transaction: {
        workflowStatus: TransactionWorkflowStatus.IN_PROGRESS,
      },
    },
  });

  return new Map<string, number>(
    items.map((item) => [item.assetId, item._sum.requestedQuantity ?? 0]),
  );
}

export async function getAvailabilityByAssetId(
  assets: AvailabilityAsset[],
  options: {
    client?: QueryClient;
    userId?: string;
  } = {},
) {
  const client = options.client ?? db;
  const quantityAssets = assets.filter(isQuantityAsset);
  const quantityAssetIds = quantityAssets.map((asset) => asset.id);
  const [allReservations, ownReservations, openTransactions] = await Promise.all([
    sumDraftReservations(client, quantityAssetIds),
    sumDraftReservations(client, quantityAssetIds, options.userId),
    sumOpenTransactionQuantities(client, quantityAssetIds),
  ]);

  return new Map<string, AssetAvailability>(
    assets.map<[string, AssetAvailability]>((asset) => {
      if (!isQuantityAsset(asset)) {
        const availableQuantity = asset.status === AssetStatus.READY ? 1 : 0;
        const ownReservedQuantity =
          asset.requestLockedById && asset.requestLockedById === options.userId ? 1 : 0;
        const reservedQuantity = asset.status === AssetStatus.REQUEST ? 1 : 0;

        return [
          asset.id,
          {
            availableQuantity,
            ownReservedQuantity,
            reservedQuantity,
            totalQuantity: 1,
            trackMethod: AssetTrackMethod.SERIAL,
          },
        ];
      }

      const reservedQuantity =
        (allReservations.get(asset.id) ?? 0) +
        (openTransactions.get(asset.id) ?? 0);

      return [
        asset.id,
        {
          availableQuantity: Math.max(0, asset.assetQuantity - reservedQuantity),
          ownReservedQuantity: ownReservations.get(asset.id) ?? 0,
          reservedQuantity,
          totalQuantity: asset.assetQuantity,
          trackMethod: AssetTrackMethod.QUANTITY,
        },
      ];
    }),
  );
}
