import { randomUUID } from "node:crypto";
import {
  AssetActionType,
  AssetStatus,
  Prisma,
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
      returnedAt: true,
      toStatus: true,
      asset: {
        select: {
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
  assetIds: string[];
  note?: string | null;
};

export type SubmitTransactionInput = {
  assetIds: string[];
  documentRef?: string | null;
  dueDate?: Date | null;
  internalRequest?: boolean;
  note?: string | null;
  projectRequest?: boolean;
  purpose: string;
  requestDate: Date;
  serviceRequest?: boolean;
  soldPrice?: string | null;
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
  assetIds: string[];
  note?: string | null;
};

export type ChangeAssetStatusInput = {
  assetId: string;
  note: string;
  toStatus: AssetStatus;
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

function assertHasIds(ids: string[], label: string) {
  if (ids.length === 0) {
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

function assertAllAssetsFound(assetIds: string[], assets: WorkflowAsset[]) {
  const foundIds = new Set(assets.map((asset) => asset.id));
  const missingId = assetIds.find((assetId) => !foundIds.has(assetId));

  if (missingId) {
    throw new WorkflowError(`Asset not found: ${missingId}`, 404);
  }
}

function assertAssetsCanBeHeld(user: CurrentUser, assets: WorkflowAsset[]) {
  for (const asset of assets) {
    assertCanRequestDomain(user, asset.domain.code);

    if (asset.status !== AssetStatus.READY) {
      throw new WorkflowError(
        `Asset ${asset.serialNo} is not ready for request.`,
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
      `Asset ${asset.serialNo} was already requested or changed.`,
      409,
      "ASSET_REQUEST_CONFLICT",
    );
  }
}

async function getHeldAssets(
  tx: Prisma.TransactionClient,
  assetIds: string[],
) {
  const assets = await findAssets(tx, assetIds);
  assertAllAssetsFound(assetIds, assets);
  return assets;
}

function assertAssetsCanSubmit(user: CurrentUser, assets: WorkflowAsset[]) {
  for (const asset of assets) {
    assertCanRequestDomain(user, asset.domain.code);

    if (asset.status !== AssetStatus.REQUEST) {
      throw new WorkflowError(
        `Asset ${asset.serialNo} is not held for request.`,
        409,
        "ASSET_NOT_REQUESTED",
      );
    }

    if (asset.requestLockedById !== user.id) {
      throw new WorkflowError(
        `Asset ${asset.serialNo} is locked by another user.`,
        409,
        "ASSET_LOCKED_BY_ANOTHER_USER",
      );
    }
  }
}

function assertAssetsCanRelease(user: CurrentUser, assets: WorkflowAsset[]) {
  for (const asset of assets) {
    assertCanRequestDomain(user, asset.domain.code);

    if (asset.status !== AssetStatus.REQUEST) {
      throw new WorkflowError(
        `Asset ${asset.serialNo} is not in request state.`,
        409,
        "ASSET_NOT_REQUESTED",
      );
    }

    if (asset.requestLockedById !== user.id) {
      throw new WorkflowError(
        `Asset ${asset.serialNo} is locked by another user.`,
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

  if (
    (input.type === TransactionType.BORROW || input.type === TransactionType.USING) &&
    !input.dueDate
  ) {
    throw new WorkflowError("Due date is required for borrow and using transactions.");
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
      `Asset ${asset.serialNo} request lock changed before submit.`,
      409,
      "ASSET_SUBMIT_CONFLICT",
    );
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
      `Asset ${asset.serialNo} request lock changed before release.`,
      409,
      "ASSET_RELEASE_CONFLICT",
    );
  }
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

async function resolveItem(
  tx: Prisma.TransactionClient,
  item: TransactionDetail["items"][number],
  user: CurrentUser,
  now: Date,
  toStatus: AssetStatus,
  note: string | null,
) {
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
      `Asset ${item.asset.serialNo} is not currently ${item.toStatus}.`,
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
      data: { returnedAt: now },
    });
  }
}

export async function holdAssetsForRequest(
  user: CurrentUser,
  input: HoldAssetsInput,
) {
  const assetIds = uniqueIds(input.assetIds);
  assertHasIds(assetIds, "Asset ids");
  const note = cleanText(input.note);
  const now = new Date();

  return db.$transaction(
    async (tx) => {
      const assets = await getHeldAssets(tx, assetIds);
      assertAssetsCanBeHeld(user, assets);

      for (const asset of assets) {
        await holdAsset(tx, asset, user, now);
      }

      await tx.assetStatusHistory.createMany({
        data: assets.map((asset) => ({
          actionType: AssetActionType.REQUEST_HOLD,
          assetId: asset.id,
          changedById: user.id,
          fromStatus: AssetStatus.READY,
          note,
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
  const assetIds = uniqueIds(input.assetIds);
  assertHasIds(assetIds, "Asset ids");
  const { purpose, soldPrice } = assertTransactionInput(input);
  const note = cleanText(input.note);
  const now = new Date();
  const toStatus = getTransactionAssetStatus(input.type);

  return db.$transaction(
    async (tx) => {
      const assets = await getHeldAssets(tx, assetIds);
      assertAssetsCanSubmit(user, assets);
      const transaction = await tx.transaction.create({
        data: {
          completedAt: now,
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
        },
      });

      await tx.transactionItem.createMany({
        data: assets.map((asset) => ({
          assetId: asset.id,
          fromStatus: AssetStatus.REQUEST,
          note,
          toStatus,
          transactionId: transaction.id,
        })),
      });

      for (const asset of assets) {
        await updateSubmittedAsset(tx, asset, user.id, toStatus);
      }

      await tx.assetStatusHistory.createMany({
        data: assets.map((asset) => ({
          actionType: AssetActionType.REQUEST_SUBMIT,
          assetId: asset.id,
          changedById: user.id,
          fromStatus: AssetStatus.REQUEST,
          note,
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
  const assetIds = uniqueIds(input.assetIds);
  assertHasIds(assetIds, "Asset ids");
  const note = cleanText(input.note) ?? "Removed from request list.";

  return db.$transaction(
    async (tx) => {
      const assets = await getHeldAssets(tx, assetIds);
      assertAssetsCanRelease(user, assets);

      for (const asset of assets) {
        await releaseHeldAsset(tx, asset, user.id);
      }

      await tx.assetStatusHistory.createMany({
        data: assets.map((asset) => ({
          actionType: AssetActionType.STATUS_CHANGE,
          assetId: asset.id,
          changedById: user.id,
          fromStatus: AssetStatus.REQUEST,
          note,
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
