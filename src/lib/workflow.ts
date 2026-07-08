import { randomUUID } from "node:crypto";
import {
  AssetActionType,
  AssetTrackMethod,
  AssetStatus,
  Prisma,
  TransactionStatus,
  TransactionWorkflowStatus,
  TransactionType,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  assertCanChangeAssetStatus,
  assertCanRequestDomain,
  assertCanViewDomain,
} from "@/lib/permissions";
import {
  canTransitionAssetStatus,
  getInitialTransactionStatus,
  getManualStatusAction,
  getTransactionAssetStatus,
  isTransactionItemResolutionStatus,
  isReturnableTransaction,
} from "@/lib/workflow-rules";

export class WorkflowError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
    readonly code = "WORKFLOW_ERROR",
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}

const assetWorkflowSelect = Prisma.validator<Prisma.AssetSelect>()({
  assetModel: {
    select: {
      name: true,
      assetType: { select: { trackMethod: true } },
    },
  },
  assetQuantity: true,
  id: true,
  requestLockedById: true,
  serialNo: true,
  status: true,
  domain: { select: { code: true } },
});

const transactionDetailSelect = Prisma.validator<Prisma.TransactionSelect>()({
  id: true,
  completedAt: true,
  createdAt: true,
  documentRef: true,
  dueDate: true,
  internalRequest: true,
  note: true,
  projectRequest: true,
  purpose: true,
  requestDate: true,
  returnedAt: true,
  serviceRequest: true,
  soldPrice: true,
  status: true,
  transactionNo: true,
  type: true,
  requestedBy: { select: { email: true, id: true, name: true } },
  createdBy: { select: { email: true, id: true, name: true } },
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      assetId: true,
      fromStatus: true,
      note: true,
      requestedQuantity: true,
      returnedAt: true,
      toStatus: true,
      asset: {
        select: {
          assetQuantity: true,
          id: true,
          location: { select: { name: true } },
          locationText: true,
          serialNo: true,
          status: true,
          stockCode: true,
          domain: { select: { code: true } },
          assetModel: {
            select: {
              brand: true,
              assetType: { select: { trackMethod: true } },
              category: { select: { name: true } },
              name: true,
              typeName: true,
            },
          },
        },
      },
      resolvedStatus: true,
      resolutionNote: true,
      returnedBy: { select: { email: true, id: true, name: true } },
    },
  },
});

type WorkflowAsset = Prisma.AssetGetPayload<{
  select: typeof assetWorkflowSelect;
}>;

type TransactionDetail = Prisma.TransactionGetPayload<{
  select: typeof transactionDetailSelect;
}>;

export type HoldAssetsInput = {
  assetIds?: string[];
  items?: RequestAssetItemInput[];
  note?: string | null;
};

export type SubmitTransactionInput = {
  assetIds?: string[];
  documentRef?: string | null;
  dueDate?: Date | null;
  internalRequest?: boolean;
  note?: string | null;
  projectRequest?: boolean;
  purpose: string;
  requestDate: Date;
  serviceRequest?: boolean;
  soldPrice?: string | null;
  items?: RequestAssetItemInput[];
  type: TransactionType;
};

export type ResolveTransactionItemInput = {
  itemId: string;
  note?: string | null;
  toStatus: AssetStatus;
};

export type ResolveTransactionInput = {
  items: ResolveTransactionItemInput[];
  transactionId: string;
};

export type ReturnTransactionInput = {
  itemIds?: string[];
  note?: string | null;
  transactionId: string;
};

export type ReleaseAssetsInput = {
  assetIds?: string[];
  items?: RequestAssetItemInput[];
  note?: string | null;
};

export type ChangeAssetStatusInput = {
  assetId: string;
  note: string;
  toStatus: AssetStatus;
};

export type RequestAssetItemInput = {
  assetId: string;
  quantity?: number | null;
};

type NormalizedRequestItem = {
  assetId: string;
  quantity: number;
};

