import {
  AssetActionType,
  AssetCondition,
  AssetStatus,
  Prisma,
  TransactionWorkflowStatus,
  TransactionType,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { isWarehouseStockControllerRequiredTag } from "@/lib/approval-flow";
import { db } from "@/lib/db";
import {
  AssetTrackMethod,
  getEffectiveAssetTrackMethod,
} from "@/lib/asset-tracking";
import {
  assertCanChangeAssetStatus,
  assertCanRequestWarehouse,
  canManageWarehouseForUser,
} from "@/lib/permissions";
import {
  canTransitionAssetStatus,
  getManualStatusAction,
} from "@/lib/workflow-rules";
import {
  WorkflowError,
  assetDisplayName,
  assetWorkflowSelect,
  isQuantityAsset,
  isQuantityTransactionItem,
  requireText,
  transactionItemAssetName,
} from "./shared";
import type {
  ChangeAssetStatusInput,
  TransactionDetail,
  WorkflowAsset,
  WorkflowRequestItem,
} from "./shared";
import { currentPendingApproval } from "./approval-guards";
import {
  calculateQuantityAvailability,
  openQuantityTransactionWhere,
  sumDraftReservations as sumDraftReservationQuantities,
  sumOpenTransactionQuantities,
} from "@/lib/asset-availability";

export async function getAvailableQuantities(
  tx: Prisma.TransactionClient,
  assets: WorkflowAsset[],
) {
  const quantityAssets = assets.filter(isQuantityAsset);
  const assetIds = quantityAssets.map((asset) => asset.id);

  if (assetIds.length === 0) {
    return new Map<string, number>();
  }

  const [draftReservations, openTransactions] = await Promise.all([
    sumDraftReservationQuantities(tx, assetIds),
    sumOpenTransactionQuantities(tx, assetIds),
  ]);

  return new Map(
    quantityAssets.map((asset) => {
      const { availableQuantity } = calculateQuantityAvailability(
        asset.assetQuantity,
        draftReservations.get(asset.id) ?? 0,
        openTransactions.get(asset.id) ?? 0,
      );
      return [asset.id, availableQuantity];
    }),
  );
}

export async function assertNoOpenSerialTransactionItems(
  tx: Prisma.TransactionClient,
  items: WorkflowRequestItem[],
  previousAssetIds = new Set<string>(),
) {
  const serialAssetIds = items
    .filter(
      (item) =>
        !isQuantityAsset(item.asset) && !previousAssetIds.has(item.asset.id),
    )
    .map((item) => item.asset.id);

  if (serialAssetIds.length === 0) {
    return;
  }

  const existingItem = await tx.transactionItem.findFirst({
    select: {
      asset: {
        select: { assetModel: { select: { name: true } }, serialNo: true },
      },
      transaction: { select: { transactionNo: true } },
    },
    where: {
      assetId: { in: serialAssetIds },
      returnedAt: null,
      toStatus: {
        in: [AssetStatus.BORROW, AssetStatus.USING, AssetStatus.SOLD],
      },
      transaction: {
        workflowStatus: {
          in: [
            TransactionWorkflowStatus.PENDING,
            TransactionWorkflowStatus.IN_PROGRESS,
          ],
        },
      },
    },
  });

  if (existingItem?.asset) {
    throw new WorkflowError(
      `Asset ${existingItem.asset.serialNo ?? existingItem.asset.assetModel.name} is already in ${existingItem.transaction.transactionNo}.`,
      409,
      "ASSET_ALREADY_IN_OPEN_TRANSACTION",
    );
  }
}

export function assertAssetsCanBeHeld(
  user: CurrentUser,
  items: WorkflowRequestItem[],
  availableQuantities: Map<string, number>,
) {
  for (const { asset, quantity } of items) {
    assertCanRequestWarehouse(user, asset.warehouse.code);

    if (isQuantityAsset(asset)) {
      const availableQuantity = availableQuantities.get(asset.id) ?? 0;

      if (asset.status !== AssetStatus.READY) {
        throw new WorkflowError(
          `Asset ${assetDisplayName(asset)} is not ready for request.`,
          409,
          "ASSET_NOT_READY",
        );
      }

      if (quantity > availableQuantity) {
        throw new WorkflowError(
          `Asset ${assetDisplayName(asset)} has only ${availableQuantity} available.`,
          409,
          "INSUFFICIENT_ASSET_QUANTITY",
        );
      }

      continue;
    }

    if (quantity !== 1) {
      throw new WorkflowError(
        `Serial asset ${assetDisplayName(asset)} can only be requested with quantity 1.`,
        409,
        "INVALID_SERIAL_QUANTITY",
      );
    }

    if (asset.status !== AssetStatus.READY) {
      throw new WorkflowError(
        `Asset ${assetDisplayName(asset)} is not ready for request.`,
        409,
        "ASSET_NOT_READY",
      );
    }
  }
}

export async function holdAsset(
  tx: Prisma.TransactionClient,
  asset: WorkflowAsset,
  user: CurrentUser,
  now: Date,
) {
  const result = await tx.asset.updateMany({
    where: {
      id: asset.id,
      isActive: true,
      requestLockedById: null,
      status: AssetStatus.READY,
    },
    data: {
      requestLockedAt: now,
      requestLockedById: user.id,
      status: AssetStatus.REQUEST,
      updatedById: user.id,
    },
  });

  if (result.count !== 1) {
    throw new WorkflowError(
      `Asset ${assetDisplayName(asset)} was already requested or changed.`,
      409,
      "ASSET_REQUEST_CONFLICT",
    );
  }
}

export async function refreshQuantityRequestStatus(
  tx: Prisma.TransactionClient,
  assetId: string,
  userId: string,
) {
  const asset = await tx.asset.findUnique({
    where: { id: assetId },
    select: { assetQuantity: true, status: true },
  });

  if (!asset) {
    return;
  }

  const [draftReserved, openReserved] = await Promise.all([
    tx.assetReservation.aggregate({
      _sum: { quantity: true },
      where: { assetId },
    }),
    tx.transactionItem.aggregate({
      _sum: { requestedQuantity: true },
      where: openQuantityTransactionWhere(assetId),
    }),
  ]);

  const { reservedQuantity: reserved } = calculateQuantityAvailability(
    asset.assetQuantity,
    draftReserved._sum.quantity ?? 0,
    openReserved._sum.requestedQuantity ?? 0,
  );
  const nextStatus =
    asset.assetQuantity <= 0
      ? AssetStatus.SOLD
      : reserved >= asset.assetQuantity
        ? AssetStatus.REQUEST
        : AssetStatus.READY;

  if (asset.status !== nextStatus) {
    await tx.asset.update({
      data: {
        requestLockedAt: null,
        requestLockedById: null,
        status: nextStatus,
        updatedById: userId,
      },
      where: { id: assetId },
    });
  }
}

export async function reserveQuantityAsset(
  tx: Prisma.TransactionClient,
  item: WorkflowRequestItem,
  user: CurrentUser,
  note: string | null,
) {
  await tx.assetReservation.upsert({
    where: {
      assetId_userId: {
        assetId: item.asset.id,
        userId: user.id,
      },
    },
    update: {
      note,
      quantity: { increment: item.quantity },
    },
    create: {
      assetId: item.asset.id,
      note,
      quantity: item.quantity,
      userId: user.id,
    },
  });

  await refreshQuantityRequestStatus(tx, item.asset.id, user.id);
}

async function getUserReservations(
  tx: Prisma.TransactionClient,
  userId: string,
  assetIds: string[],
) {
  const reservations = await tx.assetReservation.findMany({
    where: {
      assetId: { in: assetIds },
      userId,
    },
  });

  return new Map(
    reservations.map((reservation) => [reservation.assetId, reservation]),
  );
}

export async function getSubmittableItems(
  tx: Prisma.TransactionClient,
  user: CurrentUser,
  requestedItems: WorkflowRequestItem[],
  hasExplicitItems: boolean,
) {
  const quantityAssetIds = requestedItems
    .filter((item) => isQuantityAsset(item.asset))
    .map((item) => item.asset.id);
  const reservations = await getUserReservations(tx, user.id, quantityAssetIds);

  return requestedItems.map((item) => {
    if (!isQuantityAsset(item.asset)) {
      return item;
    }

    const reservation = reservations.get(item.asset.id);

    if (!reservation) {
      throw new WorkflowError(
        `Asset ${assetDisplayName(item.asset)} is not reserved by you.`,
        409,
        "ASSET_NOT_RESERVED",
      );
    }

    const quantity = hasExplicitItems ? item.quantity : reservation.quantity;

    if (quantity > reservation.quantity) {
      throw new WorkflowError(
        `Asset ${assetDisplayName(item.asset)} has only ${reservation.quantity} reserved by you.`,
        409,
        "INSUFFICIENT_RESERVED_QUANTITY",
      );
    }

    return { ...item, quantity };
  });
}

export function assertAssetsCanSubmit(
  user: CurrentUser,
  items: WorkflowRequestItem[],
) {
  for (const { asset, quantity } of items) {
    assertCanRequestWarehouse(user, asset.warehouse.code);

    if (isQuantityAsset(asset)) {
      if (
        asset.status !== AssetStatus.READY &&
        asset.status !== AssetStatus.REQUEST
      ) {
        throw new WorkflowError(
          `Asset ${assetDisplayName(asset)} is not ready for request.`,
          409,
          "ASSET_NOT_READY",
        );
      }

      if (quantity > asset.assetQuantity) {
        throw new WorkflowError(
          `Asset ${assetDisplayName(asset)} has only ${asset.assetQuantity} total quantity.`,
          409,
          "INSUFFICIENT_ASSET_QUANTITY",
        );
      }

      continue;
    }

    if (quantity !== 1) {
      throw new WorkflowError(
        `Serial asset ${assetDisplayName(asset)} can only be submitted with quantity 1.`,
        409,
        "INVALID_SERIAL_QUANTITY",
      );
    }

    if (asset.status !== AssetStatus.REQUEST) {
      throw new WorkflowError(
        `Asset ${assetDisplayName(asset)} is not held for request.`,
        409,
        "ASSET_NOT_REQUESTED",
      );
    }

    if (asset.requestLockedById !== user.id) {
      throw new WorkflowError(
        `Asset ${assetDisplayName(asset)} is locked by another user.`,
        409,
        "ASSET_LOCKED_BY_ANOTHER_USER",
      );
    }
  }
}

export async function assertAssetsCanRelease(
  tx: Prisma.TransactionClient,
  user: CurrentUser,
  items: WorkflowRequestItem[],
) {
  const quantityAssetIds = items
    .filter((item) => isQuantityAsset(item.asset))
    .map((item) => item.asset.id);
  const reservations = await getUserReservations(tx, user.id, quantityAssetIds);

  for (const { asset, quantity } of items) {
    assertCanRequestWarehouse(user, asset.warehouse.code);

    if (isQuantityAsset(asset)) {
      const reservation = reservations.get(asset.id);

      if (!reservation) {
        throw new WorkflowError(
          `Asset ${assetDisplayName(asset)} is not reserved by you.`,
          409,
          "ASSET_NOT_RESERVED",
        );
      }

      if (quantity > reservation.quantity) {
        throw new WorkflowError(
          `Asset ${assetDisplayName(asset)} has only ${reservation.quantity} reserved by you.`,
          409,
          "INSUFFICIENT_RESERVED_QUANTITY",
        );
      }

      continue;
    }

    if (asset.status !== AssetStatus.REQUEST) {
      throw new WorkflowError(
        `Asset ${assetDisplayName(asset)} is not in request state.`,
        409,
        "ASSET_NOT_REQUESTED",
      );
    }

    if (asset.requestLockedById !== user.id) {
      throw new WorkflowError(
        `Asset ${assetDisplayName(asset)} is locked by another user.`,
        409,
        "ASSET_LOCKED_BY_ANOTHER_USER",
      );
    }
  }
}

export async function updateSubmittedAsset(
  tx: Prisma.TransactionClient,
  asset: WorkflowAsset,
  userId: string,
  toStatus: AssetStatus,
) {
  const result = await tx.asset.updateMany({
    where: {
      id: asset.id,
      requestLockedById: userId,
      status: AssetStatus.REQUEST,
    },
    data: {
      requestLockedAt: null,
      requestLockedById: null,
      status: toStatus,
      updatedById: userId,
    },
  });

  if (result.count !== 1) {
    throw new WorkflowError(
      `Asset ${assetDisplayName(asset)} request lock changed before submit.`,
      409,
      "ASSET_SUBMIT_CONFLICT",
    );
  }
}

export async function consumeQuantityReservation(
  tx: Prisma.TransactionClient,
  item: WorkflowRequestItem,
  userId: string,
) {
  const reservation = await tx.assetReservation.findUnique({
    where: {
      assetId_userId: {
        assetId: item.asset.id,
        userId,
      },
    },
  });

  if (!reservation || reservation.quantity < item.quantity) {
    throw new WorkflowError(
      `Asset ${assetDisplayName(item.asset)} reservation changed before submit.`,
      409,
      "ASSET_RESERVATION_CONFLICT",
    );
  }

  if (reservation.quantity === item.quantity) {
    await tx.assetReservation.delete({ where: { id: reservation.id } });
    return;
  }

  await tx.assetReservation.update({
    data: { quantity: { decrement: item.quantity } },
    where: { id: reservation.id },
  });
}

async function decrementQuantityAsset(
  tx: Prisma.TransactionClient,
  item: WorkflowRequestItem,
  userId: string,
  toStatus: AssetStatus,
  transactionId: string,
) {
  const result = await tx.asset.updateMany({
    where: {
      assetQuantity: { gte: item.quantity },
      id: item.asset.id,
      isActive: true,
    },
    data: {
      assetQuantity: { decrement: item.quantity },
      updatedById: userId,
    },
  });

  if (result.count !== 1) {
    throw new WorkflowError(
      `Asset ${assetDisplayName(item.asset)} does not have enough quantity.`,
      409,
      "INSUFFICIENT_ASSET_QUANTITY",
    );
  }

  const updatedAsset = await tx.asset.findUnique({
    where: { id: item.asset.id },
    select: { assetQuantity: true },
  });
  if (!updatedAsset)
    throw new WorkflowError(
      "Stock row disappeared while posting.",
      409,
      "ASSET_POST_CONFLICT",
    );
  await tx.assetStatusHistory.create({
    data: {
      actionType: AssetActionType.REQUEST_SUBMIT,
      assetId: item.asset.id,
      changedById: userId,
      fromStatus: item.asset.status,
      toStatus,
      condition: item.asset.condition,
      stockCode: item.asset.stockCode,
      quantityBefore: updatedAsset.assetQuantity + item.quantity,
      quantityAfter: updatedAsset.assetQuantity,
      quantityChanged: -item.quantity,
      note: "Approved quantity issue or direct sale",
      transactionId,
    },
  });

  if (
    (updatedAsset?.assetQuantity ?? 0) <= 0 &&
    toStatus === AssetStatus.SOLD
  ) {
    await tx.asset.update({
      data: { status: AssetStatus.SOLD, updatedById: userId },
      where: { id: item.asset.id },
    });
  }
}

export async function updateSubmittedQuantityAsset(
  tx: Prisma.TransactionClient,
  item: WorkflowRequestItem,
  userId: string,
  toStatus: AssetStatus,
  transactionId: string,
) {
  if (
    toStatus === AssetStatus.BORROW ||
    toStatus === AssetStatus.USING ||
    toStatus === AssetStatus.SOLD
  ) {
    await decrementQuantityAsset(tx, item, userId, toStatus, transactionId);
  }
}

export async function releaseHeldAsset(
  tx: Prisma.TransactionClient,
  asset: WorkflowAsset,
  userId: string,
) {
  const result = await tx.asset.updateMany({
    where: {
      id: asset.id,
      isActive: true,
      OR: [{ requestLockedById: userId }, { requestLockedById: null }],
      status: { in: [AssetStatus.READY, AssetStatus.REQUEST] },
    },
    data: {
      requestLockedAt: null,
      requestLockedById: null,
      status: AssetStatus.READY,
      updatedById: userId,
    },
  });

  if (result.count === 1) {
    return;
  }

  const currentAsset = await tx.asset.findUnique({
    where: { id: asset.id },
    select: { requestLockedById: true, status: true },
  });

  if (
    currentAsset?.requestLockedById &&
    currentAsset.requestLockedById !== userId
  ) {
    throw new WorkflowError(
      `Asset ${assetDisplayName(asset)} is locked by another user.`,
      409,
      "ASSET_LOCKED_BY_ANOTHER_USER",
    );
  }
}

export async function releaseQuantityReservation(
  tx: Prisma.TransactionClient,
  item: WorkflowRequestItem,
  userId: string,
) {
  const reservation = await tx.assetReservation.findUnique({
    where: {
      assetId_userId: {
        assetId: item.asset.id,
        userId,
      },
    },
  });

  if (!reservation) {
    throw new WorkflowError(
      `Asset ${assetDisplayName(item.asset)} is not reserved by you.`,
      409,
      "ASSET_NOT_RESERVED",
    );
  }

  if (item.quantity >= reservation.quantity) {
    await tx.assetReservation.delete({ where: { id: reservation.id } });
    await refreshQuantityRequestStatus(tx, item.asset.id, userId);
    return;
  }

  await tx.assetReservation.update({
    data: { quantity: { decrement: item.quantity } },
    where: { id: reservation.id },
  });
  await refreshQuantityRequestStatus(tx, item.asset.id, userId);
}

type SerialSwapAsset = {
  id: string;
  serialNo: string;
  stockCode: string | null;
  model: string;
};

async function assertStoremanCanSwap(
  tx: Prisma.TransactionClient,
  user: CurrentUser,
  transactionId: string,
  itemId: string,
) {
  const transaction = await tx.transaction.findUnique({
    where: { id: transactionId },
    select: {
      sourceTransactionId: true,
      type: true,
      workflowStatus: true,
      outcomeRecords: { select: { id: true }, take: 1 },
      approvals: {
        where: { isCurrent: true },
        select: {
          id: true,
          requiredTag: true,
          status: true,
          stepSequence: true,
          userId: true,
        },
      },
      items: {
        where: { id: itemId },
        select: {
          id: true,
          assetId: true,
          asset: {
            select: {
              serialNo: true,
              stockCode: true,
              warehouseId: true,
              warehouse: { select: { code: true } },
              status: true,
              assetModel: {
                select: {
                  isSerialized: true,
                  categoryId: true,
                  assetTypeId: true,
                  partNo: true,
                  name: true,
                  description: true,
                  brand: true,
                  modelNo: true,
                  typeName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!transaction || transaction.items.length === 0) {
    throw new WorkflowError("Transaction item not found.", 404);
  }
  const item = transaction.items[0];
  if (!item.asset || !item.assetId)
    throw new WorkflowError(
      "The requested serial asset is missing.",
      409,
      "TRANSACTION_ASSET_MISSING",
    );
  if (
    transaction.type !== TransactionType.BORROW &&
    transaction.type !== TransactionType.USING &&
    transaction.type !== TransactionType.SOLD
  ) {
    throw new WorkflowError(
      "Serial numbers can only be assigned for Borrow, Using, or direct Sale requests.",
      409,
    );
  }
  if (
    transaction.sourceTransactionId ||
    transaction.outcomeRecords.length > 0
  ) {
    throw new WorkflowError(
      "Serial numbers cannot be changed during return resolution.",
      409,
      "SERIAL_SWAP_NOT_ALLOWED_ON_RETURN",
    );
  }
  if (transaction.workflowStatus !== TransactionWorkflowStatus.PENDING) {
    throw new WorkflowError(
      "Serial numbers can only be assigned during approval.",
      409,
    );
  }
  if (getEffectiveAssetTrackMethod(item.asset) === AssetTrackMethod.QUANTITY) {
    throw new WorkflowError(
      "Quantity-tracked items do not require a serial number.",
      409,
    );
  }
  if (item.asset.status !== AssetStatus.REQUEST) {
    throw new WorkflowError(
      "The requested serial is no longer held for this transaction.",
      409,
    );
  }

  const pending = currentPendingApproval(user, transaction.approvals);
  if (!pending || !isWarehouseStockControllerRequiredTag(pending.requiredTag)) {
    throw new WorkflowError(
      "Only the Storeman assigned to this approval step can change the serial number.",
      403,
    );
  }

  const warehouseCode = pending.requiredTag.split(":")[1];
  if (
    warehouseCode !== item.asset.warehouse.code ||
    !canManageWarehouseForUser(user, warehouseCode)
  ) {
    throw new WorkflowError(
      "You can only change serial numbers in warehouses managed by you.",
      403,
    );
  }

  return {
    item: { ...item, asset: item.asset, assetId: item.assetId },
    warehouseCode,
  };
}

export async function findStoremanSerialOptions(
  user: CurrentUser,
  transactionId: string,
  itemId: string,
  search = "",
): Promise<SerialSwapAsset[]> {
  return db.$transaction(async (tx) => {
    const { item } = await assertStoremanCanSwap(
      tx,
      user,
      transactionId,
      itemId,
    );
    if (
      getEffectiveAssetTrackMethod(item.asset) === AssetTrackMethod.QUANTITY
    ) {
      throw new WorkflowError(
        "Quantity-tracked items cannot be swapped by serial number.",
        409,
      );
    }
    const assets = await tx.asset.findMany({
      orderBy: { serialNo: "asc" },
      select: {
        id: true,
        serialNo: true,
        stockCode: true,
        assetModel: { select: { name: true } },
      },
      where: {
        id: { not: item.assetId },
        isActive: true,
        serialNo: { not: null },
        status: AssetStatus.READY,
        warehouseId: item.asset.warehouseId,
        assetModel: {
          categoryId: item.asset.assetModel.categoryId,
          assetTypeId: item.asset.assetModel.assetTypeId,
          partNo: item.asset.assetModel.partNo,
          name: item.asset.assetModel.name,
        },
      },
    });
    const normalizedSearch = search.trim().toLowerCase();
    const choices = assets
      .filter(
        (asset) =>
          !normalizedSearch ||
          [asset.serialNo, asset.stockCode, asset.assetModel.name].some(
            (value) => value?.toLowerCase().includes(normalizedSearch),
          ),
      )
      .map((asset) => ({
        id: asset.id,
        serialNo: asset.serialNo as string,
        stockCode: asset.stockCode,
        model: asset.assetModel.name,
      }));
    if (
      item.asset.serialNo &&
      (!normalizedSearch ||
        [
          item.asset.serialNo,
          item.asset.stockCode,
          item.asset.assetModel.name,
        ].some((value) => value?.toLowerCase().includes(normalizedSearch)))
    ) {
      choices.unshift({
        id: item.assetId,
        serialNo: item.asset.serialNo,
        stockCode: item.asset.stockCode,
        model: item.asset.assetModel.name,
      });
    }
    return choices;
  });
}

export async function swapStoremanSerialNumber(
  user: CurrentUser,
  transactionId: string,
  itemId: string,
  replacementAssetId: string,
) {
  return db.$transaction(async (tx) => {
    const { item } = await assertStoremanCanSwap(
      tx,
      user,
      transactionId,
      itemId,
    );
    if (replacementAssetId === item.assetId) {
      if (!item.asset.serialNo) {
        throw new WorkflowError(
          "This item does not have a valid serial number.",
          409,
        );
      }
      await tx.transactionItem.update({
        where: { id: itemId },
        data: { dispatchedAt: new Date(), dispatchedById: user.id },
      });
      return { ok: true, assetId: item.assetId, serialNo: item.asset.serialNo };
    }
    const replacement = await tx.asset.findUnique({
      where: { id: replacementAssetId },
      select: {
        id: true,
        status: true,
        serialNo: true,
        warehouseId: true,
        assetModel: {
          select: {
            isSerialized: true,
            categoryId: true,
            assetTypeId: true,
            partNo: true,
            name: true,
            description: true,
            brand: true,
            modelNo: true,
            typeName: true,
          },
        },
      },
    });
    const oldModel = item.asset.assetModel;
    if (
      !replacement ||
      replacement.status !== AssetStatus.READY ||
      !replacement.serialNo ||
      replacement.warehouseId !== item.asset.warehouseId ||
      getEffectiveAssetTrackMethod(replacement) === AssetTrackMethod.QUANTITY ||
      replacement.assetModel.categoryId !== oldModel.categoryId ||
      replacement.assetModel.assetTypeId !== oldModel.assetTypeId ||
      replacement.assetModel.partNo !== oldModel.partNo ||
      replacement.assetModel.name !== oldModel.name
    ) {
      throw new WorkflowError(
        "Replacement asset must be Ready and match the same category, type, part number, and model.",
        409,
      );
    }

    const released = await tx.asset.updateMany({
      where: { id: item.assetId, status: AssetStatus.REQUEST },
      data: {
        requestLockedAt: null,
        requestLockedById: null,
        status: AssetStatus.READY,
        updatedById: user.id,
      },
    });
    if (released.count !== 1)
      throw new WorkflowError(
        "The requested asset is no longer available for swapping.",
        409,
      );
    const held = await tx.asset.updateMany({
      where: { id: replacement.id, status: AssetStatus.READY },
      data: {
        requestLockedAt: new Date(),
        requestLockedById: (
          await tx.transaction.findUniqueOrThrow({
            where: { id: transactionId },
            select: { requestedById: true },
          })
        ).requestedById,
        status: AssetStatus.REQUEST,
        updatedById: user.id,
      },
    });
    if (held.count !== 1)
      throw new WorkflowError("The replacement asset is no longer Ready.", 409);
    await tx.transactionItem.update({
      where: { id: itemId },
      data: {
        assetId: replacement.id,
        dispatchedAt: new Date(),
        dispatchedById: user.id,
      },
    });
    await tx.assetStatusHistory.createMany({
      data: [
        {
          actionType: AssetActionType.STATUS_CHANGE,
          assetId: item.assetId,
          changedById: user.id,
          fromStatus: AssetStatus.REQUEST,
          toStatus: AssetStatus.READY,
          note: "Released after Storeman serial swap",
          transactionId,
        },
        {
          actionType: AssetActionType.REQUEST_HOLD,
          assetId: replacement.id,
          changedById: user.id,
          fromStatus: AssetStatus.READY,
          toStatus: AssetStatus.REQUEST,
          note: "Held after Storeman serial swap",
          transactionId,
        },
      ],
    });
    return {
      ok: true,
      assetId: replacement.id,
      serialNo: replacement.serialNo,
    };
  });
}

export async function resolveItem(
  tx: Prisma.TransactionClient,
  item: TransactionDetail["items"][number],
  user: CurrentUser,
  now: Date,
  toStatus: AssetStatus,
  note: string | null,
  soldPrice: string | null = null,
  resolvedQuantity = item.requestedQuantity,
) {
  if (isQuantityTransactionItem(item)) {
    if (toStatus === AssetStatus.SOLD) {
      const result = await tx.asset.updateMany({
        where: {
          assetQuantity: { gte: resolvedQuantity },
          id: item.assetId,
          isActive: true,
        },
        data: {
          assetQuantity: { decrement: resolvedQuantity },
          updatedById: user.id,
        },
      });

      if (result.count !== 1) {
        throw new WorkflowError(
          `Asset ${transactionItemAssetName(item)} does not have enough quantity to sell.`,
          409,
          "INSUFFICIENT_ASSET_QUANTITY",
        );
      }
    }

    const updatedAsset = await tx.asset.findUnique({
      where: { id: item.assetId },
      select: { assetQuantity: true },
    });

    await tx.asset.update({
      where: { id: item.assetId },
      data: {
        requestLockedAt: null,
        requestLockedById: null,
        status:
          toStatus === AssetStatus.SOLD &&
          (updatedAsset?.assetQuantity ?? 0) <= 0
            ? AssetStatus.SOLD
            : toStatus === AssetStatus.READY ||
                (updatedAsset?.assetQuantity ?? 0) > 0
              ? AssetStatus.READY
              : toStatus,
        updatedById: user.id,
      },
    });

    await tx.transactionItem.update({
      where: { id: item.id },
      data: {
        resolutionNote: note,
        resolvedStatus: toStatus,
        soldPrice:
          toStatus === AssetStatus.SOLD && soldPrice
            ? new Prisma.Decimal(soldPrice)
            : null,
        returnedAt: resolvedQuantity >= item.requestedQuantity ? now : null,
        returnedById: user.id,
      },
    });

    return;
  }

  const result = await tx.asset.updateMany({
    where: { id: item.assetId, status: item.toStatus },
    data: {
      requestLockedAt: null,
      requestLockedById: null,
      status: toStatus,
      updatedById: user.id,
    },
  });

  if (result.count !== 1) {
    throw new WorkflowError(
      `Asset ${transactionItemAssetName(item)} is not currently ${item.toStatus}.`,
      409,
      "ASSET_RETURN_CONFLICT",
    );
  }

  await tx.transactionItem.update({
    where: { id: item.id },
    data: {
      resolutionNote: note,
      resolvedStatus: toStatus,
      soldPrice:
        toStatus === AssetStatus.SOLD && soldPrice
          ? new Prisma.Decimal(soldPrice)
          : null,
      returnedAt: now,
      returnedById: user.id,
    },
  });
}

export async function applyQuantityReturnStock(
  tx: Prisma.TransactionClient,
  item: TransactionDetail["items"][number],
  condition: AssetCondition,
  quantity: number,
  userId: string,
  stockCodeAssetId: string | null,
) {
  const sourceAsset = item.asset;
  if (!sourceAsset) {
    throw new WorkflowError(
      "The returned quantity is not linked to an asset model.",
      409,
      "RETURN_ASSET_MISSING",
    );
  }

  if (!stockCodeAssetId) {
    throw new WorkflowError(
      "Storeman must select an existing Stock Code before approving this return.",
      409,
      "RETURN_STOCK_CODE_REQUIRED",
    );
  }

  const stockCodeSource = await tx.asset.findFirst({
    where: {
      id: stockCodeAssetId,
      warehouseId: sourceAsset.warehouseId,
      assetModelId: sourceAsset.assetModelId,
      isActive: true,
      serialNo: null,
      stockCode: { not: null },
    },
    select: {
      id: true,
      assetModelId: true,
      assetModel: {
        select: {
          id: true,
          name: true,
          brand: true,
          partNo: true,
          description: true,
        },
      },
      stockCode: true,
    },
  });

  const selectedStockCode = stockCodeSource?.stockCode;
  if (
    !stockCodeSource ||
    !selectedStockCode ||
    (condition === AssetCondition.NEW &&
      selectedStockCode !== sourceAsset.stockCode)
  ) {
    throw new WorkflowError(
      "The selected Stock Code must match the canonical model, warehouse and condition. Legacy Used masters require an approved migration first.",
      409,
      "RETURN_STOCK_CODE_INVALID",
    );
  }

  const bucketKey = JSON.stringify([
    sourceAsset.assetModelId,
    sourceAsset.warehouseId,
    selectedStockCode,
    condition,
  ]);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${bucketKey}, 0))`;

  const existing = await tx.asset.findFirst({
    where: {
      assetModelId: sourceAsset.assetModelId,
      warehouseId: sourceAsset.warehouseId,
      condition,
      stockCode: selectedStockCode,
      isActive: true,
      serialNo: null,
    },
    select: { id: true, assetQuantity: true },
  });

  if (existing) {
    const quantityBefore = existing.assetQuantity;
    const quantityAfter = quantityBefore + quantity;
    const updated = await tx.asset.update({
      where: { id: existing.id },
      data: {
        assetQuantity: { increment: quantity },
        requestLockedAt: null,
        requestLockedById: null,
        status: AssetStatus.READY,
        updatedById: userId,
      },
      select: { id: true },
    });
    return {
      assetId: updated.id,
      stockCode: selectedStockCode,
      quantityBefore,
      quantityAfter,
    };
  }

  const created = await tx.asset.create({
    data: {
      assetModelId: sourceAsset.assetModelId,
      warehouseId: sourceAsset.warehouseId,
      condition,
      stockCode: selectedStockCode,
      status: AssetStatus.READY,
      assetQuantity: quantity,
      createdById: userId,
      updatedById: userId,
      note: "Created from approved quantity-pool return using selected Stock Code",
    },
    select: { id: true },
  });
  return {
    assetId: created.id,
    stockCode: selectedStockCode,
    quantityBefore: 0,
    quantityAfter: quantity,
  };
}

export async function changeAssetStatus(
  user: CurrentUser,
  input: ChangeAssetStatusInput,
) {
  const note = requireText(input.note, "Note");

  return db.$transaction(
    async (tx) => {
      const asset = await tx.asset.findFirst({
        where: { id: input.assetId, isActive: true },
        select: assetWorkflowSelect,
      });

      if (!asset) {
        throw new WorkflowError("Asset not found.", 404);
      }

      assertCanChangeAssetStatus(user, asset.warehouse.code);

      if (!canTransitionAssetStatus(asset.status, input.toStatus)) {
        throw new WorkflowError(
          `Cannot change ${asset.serialNo} from ${asset.status} to ${input.toStatus}.`,
          409,
          "INVALID_STATUS_TRANSITION",
        );
      }

      const result = await tx.asset.updateMany({
        where: { id: asset.id, status: asset.status },
        data: {
          requestLockedAt: null,
          requestLockedById: null,
          status: input.toStatus,
          updatedById: user.id,
        },
      });

      if (result.count !== 1) {
        throw new WorkflowError("Asset changed before status update.", 409);
      }

      await tx.assetStatusHistory.create({
        data: {
          actionType: getManualStatusAction(asset.status, input.toStatus),
          assetId: asset.id,
          changedById: user.id,
          fromStatus: asset.status,
          note,
          toStatus: input.toStatus,
        },
      });

      return tx.asset.findUnique({
        where: { id: asset.id },
        select: assetWorkflowSelect,
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