type WorkflowRequestItem = {
  asset: WorkflowAsset;
  quantity: number;
};

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requireText(value: string, label: string) {
  const trimmed = cleanText(value);

  if (!trimmed) {
    throw new WorkflowError(`${label} is required.`);
  }

  return trimmed;
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function requirePositiveQuantity(value: number | null | undefined, label: string) {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    throw new WorkflowError(`${label} must be greater than 0.`);
  }

  return value as number;
}

function addRequestItem(
  map: Map<string, number>,
  assetId: string | null | undefined,
  quantity: number,
) {
  const cleanedAssetId = assetId?.trim();

  if (!cleanedAssetId) {
    return;
  }

  map.set(cleanedAssetId, (map.get(cleanedAssetId) ?? 0) + quantity);
}

function normalizeRequestItems(input: {
  assetIds?: string[] | null;
  items?: RequestAssetItemInput[] | null;
}) {
  const items = new Map<string, number>();

  for (const assetId of input.assetIds ?? []) {
    addRequestItem(items, assetId, 1);
  }

  for (const item of input.items ?? []) {
    addRequestItem(
      items,
      item.assetId,
      requirePositiveQuantity(item.quantity ?? 1, "Requested quantity"),
    );
  }

  return Array.from(items, ([assetId, quantity]) => ({ assetId, quantity }));
}

function assertHasIds(ids: string[], label: string) {
  if (ids.length === 0) {
    throw new WorkflowError(`${label} is required.`);
  }
}

function assertHasItems(items: NormalizedRequestItem[], label: string) {
  if (items.length === 0) {
    throw new WorkflowError(`${label} is required.`);
  }
}

function createTransactionNo(type: TransactionType, now: Date) {
  const datePart = now.toISOString().slice(0, 10).replaceAll("-", "");
  return `${type}-${datePart}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

async function findAssets(
  tx: Prisma.TransactionClient,
  assetIds: string[],
) {
  return tx.asset.findMany({
    where: { id: { in: assetIds }, isActive: true },
    select: assetWorkflowSelect,
  });
}

async function findRequestItems(
  tx: Prisma.TransactionClient,
  items: NormalizedRequestItem[],
) {
  const assetIds = items.map((item) => item.assetId);
  const assets = await findAssets(tx, assetIds);
  assertAllAssetsFound(assetIds, assets);
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  return items.map((item) => {
    const asset = assetById.get(item.assetId);

    if (!asset) {
      throw new WorkflowError(`Asset not found: ${item.assetId}`, 404);
    }

    return { asset, quantity: item.quantity };
  });
}

function assertAllAssetsFound(assetIds: string[], assets: WorkflowAsset[]) {
  const foundIds = new Set(assets.map((asset) => asset.id));
  const missingId = assetIds.find((assetId) => !foundIds.has(assetId));

  if (missingId) {
    throw new WorkflowError(`Asset not found: ${missingId}`, 404);
  }
}

function isQuantityAsset(asset: WorkflowAsset) {
  return asset.assetModel.assetType?.trackMethod === AssetTrackMethod.QUANTITY;
}

function assetDisplayName(asset: WorkflowAsset) {
  return asset.serialNo ?? asset.assetModel.name;
}

async function sumDraftReservationQuantities(
  tx: Prisma.TransactionClient,
  assetIds: string[],
) {
  const reservations = await tx.assetReservation.groupBy({
    by: ["assetId"],
    _sum: { quantity: true },
    where: { assetId: { in: assetIds } },
  });

  return new Map(
    reservations.map((reservation) => [
      reservation.assetId,
      reservation._sum.quantity ?? 0,
    ]),
  );
}

async function sumOpenTransactionQuantities(
  tx: Prisma.TransactionClient,
  assetIds: string[],
) {
  const items = await tx.transactionItem.groupBy({
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

  return new Map(
    items.map((item) => [item.assetId, item._sum.requestedQuantity ?? 0]),
  );
}

async function getAvailableQuantities(
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
      const reserved =
        (draftReservations.get(asset.id) ?? 0) +
        (openTransactions.get(asset.id) ?? 0);

      return [asset.id, Math.max(0, asset.assetQuantity - reserved)];
    }),
  );
}

function assertAssetsCanBeHeld(
  user: CurrentUser,
  items: WorkflowRequestItem[],
  availableQuantities: Map<string, number>,
) {
  for (const { asset, quantity } of items) {
    assertCanRequestDomain(user, asset.domain.code);

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

async function holdAsset(
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

async function reserveQuantityAsset(
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

  return new Map(reservations.map((reservation) => [reservation.assetId, reservation]));
}

async function getSubmittableItems(
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

function assertAssetsCanSubmit(user: CurrentUser, items: WorkflowRequestItem[]) {
  for (const { asset, quantity } of items) {
    assertCanRequestDomain(user, asset.domain.code);

    if (isQuantityAsset(asset)) {
      if (asset.status !== AssetStatus.READY) {
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

async function assertAssetsCanRelease(
  tx: Prisma.TransactionClient,
  user: CurrentUser,
  items: WorkflowRequestItem[],
) {
  const quantityAssetIds = items
    .filter((item) => isQuantityAsset(item.asset))
    .map((item) => item.asset.id);
  const reservations = await getUserReservations(tx, user.id, quantityAssetIds);

  for (const { asset, quantity } of items) {
    assertCanRequestDomain(user, asset.domain.code);

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

function assertTransactionInput(input: SubmitTransactionInput) {
  const purpose = requireText(input.purpose, "Purpose");
  const soldPrice = cleanText(input.soldPrice);

  if (Number.isNaN(input.requestDate.getTime())) {
    throw new WorkflowError("Request date is required.");
  }

  if (input.type === TransactionType.SOLD && !soldPrice) {
    throw new WorkflowError("Price is required for sold transactions.");
  }

  if (input.type === TransactionType.SOLD && soldPrice && Number.isNaN(Number(soldPrice))) {
    throw new WorkflowError("Price must be a valid number.");
  }

  return { purpose, soldPrice };
}

async function updateSubmittedAsset(
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

async function consumeQuantityReservation(
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

  if ((updatedAsset?.assetQuantity ?? 0) <= 0) {
    await tx.asset.update({
      data: { status: AssetStatus.SOLD, updatedById: userId },
      where: { id: item.asset.id },
    });
  }
}

async function updateSubmittedQuantityAsset(
  tx: Prisma.TransactionClient,
  item: WorkflowRequestItem,
  userId: string,
  toStatus: AssetStatus,
) {
  await consumeQuantityReservation(tx, item, userId);

  if (toStatus === AssetStatus.SOLD) {
    await decrementQuantityAsset(tx, item, userId);
  }
}

async function releaseHeldAsset(
  tx: Prisma.TransactionClient,
  asset: WorkflowAsset,
  userId: string,
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
      status: AssetStatus.READY,
      updatedById: userId,
    },
  });

  if (result.count !== 1) {
    throw new WorkflowError(
      `Asset ${assetDisplayName(asset)} request lock changed before release.`,
      409,
      "ASSET_RELEASE_CONFLICT",
    );
  }
}

async function releaseQuantityReservation(
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
    return;
  }

  await tx.assetReservation.update({
    data: { quantity: { decrement: item.quantity } },
    where: { id: reservation.id },
  });
}

async function findTransactionDetail(
  tx: Prisma.TransactionClient,
  transactionId: string,
) {
  const transaction = await tx.transaction.findUnique({
    where: { id: transactionId },
    select: transactionDetailSelect,
  });

  if (!transaction) {
    throw new WorkflowError("Transaction not found.", 404);
  }

  return transaction;
}

export async function getTransactionResolutionForUser(
  user: CurrentUser,
  transactionId: string,
) {
  const transaction = await db.transaction.findUnique({
    where: { id: transactionId },
    select: transactionDetailSelect,
  });

  if (!transaction) {
    throw new WorkflowError("Transaction not found.", 404);
  }

  if (!isReturnableTransaction(transaction.type)) {
    throw new WorkflowError("This transaction type cannot be resolved.");
  }

  assertCanResolveItems(user, transaction.items);

  return transaction;
}

function assertCanResolveItems(user: CurrentUser, items: TransactionDetail["items"]) {
  for (const item of items) {
    assertCanViewDomain(user, item.asset.domain.code);
  }
}

function getOpenResolutionItems(
  transaction: TransactionDetail,
  requestedItems: ResolveTransactionItemInput[],
) {
  const requestedIds = new Set(requestedItems.map((item) => item.itemId));
  const items = transaction.items.filter((item) => requestedIds.has(item.id));

  if (items.length !== requestedIds.size) {
    throw new WorkflowError("One or more transaction items were not found.", 404);
  }

  return items.filter((item) => !item.returnedAt);
}

function buildResolutionMap(items: ResolveTransactionItemInput[]) {
  const map = new Map<string, ResolveTransactionItemInput>();

  for (const item of items) {
    if (map.has(item.itemId)) {
      throw new WorkflowError("Duplicate transaction item selected.");
    }

    if (!isTransactionItemResolutionStatus(item.toStatus)) {
      throw new WorkflowError(`Cannot resolve item to ${item.toStatus}.`);
    }

    map.set(item.itemId, item);
  }

  return map;
}

function isQuantityTransactionItem(item: TransactionDetail["items"][number]) {
  return item.asset.assetModel.assetType?.trackMethod === AssetTrackMethod.QUANTITY;
}

function transactionItemAssetName(item: TransactionDetail["items"][number]) {
  return item.asset.serialNo ?? item.asset.assetModel.name;
}

async function resolveItem(
  tx: Prisma.TransactionClient,
  item: TransactionDetail["items"][number],
  user: CurrentUser,
  now: Date,
  toStatus: AssetStatus,
  note: string | null,
) {
  if (isQuantityTransactionItem(item)) {
    if (toStatus === AssetStatus.SOLD) {
      const result = await tx.asset.updateMany({
        where: {
          assetQuantity: { gte: item.requestedQuantity },
          id: item.assetId,
          isActive: true,
        },
        data: {
          assetQuantity: { decrement: item.requestedQuantity },
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
          toStatus === AssetStatus.SOLD && (updatedAsset?.assetQuantity ?? 0) <= 0
            ? AssetStatus.SOLD
            : AssetStatus.READY,
        updatedById: user.id,
      },
    });

    await tx.transactionItem.update({
      where: { id: item.id },
      data: {
        resolutionNote: note,
        resolvedStatus: toStatus,
        returnedAt: now,
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
      returnedAt: now,
      returnedById: user.id,
    },
  });
}

async function refreshTransactionResolutionStatus(
  tx: Prisma.TransactionClient,
  transactionId: string,
  now: Date,
) {
  const openItems = await tx.transactionItem.count({
    where: { returnedAt: null, transactionId },
  });

  if (openItems === 0) {
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        completedAt: now,
        returnedAt: now,
        status: TransactionStatus.RETURNED,
        workflowStatus: TransactionWorkflowStatus.COMPLETED,
      },
    });
  }
}

export async function holdAssetsForRequest(
  user: CurrentUser,
  input: HoldAssetsInput,
) {
  const requestItems = normalizeRequestItems(input);
  assertHasItems(requestItems, "Asset items");
  const assetIds = uniqueIds(requestItems.map((item) => item.assetId));
  const note = cleanText(input.note);
  const now = new Date();

  return db.$transaction(
    async (tx) => {
      const items = await findRequestItems(tx, requestItems);
      const availableQuantities = await getAvailableQuantities(
        tx,
        items.map((item) => item.asset),
      );
      assertAssetsCanBeHeld(user, items, availableQuantities);

      for (const item of items) {
        if (isQuantityAsset(item.asset)) {
          await reserveQuantityAsset(tx, item, user, note);
        } else {
          await holdAsset(tx, item.asset, user, now);
        }
      }

      await tx.assetStatusHistory.createMany({
        data: items.map(({ asset, quantity }) => ({
          actionType: AssetActionType.REQUEST_HOLD,
          assetId: asset.id,
          changedById: user.id,
          fromStatus: AssetStatus.READY,
          note: isQuantityAsset(asset)
            ? [note, `Reserved quantity: ${quantity}`].filter(Boolean).join("\n")
            : note,
          toStatus: AssetStatus.REQUEST,
        })),
      });

      return findAssets(tx, assetIds);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function submitTransaction(
  user: CurrentUser,
  input: SubmitTransactionInput,
) {
  const requestItems = normalizeRequestItems(input);
  assertHasItems(requestItems, "Asset items");
  const { purpose, soldPrice } = assertTransactionInput(input);
  const note = cleanText(input.note);
  const now = new Date();
  const toStatus = getTransactionAssetStatus(input.type);

  return db.$transaction(
    async (tx) => {
      const requestedItems = await findRequestItems(tx, requestItems);
      const items = await getSubmittableItems(
        tx,
        user,
        requestedItems,
        Boolean(input.items?.length),
      );
      assertAssetsCanSubmit(user, items);
      const isSold = input.type === TransactionType.SOLD;
      const transaction = await tx.transaction.create({
        data: {
          completedAt: isSold ? now : null,
          createdById: user.id,
          documentRef: cleanText(input.documentRef),
          dueDate: input.dueDate ?? null,
          internalRequest: input.internalRequest ?? false,
          note,
          projectRequest: input.projectRequest ?? false,
          purpose,
          requestDate: input.requestDate,
          requestedById: user.id,
          serviceRequest: input.serviceRequest ?? false,
          soldPrice: soldPrice ? new Prisma.Decimal(soldPrice) : null,
          status: getInitialTransactionStatus(input.type),
          transactionNo: createTransactionNo(input.type, now),
          type: input.type,
          workflowStatus: isSold
            ? TransactionWorkflowStatus.COMPLETED
            : TransactionWorkflowStatus.IN_PROGRESS,
        },
      });

      await tx.transactionItem.createMany({
        data: items.map(({ asset, quantity }) => ({
          assetId: asset.id,
          fromStatus: isQuantityAsset(asset) ? AssetStatus.READY : AssetStatus.REQUEST,
          note,
          requestedQuantity: quantity,
          toStatus,
          transactionId: transaction.id,
        })),
      });

      for (const item of items) {
        if (isQuantityAsset(item.asset)) {
          await updateSubmittedQuantityAsset(tx, item, user.id, toStatus);
        } else {
          await updateSubmittedAsset(tx, item.asset, user.id, toStatus);
        }
      }

      await tx.assetStatusHistory.createMany({
        data: items.map(({ asset, quantity }) => ({
          actionType: AssetActionType.REQUEST_SUBMIT,
          assetId: asset.id,
          changedById: user.id,
          fromStatus: isQuantityAsset(asset) ? AssetStatus.READY : AssetStatus.REQUEST,
          note: isQuantityAsset(asset)
            ? [note, `Submitted quantity: ${quantity}`].filter(Boolean).join("\n")
            : note,
          toStatus,
          transactionId: transaction.id,
        })),
      });

      return findTransactionDetail(tx, transaction.id);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function releaseAssetsFromRequest(
  user: CurrentUser,
  input: ReleaseAssetsInput,
) {
  const requestItems = normalizeRequestItems(input);
  assertHasItems(requestItems, "Asset items");
  const assetIds = uniqueIds(requestItems.map((item) => item.assetId));
  const note = cleanText(input.note) ?? "Removed from request list.";

  return db.$transaction(
    async (tx) => {
      const items = await findRequestItems(tx, requestItems);
      await assertAssetsCanRelease(tx, user, items);

      for (const item of items) {
        if (isQuantityAsset(item.asset)) {
          await releaseQuantityReservation(tx, item, user.id);
        } else {
          await releaseHeldAsset(tx, item.asset, user.id);
        }
      }

      await tx.assetStatusHistory.createMany({
        data: items.map(({ asset, quantity }) => ({
          actionType: AssetActionType.STATUS_CHANGE,
          assetId: asset.id,
          changedById: user.id,
          fromStatus: AssetStatus.REQUEST,
          note: isQuantityAsset(asset)
            ? [note, `Released quantity: ${quantity}`].filter(Boolean).join("\n")
            : note,
          toStatus: AssetStatus.READY,
        })),
      });

      return findAssets(tx, assetIds);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function resolveTransactionItems(
  user: CurrentUser,
  input: ResolveTransactionInput,
) {
  const itemIds = uniqueIds(input.items.map((item) => item.itemId));
  assertHasIds(itemIds, "Transaction items");
  const resolutionMap = buildResolutionMap(
    input.items.map((item) => ({
      itemId: item.itemId.trim(),
      note: cleanText(item.note),
      toStatus: item.toStatus,
    })),
  );
  const now = new Date();

  return db.$transaction(
    async (tx) => {
      const transaction = await findTransactionDetail(tx, input.transactionId);

      if (!isReturnableTransaction(transaction.type)) {
        throw new WorkflowError("This transaction type cannot be returned.");
      }

      const items = getOpenResolutionItems(
        transaction,
        Array.from(resolutionMap.values()),
      );

      if (items.length === 0) {
        throw new WorkflowError("No open transaction items to resolve.", 409);
      }

      assertCanResolveItems(user, items);

      for (const item of items) {
        const resolution = resolutionMap.get(item.id);

        if (!resolution) {
          throw new WorkflowError("Missing resolution details.", 400);
        }

        await resolveItem(
          tx,
          item,
          user,
          now,
          resolution.toStatus,
          cleanText(resolution.note),
        );
      }

      await tx.assetStatusHistory.createMany({
        data: items.map((item) => {
          const resolution = resolutionMap.get(item.id);
          const toStatus = resolution?.toStatus ?? AssetStatus.READY;

          return {
            actionType: getManualStatusAction(item.toStatus, toStatus),
            assetId: item.assetId,
            changedById: user.id,
            fromStatus: item.toStatus,
            note: cleanText(resolution?.note),
            toStatus,
            transactionId: transaction.id,
          };
        }),
      });

      await refreshTransactionResolutionStatus(tx, transaction.id, now);

      return findTransactionDetail(tx, transaction.id);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function returnTransactionItems(
  user: CurrentUser,
  input: ReturnTransactionInput,
) {
  const itemIds = input.itemIds ? uniqueIds(input.itemIds) : undefined;

  if (!itemIds || itemIds.length === 0) {
    const transaction = await db.transaction.findUnique({
      where: { id: input.transactionId },
      select: { items: { select: { id: true, returnedAt: true } } },
    });

    if (!transaction) {
      throw new WorkflowError("Transaction not found.", 404);
    }

    return resolveTransactionItems(user, {
      items: transaction.items
        .filter((item) => !item.returnedAt)
        .map((item) => ({
          itemId: item.id,
          note: input.note,
          toStatus: AssetStatus.READY,
        })),
      transactionId: input.transactionId,
    });
  }

  return resolveTransactionItems(user, {
    items: itemIds.map((itemId) => ({
      itemId,
      note: input.note,
      toStatus: AssetStatus.READY,
    })),
    transactionId: input.transactionId,
  });
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

      assertCanChangeAssetStatus(user, asset.domain.code);

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

export async function markBorrowTransactionsOverdue(now = new Date()) {
  void now;

  return { count: 0 };
}
