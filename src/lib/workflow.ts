import { calculateSaleGrandTotal, validateSalePriceGroups, type SalePriceGroup } from "@/lib/sale-price-groups";
import { appendUsedReturnRemarks } from "@/lib/used-return-remark";
import {
  ApprovalStatus,
  AssetActionType,
  AssetCondition,
  AssetStatus,
  OrganizationTag,
  Prisma,
  ProjectTag,
  ProjectMemberTag,
  TransactionStatus,
  TransactionWorkflowStatus,
  TransactionType,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import {
  approvalMatchesUser,
  requiresRequesterSupervisorApproval,
  supervisorTagsForOrganizationTags,
  ACK_BSD_REQUIRED_TAG,
  ACK_WAREHOUSE_MANAGER_REQUIRED_TAG,
  isWarehouseStockControllerRequiredTag,
  warehouseStockControllerRequiredTag,
} from "@/lib/approval-flow";
import { db } from "@/lib/db";
import { AssetTrackMethod, getEffectiveAssetTrackMethod } from "@/lib/asset-tracking";
import {
  createMonthlyRequisitionNo,
  MonthlyRequisitionLimitError,
} from "@/lib/requisition-no";
import {
  assertCanChangeAssetStatus,
  assertCanRequestWarehouse,
  assertCanViewWarehouse,
  canManageWarehouseForUser,
  hasAnyRole,
} from "@/lib/permissions";
import {
  canTransitionAssetStatus,
  getInitialTransactionStatus,
  getManualStatusAction,
  getTransactionAssetStatus,
  isTransactionItemResolutionStatus,
  isReturnableTransaction,
} from "@/lib/workflow-rules";
import { randomUUID } from "node:crypto";

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
      isSerialized: true,
      name: true,
    },
  },
  assetQuantity: true,
  condition: true,
  stockCode: true,
  id: true,
  requestLockedById: true,
  serialNo: true,
  status: true,
          warehouse: {
            select: {
              code: true,
              permissions: {
                where: { canView: true },
                select: { canManage: true, user: { select: { id: true, name: true, email: true } } },
              },
            },
          },
});

const transactionDetailSelect = Prisma.validator<Prisma.TransactionSelect>()({
  id: true,
  completedAt: true,
  createdAt: true,
  documentRef: true,
  dueDate: true,
  internalRequest: true,
  note: true,
  projectId: true,
  project: {
    select: {
      id: true,
      name: true,
      customerName: true,
      projectId: true,
      leadUser: { select: { id: true, name: true, email: true } },
      members: {
        where: { projectTag: ProjectMemberTag.LEAD_PROJECT },
        orderBy: { createdAt: "asc" },
        select: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  },
  projectRequest: true,
  purpose: true,
  requestDate: true,
  returnedAt: true,
  serviceRequest: true,
  soldPrice: true,
  sourceTransactionId: true,
  status: true,
  transactionNo: true,
  type: true,
  workflowStatus: true,
  approvals: {
    where: { isCurrent: true },
    orderBy: [{ stepSequence: "asc" }, { createdAt: "asc" }],
    select: {
      actedAt: true,
      comment: true,
      id: true,
      resolutionBatchId: true,
      requiredTag: true,
      status: true,
      stepSequence: true,
      userId: true,
      user: { select: { email: true, id: true, name: true } },
    },
  },
  requestedBy: { select: { email: true, id: true, name: true, position: true } },
  createdBy: { select: { email: true, id: true, name: true } },
  derivedTransactions: {
    select: {
      id: true,
      items: { select: { assetId: true } },
      transactionNo: true,
    },
    where: { workflowStatus: TransactionWorkflowStatus.PENDING },
  },
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      assetId: true,
      fromStatus: true,
      note: true,
      requestedQuantity: true,
      returnedAt: true,
      dispatchedAt: true,
      salePriceGroups: true,
      soldPrice: true,
      soldTotal: true,
      toStatus: true,
      asset: {
        select: {
          assetQuantity: true,
          requestLockedById: true,
          id: true,
          assetModelId: true,
          warehouseId: true,
          condition: true,
          location: { select: { name: true } },
          locationText: true,
          serialNo: true,
          status: true,
          stockCode: true,
          warehouse: {
            select: {
              code: true,
              name: true,
              permissions: {
                where: { canView: true },
                select: { canManage: true, user: { select: { id: true, name: true, email: true } } },
              },
            },
          },
          assetModel: {
            select: {
              id: true,
              brand: true,
              isSerialized: true,
              category: { select: { name: true } },
              name: true,
              partNo: true,
              typeName: true,
              description: true,
            },
          },
        },
      },
      resolvedStatus: true,
      resolutionNote: true,
      returnedBy: { select: { email: true, id: true, name: true } },
    },
  },
  outcomeRecords: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      resolutionBatchId: true,
      transactionItemId: true,
      outcomeStatus: true,
      quantity: true,
      note: true,
      soldPrice: true,
      soldTotal: true,
      approvedAt: true,
      soldTransactionId: true,
      returnCondition: true,
      assetId: true,
      soldTransaction: {
        select: {
          approvals: {
            where: { isCurrent: true },
            orderBy: [{ stepSequence: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              comment: true,
              requiredTag: true,
              resolutionBatchId: true,
              status: true,
              stepSequence: true,
              userId: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  },
});


type WorkflowAsset = Prisma.AssetGetPayload<{
  select: typeof assetWorkflowSelect;
}>;

type RawTransactionDetail = Prisma.TransactionGetPayload<{
  select: typeof transactionDetailSelect;
}>;
type OperationalTransactionItem = RawTransactionDetail["items"][number] & {
  assetId: string;
  asset: NonNullable<RawTransactionDetail["items"][number]["asset"]>;
};
type TransactionDetail = Omit<RawTransactionDetail, "items"> & { items: OperationalTransactionItem[] };

function requireOperationalTransaction(transaction: RawTransactionDetail): TransactionDetail {
  return { ...transaction, items: transaction.items.map((item) => {
    if (!item.asset || !item.assetId) throw new WorkflowError("Assign a valid source asset before operating this transaction.", 409, "TRANSACTION_ASSET_MISSING");
    return { ...item, asset: item.asset, assetId: item.assetId };
  }) };
}

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
  projectId?: string | null;
  projectRequest?: boolean;
  purpose: string;
  requestContextAssignmentId?: string | null;
  requestDate: Date;
  serviceRequest?: boolean;
  soldPrice?: string | null;
  sourceTransactionId?: string | null;
  items?: RequestAssetItemInput[];
  type: TransactionType;
};

export type ResolveTransactionItemInput = {
  allocations?: { quantity: number; toStatus: AssetStatus; returnCondition?: AssetCondition; note?: string | null; soldPrice?: string | null }[];
  itemId: string;
  note?: string | null;
  quantity?: number | null;
  returnCondition?: AssetCondition;
  soldPrice?: string | null;
  toStatus: AssetStatus;
};

export type ResolveTransactionInput = {
  items: ResolveTransactionItemInput[];
  transactionId: string;
  resolutionBatchId?: string;
};

export type ReturnTransactionInput = {
  itemIds?: string[];
  note?: string | null;
  transactionId: string;
};

export type DeleteReturnOutcomeInput = {
  outcomeId: string;
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

async function createRequisitionNo(tx: Prisma.TransactionClient, now: Date) {
  try {
    return await createMonthlyRequisitionNo(tx, now);
  } catch (error) {
    if (error instanceof MonthlyRequisitionLimitError) {
      throw new WorkflowError(
        error.message,
        409,
        "MONTHLY_REQUISITION_LIMIT_REACHED",
      );
    }

    throw error;
  }
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

type WorkflowUserRecord = NonNullable<
  Awaited<ReturnType<typeof findWorkflowUserById>>
>;

async function findWorkflowUserById(tx: Prisma.TransactionClient, userId: string) {
  return tx.user.findFirst({
    where: { id: userId, isActive: true },
    select: {
      azureAdObjectId: true,
      id: true,
      email: true,
      lastLoginAt: true,
      name: true,
      organizationLevel: true,
      organizationTag: true,
      organizationAssignments: {
        orderBy: [{ isPrimary: "desc" }, { organizationTag: "asc" }],
        select: {
          id: true,
          isPrimary: true,
          organizationLevel: true,
          organizationTag: true,
        },
        where: { isActive: true },
      },
      projectTag: true,
      position: true,
      signatureDataUrl: true,
      signatureUploadedAt: true,
      signatureUploadedBy: {
        select: { email: true, name: true },
      },
      roles: {
        select: {
          role: { select: { code: true } },
        },
      },
      warehousePermissions: {
        where: { warehouse: { isActive: true } },
        select: {
          canManage: true,
          canView: true,
          warehouse: { select: { code: true } },
        },
      },
    },
  });
}

async function requireWorkflowUserById(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const user = await findWorkflowUserById(tx, userId);

  if (!user) {
    throw new WorkflowError("Requester is not active.", 409, "REQUESTER_INACTIVE");
  }

  return toWorkflowCurrentUser(user);
}

function toWorkflowCurrentUser(user: WorkflowUserRecord): CurrentUser {
  const primaryAssignment = user.organizationAssignments.find(
    (assignment) => assignment.isPrimary,
  ) ?? user.organizationAssignments[0];

  return {
    azureAdObjectId: user.azureAdObjectId,
    email: user.email ?? "",
    id: user.id,
    lastLoginAt: user.lastLoginAt,
    name: user.name,
    organizationLevel: primaryAssignment?.organizationLevel ?? user.organizationLevel,
    organizationTag: primaryAssignment?.organizationTag ?? user.organizationTag,
    organizationAssignments: user.organizationAssignments,
    permissions: user.warehousePermissions.map((permission) => ({
      canManage: permission.canManage,
      canView: permission.canView,
      warehouseCode: permission.warehouse.code,
    })),
    position: user.position,
    projectTag: user.projectTag,
    roles: user.roles.map(({ role }) => role.code),
    signatureDataUrl: user.signatureDataUrl,
    signatureUploadedAt: user.signatureUploadedAt,
    signatureUploadedBy: user.signatureUploadedBy
      ? { ...user.signatureUploadedBy, email: user.signatureUploadedBy.email ?? "" }
      : null,
  };
}

function isQuantityAsset(asset: WorkflowAsset) {
  return getEffectiveAssetTrackMethod(asset) === AssetTrackMethod.QUANTITY;
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
      dispatchedAt: null,
      returnedAt: null,
      toStatus: { in: [AssetStatus.BORROW, AssetStatus.USING, AssetStatus.SOLD] },
      transaction: {
        sourceTransactionId: null,
        workflowStatus: {
          in: [
            TransactionWorkflowStatus.PENDING,
            TransactionWorkflowStatus.IN_PROGRESS,
          ],
        },
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

async function assertNoOpenSerialTransactionItems(
  tx: Prisma.TransactionClient,
  items: WorkflowRequestItem[],
  previousAssetIds = new Set<string>(),
) {
  const serialAssetIds = items
    .filter((item) => !isQuantityAsset(item.asset) && !previousAssetIds.has(item.asset.id))
    .map((item) => item.asset.id);

  if (serialAssetIds.length === 0) {
    return;
  }

  const existingItem = await tx.transactionItem.findFirst({
    select: {
      asset: { select: { assetModel: { select: { name: true } }, serialNo: true } },
      transaction: { select: { transactionNo: true } },
    },
    where: {
      assetId: { in: serialAssetIds },
      returnedAt: null,
      toStatus: { in: [AssetStatus.BORROW, AssetStatus.USING, AssetStatus.SOLD] },
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

function assertAssetsCanBeHeld(
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


async function refreshQuantityRequestStatus(
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
      where: {
        assetId,
        dispatchedAt: null,
        returnedAt: null,
        toStatus: { in: [AssetStatus.BORROW, AssetStatus.USING, AssetStatus.SOLD] },
        transaction: {
          sourceTransactionId: null,
          workflowStatus: {
            in: [
              TransactionWorkflowStatus.PENDING,
              TransactionWorkflowStatus.IN_PROGRESS,
            ],
          },
        },
      },
    }),
  ]);

  const reserved =
    (draftReserved._sum.quantity ?? 0) +
    (openReserved._sum.requestedQuantity ?? 0);
  const nextStatus = asset.assetQuantity <= 0
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
    assertCanRequestWarehouse(user, asset.warehouse.code);

    if (isQuantityAsset(asset)) {
      if (asset.status !== AssetStatus.READY && asset.status !== AssetStatus.REQUEST) {
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

function assertTransactionInput(input: SubmitTransactionInput) {
  const purpose = requireText(input.purpose, input.projectRequest ? "Project" : "Customer Name");
  const soldPrice = cleanText(input.soldPrice);

  if (input.type === TransactionType.USING && !input.internalRequest) {
    throw new WorkflowError("Using requests must be Internal.");
  }

  if (input.type !== TransactionType.USING) {
    if (input.internalRequest) {
      throw new WorkflowError("Borrow and sold requests must be Service or Project only.");
    }

    if (Boolean(input.serviceRequest) === Boolean(input.projectRequest)) {
      throw new WorkflowError("Choose either Service or Project.");
    }
  }

  if (input.projectRequest && !cleanText(input.projectId)) {
    throw new WorkflowError("Project is required.");
  }

  if (Number.isNaN(input.requestDate.getTime())) {
    throw new WorkflowError("Request date is required.");
  }


  if (input.type === TransactionType.SOLD && soldPrice && Number.isNaN(Number(soldPrice))) {
    throw new WorkflowError("Price must be a valid number.");
  }

  return { purpose, soldPrice };
}

type ApprovalCandidate = {
  requiredTag: string;
  stepSequence: number;
  userId: string | null;
  approverNameSnapshot: string | null;
  approverTagSnapshot: string | null;
};

type ApprovalUser = {
  id: string;
  organizationAssignments: Array<{
    organizationTag: OrganizationTag;
  }>;
  name: string;
  organizationTag: OrganizationTag | null;
  projectTag: ProjectTag | null;
  warehousePermissions: Array<{ canManage: boolean; canView?: boolean; warehouse: { code: string } }>;
};

function candidateForUser(
  user: ApprovalUser | null | undefined,
  requiredTag: string,
  stepSequence: number,
): ApprovalCandidate {
  return {
    approverNameSnapshot: user?.name ?? null,
    approverTagSnapshot: requiredTag,
    requiredTag,
    stepSequence,
    userId: user?.id ?? null,
  };
}

async function findOrganizationApprover(
  tx: Prisma.TransactionClient,
  tag: OrganizationTag | null,
  requesterId: string,
) {
  if (!tag) {
    return null;
  }

  if (tag === OrganizationTag.BSD_STAFF) {
    return tx.user.findFirst({
      select: {
        warehousePermissions: {
          select: { canManage: true, warehouse: { select: { code: true } } },
        },
        id: true,
        name: true,
        organizationAssignments: {
          select: { organizationTag: true },
          where: { isActive: true },
        },
        organizationTag: true,
        projectTag: true,
      },
      where: {
        isActive: true,
        id: { not: requesterId },
        OR: [
          { organizationTag: OrganizationTag.BSD_STAFF },
          { organizationAssignments: { some: { isActive: true, organizationTag: OrganizationTag.BSD_STAFF } } },
        ],
      },
    });
  }

  if (tag === OrganizationTag.BSD_MANAGER) {
    return tx.user.findFirst({
      select: {
        warehousePermissions: {
          select: { canManage: true, warehouse: { select: { code: true } } },
        },
        id: true,
        name: true,
        organizationAssignments: {
          select: { organizationTag: true },
          where: { isActive: true },
        },
        organizationTag: true,
        projectTag: true,
      },
      where: {
        isActive: true,
        id: { not: requesterId },
        OR: [
          { organizationTag: OrganizationTag.BSD_MANAGER },
          { organizationAssignments: { some: { isActive: true, organizationTag: OrganizationTag.BSD_MANAGER } } },
        ],
      },
    });
  }

  return tx.user.findFirst({
    orderBy: { name: "asc" },
    select: {
      warehousePermissions: {
        select: { canManage: true, warehouse: { select: { code: true } } },
      },
      id: true,
      name: true,
      organizationAssignments: {
        select: { organizationTag: true },
        where: { isActive: true },
      },
      organizationTag: true,
      projectTag: true,
    },
    where: {
      id: { not: requesterId },
      isActive: true,
      OR: [
        { organizationTag: tag },
        { organizationAssignments: { some: { organizationTag: tag, isActive: true } } },
      ],
    },
  });
}

function supervisorTagsForUser(user: CurrentUser) {
  return supervisorTagsForOrganizationTags([
    user.organizationTag,
    ...user.organizationAssignments.map((assignment) => assignment.organizationTag),
  ]) as OrganizationTag[];
}

async function findUsingSupervisorApprover(
  tx: Prisma.TransactionClient,
  user: CurrentUser,
) {
  const supervisorTags = supervisorTagsForUser(user);

  for (const supervisorTag of supervisorTags) {
    const approvers = await tx.user.findMany({
      orderBy: { name: "asc" },
      select: {
        warehousePermissions: {
          select: { canManage: true, warehouse: { select: { code: true } } },
        },
        id: true,
        name: true,
        organizationAssignments: {
          select: { organizationTag: true },
          where: { isActive: true },
        },
        organizationTag: true,
        projectTag: true,
      },
      where: {
        id: { not: user.id },
        isActive: true,
        OR: [
          { organizationTag: supervisorTag },
          { organizationAssignments: { some: { isActive: true, organizationTag: supervisorTag } } },
        ],
      },
    });

    if (approvers.length > 0) {
      return { approvers, requiredTag: supervisorTag };
    }
  }

  return null;
}

async function findProjectApprovers(
  tx: Prisma.TransactionClient,
  requesterId: string,
  projectId: string | null | undefined,
) {
  const select = {
    warehousePermissions: {
      select: { canManage: true, warehouse: { select: { code: true } } },
    },
    id: true,
    name: true,
    organizationAssignments: {
      select: { organizationTag: true },
      where: { isActive: true },
    },
    organizationTag: true,
    projectTag: true,
  } satisfies Prisma.UserSelect;

  if (projectId) {
    const project = await tx.project.findFirst({
      where: { id: projectId, status: "ACTIVE" },
      select: {
        leadUser: { select },
        members: {
          orderBy: { createdAt: "asc" },
          select: { user: { select } },
          where: { projectTag: "LEAD_PROJECT", userId: { not: requesterId } },
        },
      },
    });

    const projectLeads = [
      ...(project?.leadUser ? [project.leadUser] : []),
      ...(project?.members ?? []).map((member) => member.user),
    ].filter((lead, index, leads) => lead.id !== requesterId && leads.findIndex((item) => item.id === lead.id) === index);
    if (projectLeads.length > 0) {
      return projectLeads;
    }
  }

  return tx.user.findMany({
    orderBy: { name: "asc" },
    select,
    where: {
      id: { not: requesterId },
      isActive: true,
      projectTag: ProjectTag.LEAD_PROJECT,
    },
  });
}

async function findStockControllerApprovers(
  tx: Prisma.TransactionClient,
  warehouseCode: string,
  stockControllerTag: "WAREHOUSE_MANAGER" | "STOREMAN",
  ) {
  if (stockControllerTag === "WAREHOUSE_MANAGER") {
    const warehouse = await tx.assetWarehouse.findFirst({
      select: { managerAssignments: { select: { userId: true } } },
      where: { code: warehouseCode, isActive: true },
    });

    if (!warehouse || warehouse.managerAssignments.length === 0) {
      return [];
    }

    return tx.user.findMany({
      orderBy: { name: "asc" },
      select: {
        warehousePermissions: {
          select: { canManage: true, canView: true, warehouse: { select: { code: true } } },
        },
        id: true,
        name: true,
        organizationAssignments: {
          select: { organizationTag: true },
          where: { isActive: true },
        },
        organizationTag: true,
        projectTag: true,
      },
      where: {
        id: { in: warehouse.managerAssignments.map((assignment) => assignment.userId) },
        isActive: true,
      },
    });
  }

  const warehousePermissionWhere =
    { canManage: true, warehouse: { code: warehouseCode } };

  return tx.user.findMany({
    orderBy: { name: "asc" },
    select: {
      warehousePermissions: {
        select: { canManage: true, canView: true, warehouse: { select: { code: true } } },
      },
      id: true,
      name: true,
      organizationAssignments: {
        select: { organizationTag: true },
        where: { isActive: true },
      },
      organizationTag: true,
      projectTag: true,
    },
    where: {
      warehousePermissions: {
        some: warehousePermissionWhere,
      },
      isActive: true,
      roles: { some: { role: { code: "STOREMAN" } } },
    },
  });
}

function candidatesForUsers(
  users: ApprovalUser[],
  requiredTag: string,
  stepSequence: number,
) {
  if (users.length === 0) {
    return [candidateForUser(null, requiredTag, stepSequence)];
  }

  // Every eligible user in the step must approve before the workflow advances.
  return users.map((user) => candidateForUser(user, requiredTag, stepSequence));
}

async function buildApprovalCandidates(
  tx: Prisma.TransactionClient,
  user: CurrentUser,
  input: SubmitTransactionInput,
  items: WorkflowRequestItem[],
) {
  const approvals: ApprovalCandidate[] = [];
  // Step 1 is the request record itself. Approval sequences start at Step 2.
  let stepSequence = 2;

  // Project approval is determined by the selected project, not by the
  // requester's global project tag. A requester may have a different
  // organizational role while still submitting a project request.
  if (input.projectRequest && input.projectId) {
    approvals.push(
      ...candidatesForUsers(
        await findProjectApprovers(tx, user.id, input.projectId),
        ProjectTag.LEAD_PROJECT,
        stepSequence,
      ),
    );
    stepSequence++;
  }

  // Internal Using and Sold requests, plus service requests, pass through the
  // requester's supervisor before warehouse approval. Only staff-tagged users
  // have a supervisor step; fail closed if that configured approver is missing.
  if (requiresRequesterSupervisorApproval(input.type, input.serviceRequest)) {
    const supervisorTags = supervisorTagsForUser(user);
    const supervisor = await findUsingSupervisorApprover(tx, user);
    if (supervisorTags.length > 0) {
      if (!supervisor || supervisor.approvers.length === 0) {
        throw new WorkflowError(
          "No active supervisor is configured for your organization.",
          409,
          "SUPERVISOR_NOT_CONFIGURED",
        );
      }
      approvals.push(...candidatesForUsers(supervisor.approvers, supervisor.requiredTag, stepSequence));
      stepSequence++;
    }
  }

  // Storeman is the final warehouse step. Every eligible Storeman for each
  // warehouse must approve before a Sold request can move to BSD.
  const warehouseCodes = Array.from(new Set(items.map((item) => item.asset.warehouse.code))).sort();
  for (const warehouseCode of warehouseCodes) {
    approvals.push(
      ...candidatesForUsers(
        await findStockControllerApprovers(tx, warehouseCode, "STOREMAN"),
        warehouseStockControllerRequiredTag(warehouseCode),
        stepSequence,
      ),
    );
  }

  stepSequence++;

  // Sold requests are reviewed by Joy (BSD_STAFF) after all Storeman
  // approvals. This is a real approval step, not the later acknowledgement.
  if (input.type === TransactionType.SOLD) {
    const bsd = await findOrganizationApprover(tx, OrganizationTag.BSD_STAFF, user.id);
    if (!bsd) throw new WorkflowError("No active BSD Staff approver is configured.", 409, "BSD_APPROVER_NOT_CONFIGURED");
    approvals.push(
      ...candidatesForUsers(
        [bsd],
        OrganizationTag.BSD_STAFF,
        stepSequence,
      ),
    );
  }

  return approvals;
}

async function buildReturnApprovalCandidates(
  tx: Prisma.TransactionClient,
  sourceTransaction: TransactionDetail,
  items: WorkflowRequestItem[],
  isSaleOutcome = false,
) {
  const approvals: ApprovalCandidate[] = [];
  let stepSequence = 2;

  if (isSaleOutcome) {
    const approver = await findOrganizationApprover(tx, OrganizationTag.BSD_STAFF, sourceTransaction.requestedBy.id);
    if (!approver) throw new WorkflowError("No active BSD Staff approver is configured.", 409, "BSD_APPROVER_NOT_CONFIGURED");
    return candidatesForUsers([approver], OrganizationTag.BSD_STAFF, stepSequence);
  }

  if (sourceTransaction.projectRequest && sourceTransaction.projectId) {
    approvals.push(
      ...candidatesForUsers(
        await findProjectApprovers(tx, sourceTransaction.requestedBy.id, sourceTransaction.projectId),
        ProjectTag.LEAD_PROJECT,
        stepSequence,
      ),
    );
    stepSequence++;
  } else {
    const requester = await requireWorkflowUserById(tx, sourceTransaction.requestedBy.id);
    const supervisorTags = supervisorTagsForUser(requester);
    const supervisor = await findUsingSupervisorApprover(tx, requester);
    if (supervisorTags.length === 0 || !supervisor || supervisor.approvers.length === 0) {
      throw new WorkflowError(
        "No active supervisor is configured for the requester's organization.",
        409,
        "SUPERVISOR_NOT_CONFIGURED",
      );
    }
    approvals.push(
      ...candidatesForUsers(supervisor.approvers, supervisor.requiredTag, stepSequence),
    );
    stepSequence++;
  }

  const warehouseCodes = Array.from(new Set(items.map((item) => item.asset.warehouse.code))).sort();

  for (const warehouseCode of warehouseCodes) {
    approvals.push(...candidatesForUsers(
      await findStockControllerApprovers(tx, warehouseCode, "STOREMAN"),
      `RETURN_CHECK:${warehouseCode}`,
      stepSequence,
    ));
  }
  stepSequence++;

  for (const warehouseCode of warehouseCodes) {
    approvals.push(
      ...candidatesForUsers(
        await findStockControllerApprovers(tx, warehouseCode, "STOREMAN"),
        warehouseStockControllerRequiredTag(warehouseCode),
        stepSequence,
      ),
    );
  }

  if (sourceTransaction.type === TransactionType.SOLD) {
    approvals.push(
      ...candidatesForUsers(
        [await findOrganizationApprover(tx, OrganizationTag.BSD_STAFF, sourceTransaction.requestedBy.id)].filter(
          (approver): approver is ApprovalUser => Boolean(approver),
        ),
        OrganizationTag.BSD_STAFF,
        stepSequence + 1,
      ),
    );
  }

  return approvals;
}

async function findProjectForRequest(
  tx: Prisma.TransactionClient,
  user: CurrentUser,
  projectId: string | null | undefined,
) {
  const project = await tx.project.findFirst({
    where: { id: projectId ?? "", status: "ACTIVE" },
    select: {
      id: true,
      leadUserId: true,
      members: {
        select: { userId: true },
        where: { userId: user.id },
      },
      name: true,
    },
  });

  if (!project) {
    throw new WorkflowError("Project not found or inactive.", 404, "PROJECT_NOT_FOUND");
  }

  const canBypassParticipation = hasAnyRole(user, ["ADMIN", "STOREMAN"]);
  const isParticipant =
    project.leadUserId === user.id || project.members.length > 0;

  if (!canBypassParticipation && !isParticipant) {
    throw new WorkflowError(
      "You are not assigned to this project",
      403,
      "FORBIDDEN",
    );
  }

  return project;
}

async function replaceTransactionApprovals(
  tx: Prisma.TransactionClient,
  transactionId: string,
  approvals: ApprovalCandidate[],
  resolutionBatchId?: string,
  requester?: CurrentUser,
) {
  await tx.transactionApproval.updateMany({
    where: { transactionId, resolutionBatchId: resolutionBatchId ?? null, isCurrent: true },
    data: { isCurrent: false },
  });

  if (approvals.length === 0) {
    return;
  }

  await tx.transactionApproval.createMany({
    data: approvals.map((approval) => ({
      approverNameSnapshot: approval.approverNameSnapshot,
      approverTagSnapshot: approval.approverTagSnapshot,
      requiredTag: approval.requiredTag,
      resolutionBatchId,
      stepSequence: approval.stepSequence,
      transactionId,
      userId: approval.userId,
    })),
  });
  if (requester) await recordRequesterConfirmation(tx, transactionId, requester, new Date(), resolutionBatchId);
}

async function recordRequesterConfirmation(tx: Prisma.TransactionClient, transactionId: string, requester: CurrentUser, now: Date, resolutionBatchId?: string) {
  await tx.transactionApproval.create({
    data: {
      transactionId, resolutionBatchId, userId: requester.id,
      stepSequence: 1, requiredTag: "REQUESTER", status: ApprovalStatus.APPROVED,
      actedAt: now, approverNameSnapshot: requester.name,
      approverTagSnapshot: "REQUESTER", approverSignatureSnapshot: requester.signatureDataUrl,
    },
  });
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
  if (!updatedAsset) throw new WorkflowError("Stock row disappeared while posting.", 409, "ASSET_POST_CONFLICT");
  await tx.assetStatusHistory.create({ data: {
    actionType: AssetActionType.REQUEST_SUBMIT,
    assetId: item.asset.id, changedById: userId,
    fromStatus: item.asset.status, toStatus,
    condition: item.asset.condition, stockCode: item.asset.stockCode,
    quantityBefore: updatedAsset.assetQuantity + item.quantity,
    quantityAfter: updatedAsset.assetQuantity, quantityChanged: -item.quantity,
    note: "Approved quantity issue or direct sale",
    transactionId,
  } });

  if ((updatedAsset?.assetQuantity ?? 0) <= 0 && toStatus === AssetStatus.SOLD) {
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

async function releaseHeldAsset(
  tx: Prisma.TransactionClient,
  asset: WorkflowAsset,
  userId: string,
) {
  const result = await tx.asset.updateMany({
    where: {
      id: asset.id,
      isActive: true,
      OR: [
        { requestLockedById: userId },
        { requestLockedById: null },
      ],
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
    await refreshQuantityRequestStatus(tx, item.asset.id, userId);
    return;
  }

  await tx.assetReservation.update({
    data: { quantity: { decrement: item.quantity } },
    where: { id: reservation.id },
  });
  await refreshQuantityRequestStatus(tx, item.asset.id, userId);
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

  return requireOperationalTransaction(transaction);
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
      approvals: { where: { isCurrent: true }, select: { id: true, requiredTag: true, status: true, stepSequence: true, userId: true } },
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
              assetModel: { select: { isSerialized: true, categoryId: true, assetTypeId: true, partNo: true, name: true, description: true, brand: true, modelNo: true, typeName: true } },
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
  if (!item.asset || !item.assetId) throw new WorkflowError("The requested serial asset is missing.", 409, "TRANSACTION_ASSET_MISSING");
  if (transaction.type !== TransactionType.BORROW && transaction.type !== TransactionType.USING && transaction.type !== TransactionType.SOLD) {
    throw new WorkflowError("Serial numbers can only be assigned for Borrow, Using, or direct Sale requests.", 409);
  }
  if (transaction.sourceTransactionId || transaction.outcomeRecords.length > 0) {
    throw new WorkflowError("Serial numbers cannot be changed during return resolution.", 409, "SERIAL_SWAP_NOT_ALLOWED_ON_RETURN");
  }
  if (transaction.workflowStatus !== TransactionWorkflowStatus.PENDING) {
    throw new WorkflowError("Serial numbers can only be assigned during approval.", 409);
  }
  if (getEffectiveAssetTrackMethod(item.asset) === AssetTrackMethod.QUANTITY) {
    throw new WorkflowError("Quantity-tracked items do not require a serial number.", 409);
  }
  if (item.asset.status !== AssetStatus.REQUEST) {
    throw new WorkflowError("The requested serial is no longer held for this transaction.", 409);
  }

  const pending = currentPendingApproval(user, transaction.approvals);
  if (!pending || !isWarehouseStockControllerRequiredTag(pending.requiredTag)) {
    throw new WorkflowError("Only the Storeman assigned to this approval step can change the serial number.", 403);
  }

  const warehouseCode = pending.requiredTag.split(":")[1];
  if (warehouseCode !== item.asset.warehouse.code || !canManageWarehouseForUser(user, warehouseCode)) {
    throw new WorkflowError("You can only change serial numbers in warehouses managed by you.", 403);
  }

  return { item: { ...item, asset: item.asset, assetId: item.assetId }, warehouseCode };
}

export async function findStoremanSerialOptions(
  user: CurrentUser,
  transactionId: string,
  itemId: string,
  search = "",
): Promise<SerialSwapAsset[]> {
  return db.$transaction(async (tx) => {
    const { item } = await assertStoremanCanSwap(tx, user, transactionId, itemId);
    if (getEffectiveAssetTrackMethod(item.asset) === AssetTrackMethod.QUANTITY) {
      throw new WorkflowError("Quantity-tracked items cannot be swapped by serial number.", 409);
    }
    const assets = await tx.asset.findMany({
      orderBy: { serialNo: "asc" },
      select: { id: true, serialNo: true, stockCode: true, assetModel: { select: { name: true } } },
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
      .filter((asset) => !normalizedSearch || [asset.serialNo, asset.stockCode, asset.assetModel.name].some((value) => value?.toLowerCase().includes(normalizedSearch)))
      .map((asset) => ({ id: asset.id, serialNo: asset.serialNo as string, stockCode: asset.stockCode, model: asset.assetModel.name }));
    if (item.asset.serialNo && (!normalizedSearch || [item.asset.serialNo, item.asset.stockCode, item.asset.assetModel.name].some((value) => value?.toLowerCase().includes(normalizedSearch)))) {
      choices.unshift({ id: item.assetId, serialNo: item.asset.serialNo, stockCode: item.asset.stockCode, model: item.asset.assetModel.name });
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
    const { item } = await assertStoremanCanSwap(tx, user, transactionId, itemId);
    if (replacementAssetId === item.assetId) {
      if (!item.asset.serialNo) {
        throw new WorkflowError("This item does not have a valid serial number.", 409);
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
        assetModel: { select: { isSerialized: true, categoryId: true, assetTypeId: true, partNo: true, name: true, description: true, brand: true, modelNo: true, typeName: true } },
      },
    });
    const oldModel = item.asset.assetModel;
    if (!replacement || replacement.status !== AssetStatus.READY || !replacement.serialNo || replacement.warehouseId !== item.asset.warehouseId ||
      getEffectiveAssetTrackMethod(replacement) === AssetTrackMethod.QUANTITY ||
      replacement.assetModel.categoryId !== oldModel.categoryId || replacement.assetModel.assetTypeId !== oldModel.assetTypeId ||
      replacement.assetModel.partNo !== oldModel.partNo || replacement.assetModel.name !== oldModel.name) {
      throw new WorkflowError("Replacement asset must be Ready and match the same category, type, part number, and model.", 409);
    }

    const released = await tx.asset.updateMany({
      where: { id: item.assetId, status: AssetStatus.REQUEST },
      data: { requestLockedAt: null, requestLockedById: null, status: AssetStatus.READY, updatedById: user.id },
    });
    if (released.count !== 1) throw new WorkflowError("The requested asset is no longer available for swapping.", 409);
    const held = await tx.asset.updateMany({
      where: { id: replacement.id, status: AssetStatus.READY },
      data: { requestLockedAt: new Date(), requestLockedById: (await tx.transaction.findUniqueOrThrow({ where: { id: transactionId }, select: { requestedById: true } })).requestedById, status: AssetStatus.REQUEST, updatedById: user.id },
    });
    if (held.count !== 1) throw new WorkflowError("The replacement asset is no longer Ready.", 409);
    await tx.transactionItem.update({ where: { id: itemId }, data: { assetId: replacement.id, dispatchedAt: new Date(), dispatchedById: user.id } });
    await tx.assetStatusHistory.createMany({ data: [
      { actionType: AssetActionType.STATUS_CHANGE, assetId: item.assetId, changedById: user.id, fromStatus: AssetStatus.REQUEST, toStatus: AssetStatus.READY, note: "Released after Storeman serial swap", transactionId },
      { actionType: AssetActionType.REQUEST_HOLD, assetId: replacement.id, changedById: user.id, fromStatus: AssetStatus.READY, toStatus: AssetStatus.REQUEST, note: "Held after Storeman serial swap", transactionId },
    ] });
    return { ok: true, assetId: replacement.id, serialNo: replacement.serialNo };
  });
}

export async function getTransactionResolutionForUser(
  user: CurrentUser,
  transactionId: string,
) {
  const transaction = await db.$transaction(async (tx) => {
    const existing = await tx.transaction.findUnique({
      where: { id: transactionId },
      select: transactionDetailSelect,
    });

    if (!existing) {
      throw new WorkflowError("Transaction not found.", 404);
    }

    const detail = requireOperationalTransaction(existing);
    assertCanResolveTransaction(user, detail);
    return detail;
  });

  if (!transaction) {
    throw new WorkflowError("Transaction not found.", 404);
  }

  assertCanResolveTransaction(user, transaction);

  return transaction;
}

function assertCanResolveTransaction(
  user: CurrentUser,
  transaction: Pick<TransactionDetail, "items">,
) {
  for (const item of transaction.items) {
    assertCanViewWarehouse(user, item.asset.warehouse.code);
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

function validateSoldResolutionPrice(item: ResolveTransactionItemInput) {
  const soldPrice = cleanText(item.soldPrice);

  if (item.toStatus !== AssetStatus.SOLD) {
    return null;
  }

  if (!soldPrice) {
    return null;
  }

  if (Number.isNaN(Number(soldPrice))) {
    throw new WorkflowError("Sold price must be a valid number.");
  }

  return soldPrice;
}

function validateSoldAllocationPrice(
  allocation: NonNullable<ResolveTransactionItemInput["allocations"]>[number],
) {
  const soldPrice = cleanText(allocation.soldPrice);
  if (allocation.toStatus !== AssetStatus.SOLD) return null;
  if (!soldPrice) return null;
  if (Number.isNaN(Number(soldPrice))) {
    throw new WorkflowError("Sold price must be a valid number.");
  }
  return soldPrice;
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

    for (const allocation of item.allocations ?? []) {
      if (!isTransactionItemResolutionStatus(allocation.toStatus)) {
        throw new WorkflowError(`Cannot resolve item to ${allocation.toStatus}.`);
      }
      if (!Number.isInteger(allocation.quantity) || allocation.quantity <= 0) {
        throw new WorkflowError("Resolution quantity must be a positive whole number.");
      }
      validateSoldAllocationPrice(allocation);
    }

    if (item.quantity !== null && item.quantity !== undefined && (!Number.isInteger(item.quantity) || item.quantity <= 0)) {
      throw new WorkflowError("Resolution quantity must be a positive whole number.");
    }
    map.set(item.itemId, {
      ...item,
      soldPrice: validateSoldResolutionPrice(item),
      allocations: item.allocations?.map((allocation) => ({
        ...allocation,
        note: cleanText(allocation.note),
        soldPrice: validateSoldAllocationPrice(allocation),
      })),
    });
  }

  return map;
}

function isQuantityTransactionItem(item: TransactionDetail["items"][number]) {
  return getEffectiveAssetTrackMethod(item.asset) === AssetTrackMethod.QUANTITY;
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
        status: toStatus === AssetStatus.SOLD && (updatedAsset?.assetQuantity ?? 0) <= 0
          ? AssetStatus.SOLD
          : toStatus === AssetStatus.READY || (updatedAsset?.assetQuantity ?? 0) > 0
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
        soldPrice: toStatus === AssetStatus.SOLD && soldPrice ? new Prisma.Decimal(soldPrice) : null,
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
      soldPrice: toStatus === AssetStatus.SOLD && soldPrice ? new Prisma.Decimal(soldPrice) : null,
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
  const activeBatches = await tx.returnBatch.findMany({ where: { transactionId, state: { notIn: ["REJECTED", "CANCELLED"] } }, select: { id: true } });

  const [pendingOutcomes, pendingApprovals, pendingSales] = await Promise.all([
    tx.transactionItemOutcome.count({ where: { transactionId, approvedAt: null, OR: [{ resolutionBatchId: null }, { resolutionBatchId: { in: activeBatches.map((batch) => batch.id) } }] } }),
    tx.transactionApproval.count({
      where: {
        transactionId,
        isCurrent: true,
        status: ApprovalStatus.PENDING,
        requiredTag: { notIn: [ACK_BSD_REQUIRED_TAG, ACK_WAREHOUSE_MANAGER_REQUIRED_TAG] },
      },
    }),
    tx.transaction.count({
      where: { sourceTransactionId: transactionId, type: TransactionType.SOLD, workflowStatus: TransactionWorkflowStatus.PENDING },
    }),
  ]);

  if (pendingOutcomes > 0 || pendingApprovals > 0 || pendingSales > 0) {
    await tx.transaction.update({
      where: { id: transactionId },
      data: { completedAt: null, returnedAt: null, workflowStatus: TransactionWorkflowStatus.IN_PROGRESS },
    });
    return;
  }

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
    return;
  }

  await tx.transaction.update({
    where: { id: transactionId },
    data: { completedAt: null, returnedAt: null, workflowStatus: TransactionWorkflowStatus.IN_PROGRESS },
  });
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
      await assertNoOpenSerialTransactionItems(tx, items);
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
      let requestPurpose = purpose;
      let projectId = cleanText(input.projectId);

      if (input.projectRequest) {
        const project = await findProjectForRequest(tx, user, projectId);
        projectId = project.id;
        requestPurpose = project.name;
      } else {
        projectId = null;
      }

      const approvalInput = { ...input, projectId, purpose: requestPurpose };
      const approvals = await buildApprovalCandidates(tx, user, approvalInput, items);
      const transaction = await tx.transaction.create({
        data: {
          completedAt: null,
          createdById: user.id,
          documentRef: cleanText(input.documentRef),
          dueDate: input.dueDate ?? null,
          internalRequest: input.internalRequest ?? false,
          note,
          projectId,
          projectRequest: input.projectRequest ?? false,
          purpose: requestPurpose,
          requestDate: input.requestDate,
          requestedById: user.id,
          serviceRequest: input.serviceRequest ?? false,
          soldPrice: input.type === TransactionType.SOLD && soldPrice ? new Prisma.Decimal(soldPrice) : null,
          sourceTransactionId: cleanText(input.sourceTransactionId),
          status: getInitialTransactionStatus(input.type),
          transactionNo: await createRequisitionNo(tx, now),
          type: input.type,
          workflowStatus: TransactionWorkflowStatus.PENDING,
        },
      });

      await tx.transactionItem.createMany({
        data: items.map(({ asset, quantity }) => ({
          assetId: asset.id,
          fromStatus: isQuantityAsset(asset) ? AssetStatus.READY : AssetStatus.REQUEST,
          note,
          requestedQuantity: quantity,
          soldPrice: input.type === TransactionType.SOLD && soldPrice ? new Prisma.Decimal(soldPrice) : null,
          toStatus,
          transactionId: transaction.id,
        })),
      });

      for (const item of items) {
        if (isQuantityAsset(item.asset)) {
          await consumeQuantityReservation(tx, item, user.id);
          await refreshQuantityRequestStatus(tx, item.asset.id, user.id);
        }
      }

      if (approvals.length > 0) {
        await tx.transactionApproval.createMany({
          data: approvals.map((approval) => ({
            approverNameSnapshot: approval.approverNameSnapshot,
            approverTagSnapshot: approval.approverTagSnapshot,
            requiredTag: approval.requiredTag,
            stepSequence: approval.stepSequence,
            transactionId: transaction.id,
            userId: approval.userId,
          })),
        });
      }

      await recordRequesterConfirmation(tx, transaction.id, user, now);

      await tx.assetStatusHistory.createMany({
        data: items.map(({ asset, quantity }) => ({
          actionType: AssetActionType.REQUEST_SUBMIT,
          assetId: asset.id,
          changedById: user.id,
          fromStatus: isQuantityAsset(asset) ? AssetStatus.READY : AssetStatus.REQUEST,
          note: isQuantityAsset(asset)
            ? [note, `Submitted quantity: ${quantity}; pending approval`].filter(Boolean).join("\n")
            : [note, "Pending approval"].filter(Boolean).join("\n"),
          toStatus: AssetStatus.REQUEST,
          transactionId: transaction.id,
        })),
      });

      return findTransactionDetail(tx, transaction.id);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function applyApprovedTransaction(
  tx: Prisma.TransactionClient,
  transactionId: string,
  userId: string,
  now: Date,
  resolutionBatchId?: string | null,
) {
  const transaction = await findTransactionDetail(tx, transactionId);

  if (resolutionBatchId && !transaction.sourceTransactionId) {
    await assertReturnFinalGate(tx, transactionId, resolutionBatchId, true);
    await applyApprovedOutcomeCycle(tx, transaction, userId, now, resolutionBatchId);
    await tx.returnBatch.update({ where: { id: resolutionBatchId }, data: { state: "COMPLETED" } });
    return;
  }

  if (transaction.outcomeRecords.some((outcome) =>
    !outcome.approvedAt && (!resolutionBatchId || outcome.resolutionBatchId === resolutionBatchId),
  )) {
    await applyApprovedOutcomeCycle(tx, transaction, userId, now, resolutionBatchId);
    return;
  }
  const toStatus = getTransactionAssetStatus(transaction.type);

  if (transaction.status === TransactionStatus.RETURNED && transaction.sourceTransactionId) {
    await applyApprovedReturnTransaction(tx, transaction, userId, now);
    return;
  }

  if (transaction.type === TransactionType.SOLD && transaction.sourceTransactionId) {
    await applyApprovedReturnSaleTransaction(tx, transaction, userId, now);
    return;
  }

  for (const item of transaction.items) {
    if ((isQuantityTransactionItem(item) && item.dispatchedAt) || (!isQuantityTransactionItem(item) && item.asset.status === toStatus)) continue;
    const workflowItem = { asset: item.asset as unknown as WorkflowAsset, quantity: item.requestedQuantity };
    if (isQuantityTransactionItem(item)) {
      await updateSubmittedQuantityAsset(tx, workflowItem, userId, toStatus, transactionId);
      if (toStatus === AssetStatus.BORROW || toStatus === AssetStatus.USING || toStatus === AssetStatus.SOLD) {
        await tx.transactionItem.update({
          where: { id: item.id },
          data: { dispatchedAt: now, dispatchedById: userId },
        });
      }
    } else {
      await updateSubmittedAsset(tx, workflowItem.asset, transaction.requestedBy.id, toStatus);
      await tx.transactionItem.update({ where: { id: item.id }, data: { dispatchedAt: now, dispatchedById: userId } });
    }
  }

  await tx.assetStatusHistory.createMany({
    data: transaction.items.map((item) => ({
      actionType: AssetActionType.REQUEST_SUBMIT,
      assetId: item.assetId,
      changedById: userId,
      fromStatus: isQuantityTransactionItem(item) ? AssetStatus.READY : AssetStatus.REQUEST,
      note: "Approved request",
      toStatus,
      transactionId,
    })),
  });

  await tx.transaction.update({
    where: { id: transactionId },
    data: {
      completedAt: transaction.type === TransactionType.SOLD ? now : null,
      workflowStatus:
        transaction.type === TransactionType.SOLD
          ? TransactionWorkflowStatus.COMPLETED
          : TransactionWorkflowStatus.IN_PROGRESS,
    },
  });

  for (const item of transaction.items) {
    if (isQuantityTransactionItem(item)) {
      await refreshQuantityRequestStatus(tx, item.assetId, userId);
    }
  }
}

async function applyApprovedReturnSaleTransaction(
  tx: Prisma.TransactionClient,
  transaction: TransactionDetail,
  userId: string,
  now: Date,
) {
  if (!transaction.sourceTransactionId) {
    throw new WorkflowError("Source transaction is required for return sale.", 409);
  }

  const sourceTransaction = await findTransactionDetail(
    tx,
    transaction.sourceTransactionId,
  );
  const linkedBatches = await tx.transactionItemOutcome.findMany({
    where: { soldTransactionId: transaction.id, approvedAt: null },
    select: { resolutionBatchId: true },
  });
  for (const batchId of new Set(linkedBatches.map((outcome) => outcome.resolutionBatchId))) {
    if (!batchId) throw new WorkflowError("The sale is not linked to a verified return batch.", 409, "RETURN_BATCH_REQUIRED");
    await assertReturnFinalGate(tx, sourceTransaction.id, batchId, true);
  }
  if (!transaction.items.every((item) => item.soldPrice !== null || (Array.isArray(item.salePriceGroups) && item.salePriceGroups.length > 0))) {
    throw new WorkflowError("BSD must price every sold item before posting.", 409, "SOLD_PRICE_REQUIRED");
  }
  const sourceItemsByAsset = new Map(
    sourceTransaction.items
      .filter((item) => !item.returnedAt)
      .map((item) => [item.assetId, item]),
  );

  for (const saleItem of transaction.items) {
    const sourceItem = sourceItemsByAsset.get(saleItem.assetId);

    if (!sourceItem) {
      throw new WorkflowError(
        `Source item for ${transactionItemAssetName(saleItem)} is already resolved.`,
        409,
        "SOURCE_ITEM_ALREADY_RESOLVED",
      );
    }

    const linkedOutcomes = await tx.transactionItemOutcome.findMany({
      where: {
        soldTransactionId: transaction.id,
        transactionItemId: sourceItem.id,
        outcomeStatus: AssetStatus.SOLD,
        approvedAt: null,
      },
      select: { quantity: true },
    });
    if (!linkedOutcomes.length || saleItem.requestedQuantity !== linkedOutcomes.reduce((sum, outcome) => sum + outcome.quantity, 0)) {
      throw new WorkflowError(
        "Sale quantity must match the pending sold outcome quantity.",
        409,
        "RETURN_SALE_QUANTITY_MISMATCH",
      );
    }

    if (!isQuantityTransactionItem(sourceItem)) {
      await resolveItem(
        tx,
        sourceItem,
        { id: userId } as CurrentUser,
        now,
        AssetStatus.SOLD,
        "Sold after return approval",
        saleItem.soldPrice?.toString() ?? transaction.soldPrice?.toString() ?? null,
        saleItem.requestedQuantity,
      );
    }
    await tx.transactionItemOutcome.updateMany({ where: { soldTransactionId: transaction.id, transactionItemId: sourceItem.id, approvedAt: null }, data: { soldPrice: saleItem.soldPrice, soldTotal: saleItem.soldTotal } });
  }

  await tx.transactionItemOutcome.updateMany({
    where: {
      soldTransactionId: transaction.id,
      transactionId: sourceTransaction.id,
      outcomeStatus: AssetStatus.SOLD,
      approvedAt: null,
    },
    data: { approvedAt: now, approvedById: userId, soldTransactionId: transaction.id },
  });

  for (const saleItem of transaction.items) {
    const sourceItem = sourceItemsByAsset.get(saleItem.assetId);
    if (!sourceItem) continue;
    const approvedQuantity = await tx.transactionItemOutcome.aggregate({
      _sum: { quantity: true },
      where: { transactionItemId: sourceItem.id, approvedAt: { not: null } },
    });
    const fullyResolved = (approvedQuantity._sum.quantity ?? 0) >= sourceItem.requestedQuantity;
    await tx.transactionItem.update({
      where: { id: sourceItem.id },
      data: {
        resolvedStatus: AssetStatus.SOLD,
        returnedAt: fullyResolved ? now : null,
        returnedById: fullyResolved ? userId : null,
      },
    });
  }

  await tx.assetStatusHistory.createMany({
    data: transaction.items.map((item) => ({
      actionType: AssetActionType.STATUS_CHANGE,
      assetId: item.assetId,
      changedById: userId,
      fromStatus: item.fromStatus,
      previousQuantity: isQuantityTransactionItem(item) ? item.asset.assetQuantity : null,
      newQuantity: isQuantityTransactionItem(item) ? item.asset.assetQuantity : null,
      note: `Sold from return; source ${sourceTransaction.transactionNo ?? sourceTransaction.documentRef ?? sourceTransaction.id}`,
      toStatus: AssetStatus.SOLD,
      transactionId: transaction.id,
    })),
  });

  await tx.transaction.update({
    where: { id: transaction.id },
    data: {
      completedAt: now,
      status: TransactionStatus.COMPLETED,
      workflowStatus: TransactionWorkflowStatus.COMPLETED,
    },
  });

  await refreshTransactionResolutionStatus(tx, sourceTransaction.id, now);
}

async function applyApprovedReturnTransaction(
  tx: Prisma.TransactionClient,
  transaction: TransactionDetail,
  userId: string,
  now: Date,
) {
  if (!transaction.sourceTransactionId) {
    throw new WorkflowError("Source transaction is required for return approval.", 409);
  }

  const sourceTransaction = await findTransactionDetail(
    tx,
    transaction.sourceTransactionId,
  );
  const sourceItemsByAsset = new Map(
    sourceTransaction.items
      .filter((item) => !item.returnedAt)
      .map((item) => [item.assetId, item]),
  );

  for (const returnItem of transaction.items) {
    const sourceItem = sourceItemsByAsset.get(returnItem.assetId);

    if (!sourceItem) {
      throw new WorkflowError(
        `Source item for ${transactionItemAssetName(returnItem)} is already resolved.`,
        409,
        "SOURCE_ITEM_ALREADY_RESOLVED",
      );
    }

    if (returnItem.requestedQuantity > sourceItem.requestedQuantity) {
      throw new WorkflowError(
        "Return quantity cannot exceed the open source quantity.",
        409,
        "RETURN_QUANTITY_MISMATCH",
      );
    }

    await resolveItem(
      tx,
      sourceItem,
      { id: userId } as CurrentUser,
      now,
      returnItem.toStatus,
      returnItem.note,
      null,
      returnItem.requestedQuantity,
    );

    if (returnItem.requestedQuantity < sourceItem.requestedQuantity) {
      await tx.transactionItem.update({
        where: { id: sourceItem.id },
        data: { requestedQuantity: { decrement: returnItem.requestedQuantity } },
      });
    }
  }

  await tx.transactionItem.updateMany({
    where: { transactionId: transaction.id },
    data: {
      resolvedStatus: transaction.items[0]?.toStatus ?? AssetStatus.READY,
      returnedAt: now,
      returnedById: userId,
    },
  });

  await tx.assetStatusHistory.createMany({
    data: transaction.items.map((item) => ({
      actionType: item.toStatus === AssetStatus.READY ? AssetActionType.RETURN : AssetActionType.STATUS_CHANGE,
      assetId: item.assetId,
      changedById: userId,
      fromStatus: item.fromStatus,
      previousQuantity: isQuantityTransactionItem(item) ? item.asset.assetQuantity : null,
      newQuantity: isQuantityTransactionItem(item) ? item.asset.assetQuantity : null,
      note: `Approved ${item.toStatus.toLowerCase()}; source ${sourceTransaction.transactionNo ?? sourceTransaction.documentRef ?? sourceTransaction.id}`,
      toStatus: item.toStatus,
      transactionId: transaction.id,
    })),
  });

  await refreshTransactionResolutionStatus(tx, sourceTransaction.id, now);

  await tx.transaction.update({
    where: { id: transaction.id },
    data: {
      completedAt: now,
      returnedAt: now,
      status: TransactionStatus.RETURNED,
      workflowStatus: TransactionWorkflowStatus.COMPLETED,
    },
  });
}

export type ApproveTransactionInput = {
  comment?: string | null;
  prices?: Record<string, string>;
  totals?: Record<string, string>;
  priceGroups?: Record<string, SalePriceGroup[]>;
  returnConditions?: Record<string, AssetCondition>;
  returnStockAssetIds?: Record<string, string>;
  soldPrice?: string | null;
};

async function assertReturnFinalGate(
  tx: Prisma.TransactionClient,
  transactionId: string,
  batchId: string,
  requireFinalApprovals = false,
) {
  const batch = await tx.returnBatch.findFirst({ where: { id: batchId, transactionId } });
  if (!batch || ["REJECTED", "CANCELLED"].includes(batch.state)) {
    throw new WorkflowError("This return batch is not active.", 409, "RETURN_BATCH_NOT_ACTIVE");
  }
  const [approvals, outcomes] = await Promise.all([
    tx.transactionApproval.findMany({ where: { transactionId, resolutionBatchId: batchId, isCurrent: true } }),
    tx.transactionItemOutcome.findMany({ where: { transactionId, resolutionBatchId: batchId, approvedAt: null }, include: { checks: true, transactionItem: { include: { asset: { include: { warehouse: true } } } } } }),
  ]);
  const checks = approvals.filter((approval) => approval.requiredTag.startsWith("RETURN_CHECK:"));
  if (!checks.length || checks.some((approval) => approval.status !== ApprovalStatus.APPROVED) || outcomes.some((outcome) => {
    const code = outcome.transactionItem.asset?.warehouse.code;
    const required = checks.filter((approval) => approval.requiredTag === `RETURN_CHECK:${code}`);
    return !required.length || required.some((approval) => !approval.userId || !outcome.checks.some((check) => check.userId === approval.userId));
  })) {
    throw new WorkflowError("All outcomes must be checked by every assigned Storeman.", 409, "RETURN_CHECKS_REQUIRED");
  }
  const requiresDocument = outcomes.some((outcome) => outcome.outcomeStatus === AssetStatus.FAIL || outcome.outcomeStatus === AssetStatus.LOST || outcome.returnCondition === AssetCondition.USED);
  if (requiresDocument && (!batch.signedPdf?.byteLength || !batch.signedAt || !batch.signedById)) {
    throw new WorkflowError("Upload the signed PDF for this return revision before final approval.", 409, "SIGNED_RETURN_PDF_REQUIRED");
  }
  if (requireFinalApprovals) {
    const finalApprovals = approvals.filter((approval) => approval.requiredTag.startsWith("STOREMAN:"));
    if (!finalApprovals.length || finalApprovals.some((approval) => approval.status !== ApprovalStatus.APPROVED) || approvals.some((approval) => !approval.requiredTag.startsWith("ACK_") && approval.status !== ApprovalStatus.APPROVED)) {
      throw new WorkflowError("Every warehouse must complete final return approval before sale or stock posting.", 409, "RETURN_FINAL_APPROVAL_REQUIRED");
    }
  }
}

async function assertReturnBatchEditable(tx: Prisma.TransactionClient, transactionId: string, batchId: string) {
  const batch = await tx.returnBatch.findFirst({ where: { id: batchId, transactionId } });
  if (!batch || ["COMPLETED", "CANCELLED"].includes(batch.state)) throw new WorkflowError("This return batch cannot be edited.", 409, "RETURN_BATCH_LOCKED");
  if (batch.state === "REJECTED") return;
  const approved = await tx.transactionApproval.findFirst({
    where: { transactionId, resolutionBatchId: batchId, isCurrent: true, status: ApprovalStatus.APPROVED, stepSequence: { gt: 1 } },
  });
  if (approved) throw new WorkflowError("The return batch is locked after lead approval. Reject it before editing.", 409, "RETURN_LEAD_ALREADY_APPROVED");
}

async function createTransactionAcknowledgements(
  tx: Prisma.TransactionClient,
  transactionId: string,
) {
  const transaction = await tx.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: {
      requestedById: true,
      items: { select: { asset: { select: { warehouse: { select: { code: true } } } } } },
    },
  });
  const recipients = new Map<string, { userId: string; requiredTag: string }>();
  const bsd = await findOrganizationApprover(tx, OrganizationTag.BSD_STAFF, transaction.requestedById);
  if (bsd) recipients.set(`${bsd.id}:${ACK_BSD_REQUIRED_TAG}`, { userId: bsd.id, requiredTag: ACK_BSD_REQUIRED_TAG });
  for (const item of transaction.items) {
    if (!item.asset) throw new WorkflowError("Transaction asset is missing.", 409, "TRANSACTION_ASSET_MISSING");
    const managers = await tx.warehouseManagerAssignment.findMany({
      where: { warehouse: { code: item.asset.warehouse.code, isActive: true } },
      select: { userId: true },
    });
    for (const manager of managers) {
      recipients.set(`${manager.userId}:${ACK_WAREHOUSE_MANAGER_REQUIRED_TAG}`, { userId: manager.userId, requiredTag: ACK_WAREHOUSE_MANAGER_REQUIRED_TAG });
    }
  }
  if (recipients.size === 0) return;
  await tx.transactionApproval.createMany({
    data: [...recipients.values()].map(({ userId, requiredTag }) => ({
      transactionId,
      userId,
      requiredTag,
      stepSequence: 999,
      approverTagSnapshot: requiredTag,
      status: ApprovalStatus.PENDING,
    })),
    skipDuplicates: true,
  });
}

function calculateTransactionSalePricing(
  items: Array<{ id: string; requestedQuantity: number }>,
  input: ApproveTransactionInput,
  draft: boolean,
) {
  try {
    const calculated = items.map((item) => {
      const source = input.priceGroups?.[item.id] ?? [{ quantity: item.requestedQuantity, unitPrice: input.prices?.[item.id] ?? "", total: "" }];
      if (!draft && source.some((group) => !group.unitPrice.trim())) {
        throw new WorkflowError("BSD must enter a valid Price / unit for every sold item.", 400, "SOLD_PRICE_REQUIRED");
      }
      const groups = validateSalePriceGroups(source, item.requestedQuantity, item.requestedQuantity === 1, draft);
      return { id: item.id, groups, total: groups.every((group) => group.unitPrice) ? calculateSaleGrandTotal(groups) : null };
    });
    return { items: calculated, grandTotal: calculateSaleGrandTotal(calculated.flatMap((item) => item.groups)) };
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError((error as Error).message, 400, "SALE_PRICE_GROUPS_INVALID");
  }
}

export async function saveSalePriceDraft(user: CurrentUser, transactionId: string, input: ApproveTransactionInput) {
  return db.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({ where: { id: transactionId }, include: { items: true, approvals: { where: { isCurrent: true } } } });
    if (!transaction) throw new WorkflowError("Transaction not found.", 404);
    const approval = currentPendingApproval(user, transaction.approvals);
    if (transaction.type !== TransactionType.SOLD || transaction.workflowStatus !== TransactionWorkflowStatus.PENDING || approval?.requiredTag !== OrganizationTag.BSD_STAFF) {
      throw new WorkflowError("Only the assigned BSD Staff can save prices at the sale approval step.", 403);
    }
    if (transaction.sourceTransactionId) {
      if (!approval.resolutionBatchId) throw new WorkflowError("Sale source batch is missing.", 409);
      await assertReturnFinalGate(tx, transaction.sourceTransactionId, approval.resolutionBatchId, true);
    }
    const pricing = calculateTransactionSalePricing(transaction.items, input, true);
    for (const item of pricing.items) {
      await tx.transactionItem.update({ where: { id: item.id }, data: {
        salePriceGroups: item.groups,
        soldPrice: item.groups.length === 1 && item.groups[0].unitPrice ? new Prisma.Decimal(item.groups[0].unitPrice) : null,
        soldTotal: item.total ? new Prisma.Decimal(item.total) : null,
      } });
    }
    await tx.transaction.update({ where: { id: transactionId }, data: { soldPrice: new Prisma.Decimal(pricing.grandTotal) } });
    return { saved: true };
  });
}

export async function approveTransaction(
  user: CurrentUser,
  transactionId: string,
  input: ApproveTransactionInput = {},
) {
  const now = new Date();

  return db.$transaction(
    async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        select: {
          id: true,
          projectId: true,
          project: {
            select: {
              leadUser: { select: { id: true } },
              members: {
                where: { projectTag: ProjectMemberTag.LEAD_PROJECT },
                select: { userId: true },
              },
            },
          },
          requestedById: true,
          sourceTransactionId: true,
          soldPrice: true,
          type: true,
          workflowStatus: true,
          items: {
            select: {
              id: true,
              requestedQuantity: true,
              dispatchedAt: true,
              asset: {
                select: {
                      assetModelId: true,
                      warehouseId: true,
                  serialNo: true,
                  warehouse: { select: { code: true } },
                      assetModel: {
                        select: {
                          id: true,
                          isSerialized: true,
                          name: true,
                          brand: true,
                          partNo: true,
                          description: true,
                        },
                      },
                },
              },
            },
          },
          approvals: {
            where: { isCurrent: true },
            orderBy: [{ stepSequence: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              requiredTag: true,
              resolutionBatchId: true,
              comment: true,
              status: true,
              stepSequence: true,
              userId: true,
            },
          },
        },
      });

      if (!transaction) {
        throw new WorkflowError("Transaction not found.", 404);
      }

      const pendingApprovals = transaction.approvals.filter(
        (approval) => approval.status === ApprovalStatus.PENDING,
      );
      if (pendingApprovals.length === 0 || (
        transaction.workflowStatus !== TransactionWorkflowStatus.PENDING &&
        !pendingApprovals.some((approval) => approval.requiredTag.startsWith("ACK_") || approval.resolutionBatchId)
      )) {
        throw new WorkflowError("Transaction is not pending approval.", 409);
      }
      const currentProjectLeadIds = new Set([
        ...(transaction.project?.leadUser ? [transaction.project.leadUser.id] : []),
        ...(transaction.project?.members ?? []).map((member) => member.userId),
      ]);
      const currentApproval = pendingApprovals
        .filter((approval) =>
          approval.requiredTag === ProjectMemberTag.LEAD_PROJECT
            ? currentProjectLeadIds.has(user.id) && approval.userId === user.id
            : approvalMatchesUser(user, approval),
        )
        .find((approval) => {
          if (approval.requiredTag.startsWith("ACK_")) return true;
          const cyclePending = pendingApprovals.filter(
            (candidate) => candidate.resolutionBatchId === approval.resolutionBatchId && !candidate.requiredTag.startsWith("ACK_"),
          );
          return approval.stepSequence === Math.min(...cyclePending.map((candidate) => candidate.stepSequence));
        });

      if (!currentApproval) {
        throw new WorkflowError("No approval is waiting for this user.", 403);
      }

      if (currentApproval.requiredTag.startsWith("RETURN_CHECK:")) {
        throw new WorkflowError("Confirm the individual outcomes through the return check service.", 409, "RETURN_MANUAL_CHECK_REQUIRED");
      }
      if (currentApproval.resolutionBatchId && !transaction.sourceTransactionId) {
        const batch = await tx.returnBatch.findFirst({ where: { id: currentApproval.resolutionBatchId, transactionId } });
        if (!batch || ["REJECTED", "CANCELLED", "COMPLETED"].includes(batch.state)) throw new WorkflowError("This return batch is not pending approval.", 409, "RETURN_BATCH_NOT_ACTIVE");
        if (currentApproval.requiredTag.startsWith("STOREMAN:")) await assertReturnFinalGate(tx, transactionId, batch.id);
      }
      if (transaction.type === TransactionType.SOLD && transaction.sourceTransactionId) {
        const linked = await tx.transactionItemOutcome.findMany({ where: { soldTransactionId: transactionId, approvedAt: null }, select: { resolutionBatchId: true } });
        if (!linked.length) throw new WorkflowError("No pending sold outcome exists.", 409);
        for (const batchId of new Set(linked.map((outcome) => outcome.resolutionBatchId))) {
          if (!batchId) throw new WorkflowError("The sale has no return batch.", 409, "RETURN_BATCH_REQUIRED");
          await assertReturnFinalGate(tx, transaction.sourceTransactionId, batchId, true);
        }
      }

      if (isWarehouseStockControllerRequiredTag(currentApproval.requiredTag) && !currentApproval.resolutionBatchId) {
        const warehouseCode = currentApproval.requiredTag.split(":")[1];
        const pendingReturns = await tx.transactionItemOutcome.findMany({
          where: {
            transactionId,
            approvedAt: null,
            resolutionBatchId: currentApproval.resolutionBatchId,
            outcomeStatus: AssetStatus.READY,
          },
          select: { id: true, transactionItemId: true },
        });
        const itemsById = new Map(transaction.items.map((item) => [item.id, item]));
        const quantityReturns = pendingReturns.filter((outcome) => {
          const item = itemsById.get(outcome.transactionItemId);
          return Boolean(
            item?.asset &&
            getEffectiveAssetTrackMethod(item.asset) === AssetTrackMethod.QUANTITY &&
            item.asset.warehouse.code === warehouseCode,
          );
        });
        const returnConditions = input.returnConditions ?? {};
        const returnStockAssetIds = input.returnStockAssetIds ?? {};
        const missingCondition = quantityReturns.some((outcome) => {
          const condition = returnConditions[outcome.id];
          return condition !== AssetCondition.NEW && condition !== AssetCondition.USED;
        });
        if (missingCondition) {
          throw new WorkflowError(
            "Select NEW or USED for every quantity-pool item being returned.",
            409,
            "RETURN_CONDITION_REQUIRED",
          );
        }
        const missingStockCode = quantityReturns.some((outcome) => !returnStockAssetIds[outcome.id]);
        if (missingStockCode) {
          throw new WorkflowError(
            "Choose an existing Stock Code for every quantity-pool return.",
            409,
            "RETURN_STOCK_CODE_REQUIRED",
          );
        }
        for (const outcome of quantityReturns) {
          const item = itemsById.get(outcome.transactionItemId);
          const selectedAssetId = returnStockAssetIds[outcome.id];
          const selectedAsset = await tx.asset.findFirst({
            where: {
              id: selectedAssetId,
              warehouseId: item?.asset?.warehouseId,
              isActive: true,
              serialNo: null,
              stockCode: { not: null },
            },
            select: {
              id: true,
              assetModelId: true,
              condition: true,
              assetModel: {
                select: { id: true, name: true, brand: true, partNo: true, description: true, isSerialized: true },
              },
            },
          });
          const sourceModel = item?.asset?.assetModel;
          const matchesSourceModel = Boolean(
            selectedAsset && sourceModel &&
            selectedAsset.assetModelId === sourceModel.id,
          );
          if (!selectedAsset || !matchesSourceModel) {
            throw new WorkflowError(
              "The selected Stock Code is not valid for this product and warehouse.",
              409,
              "RETURN_STOCK_CODE_INVALID",
            );
          }
          await tx.transactionItemOutcome.update({
            where: { id: outcome.id },
            data: { returnCondition: returnConditions[outcome.id], assetId: selectedAsset.id },
          });
        }
      }

      if (isWarehouseStockControllerRequiredTag(currentApproval.requiredTag) && !currentApproval.resolutionBatchId && !transaction.sourceTransactionId) {
        const warehouseCode = currentApproval.requiredTag.split(":")[1];
        const undispatchedSerialItems = transaction.items.filter(
          (item) => item.asset && getEffectiveAssetTrackMethod(item.asset) === AssetTrackMethod.SERIAL &&
            item.asset.warehouse.code === warehouseCode &&
            (!item.dispatchedAt || !item.asset.serialNo),
        );
        if (undispatchedSerialItems.length > 0) {
          throw new WorkflowError(
            "Select an available serial number for every serialized item before approving this request.",
            409,
            "SERIAL_DISPATCH_REQUIRED",
          );
        }
      }

      const isAcknowledgement = currentApproval.requiredTag.startsWith("ACK_");
      if (!isAcknowledgement && !user.signatureDataUrl) {
        throw new WorkflowError(
          "Please upload your signature before approving the document.",
          400,
          "SIGNATURE_REQUIRED",
        );
      }

      const isBsdSaleApproval = !isAcknowledgement && currentApproval.requiredTag === OrganizationTag.BSD_STAFF && transaction.type === TransactionType.SOLD;
      if (isBsdSaleApproval) {
        const pricing = calculateTransactionSalePricing(transaction.items, input, false);
        for (const item of pricing.items) {
          await tx.transactionItem.update({
            where: { id: item.id },
            data: {
              salePriceGroups: item.groups,
              soldPrice: item.groups.length === 1 ? new Prisma.Decimal(item.groups[0].unitPrice) : null,
              soldTotal: new Prisma.Decimal(item.total!),
            },
          });
        }
        await tx.transaction.update({
          where: { id: transactionId },
          data: { soldPrice: new Prisma.Decimal(pricing.grandTotal) },
        });
      }

      await tx.transactionApproval.update({
        where: { id: currentApproval.id },
        data: {
          actedAt: now,
          approverNameSnapshot: user.name,
          approverSignatureSnapshot: isAcknowledgement ? null : user.signatureDataUrl,
          approverTagSnapshot: currentApproval.requiredTag,
          comment: cleanText(input.comment),
          status: ApprovalStatus.APPROVED,
          userId: user.id,
        },
      });

      const remaining = await tx.transactionApproval.count({
        where: {
          transactionId,
          status: ApprovalStatus.PENDING,
          resolutionBatchId: currentApproval.resolutionBatchId,
          isCurrent: true,
          requiredTag: { notIn: [ACK_BSD_REQUIRED_TAG, ACK_WAREHOUSE_MANAGER_REQUIRED_TAG] },
        },
      });

      if (!isAcknowledgement && remaining === 0) {
        await applyApprovedTransaction(tx, transactionId, user.id, now, currentApproval.resolutionBatchId);
        if (!currentApproval.resolutionBatchId) {
          await createTransactionAcknowledgements(tx, transactionId);
        }
      }

      return findTransactionDetail(tx, transactionId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}



export type RejectTransactionInput = {
  reason: string;
};

function currentPendingApproval(
  user: CurrentUser,
  approvals: Array<{
    id: string;
    requiredTag: string;
    status: ApprovalStatus;
    stepSequence: number;
    userId: string | null;
    resolutionBatchId?: string | null;
    comment?: string | null;
  }>,
  currentProjectLeadIds?: Set<string>,
) {
  const pendingApprovals = approvals.filter(
    (approval) => approval.status === ApprovalStatus.PENDING && !approval.requiredTag.startsWith("ACK_"),
  );

  if (pendingApprovals.length === 0) {
    return null;
  }

  return pendingApprovals.find(
    (approval) =>
      approval.stepSequence === Math.min(...pendingApprovals.filter((candidate) => candidate.resolutionBatchId === approval.resolutionBatchId).map((candidate) => candidate.stepSequence)) &&
      (approval.requiredTag === ProjectMemberTag.LEAD_PROJECT && currentProjectLeadIds
        ? currentProjectLeadIds.has(user.id) && approval.userId === user.id
        : approvalMatchesUser(user, approval)),
  ) ?? null;
}

async function releaseRejectedTransactionItems(
  tx: Prisma.TransactionClient,
  transaction: TransactionDetail,
  userId: string,
  reason: string,
) {
  for (const item of transaction.items) {
    const workflowItem = {
      asset: item.asset as unknown as WorkflowAsset,
      quantity: item.requestedQuantity,
    };

    if (isQuantityTransactionItem(item)) {
      await refreshQuantityRequestStatus(tx, item.assetId, userId);
    } else {
      await releaseHeldAsset(tx, workflowItem.asset, transaction.requestedBy.id);
    }
  }

  await tx.assetStatusHistory.createMany({
    data: transaction.items.map((item) => ({
      actionType: AssetActionType.STATUS_CHANGE,
      assetId: item.assetId,
      changedById: userId,
      fromStatus: AssetStatus.REQUEST,
      note: `Rejected request: ${reason}`,
      toStatus: AssetStatus.READY,
      transactionId: transaction.id,
    })),
  });
}

async function recordRejectedDerivedResolutionItems(
  tx: Prisma.TransactionClient,
  transaction: TransactionDetail,
  userId: string,
  reason: string,
) {
  await tx.assetStatusHistory.createMany({
    data: transaction.items.map((item) => {
      const currentStatus = item.fromStatus ?? item.asset.status;

      return {
        actionType: AssetActionType.STATUS_CHANGE,
        assetId: item.assetId,
        changedById: userId,
        fromStatus: currentStatus,
        note: `Rejected return/sale approval: ${reason}`,
        toStatus: currentStatus,
        transactionId: transaction.id,
      };
    }),
  });
}

export async function cancelTransactionRequest(
  user: CurrentUser,
  transactionId: string,
) {
  return db.$transaction(
    async (tx) => {
      const transaction = await findTransactionDetail(tx, transactionId);

      if (transaction.requestedBy.id !== user.id) {
        throw new WorkflowError("Only the original requester can cancel this request.", 403, "CANCEL_REQUESTER_ONLY");
      }

      if (
        transaction.workflowStatus !== TransactionWorkflowStatus.PENDING &&
        transaction.workflowStatus !== TransactionWorkflowStatus.REJECTED
      ) {
        throw new WorkflowError("Only pending or rejected requests can be cancelled.", 409, "CANCEL_REQUEST_NOT_ALLOWED");
      }

      const approvedCount = transaction.approvals.filter((approval) => approval.status === ApprovalStatus.APPROVED && approval.stepSequence > 1).length;
      if (approvedCount > 0 && transaction.workflowStatus !== TransactionWorkflowStatus.REJECTED) {
        throw new WorkflowError("A request with completed approval cannot be cancelled.", 409, "CANCEL_APPROVAL_ALREADY_COMPLETED");
      }

      if (!transaction.sourceTransactionId && transaction.workflowStatus === TransactionWorkflowStatus.PENDING) {
        await releaseRejectedTransactionItems(tx, transaction, user.id, "Request cancelled by requester.");
      }

      await tx.transactionApproval.updateMany({
        where: { transactionId: transaction.id, status: ApprovalStatus.PENDING },
        data: { comment: "Cancelled by requester.", status: ApprovalStatus.REJECTED, actedAt: new Date() },
      });

      return tx.transaction.update({
        where: { id: transaction.id },
        data: { workflowStatus: TransactionWorkflowStatus.CANCELLED },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function rejectTransaction(
  user: CurrentUser,
  transactionId: string,
  input: RejectTransactionInput,
) {
  const reason = requireText(input.reason, "Reject reason");
  const now = new Date();

  return db.$transaction(
    async (tx) => {
      const transaction = await findTransactionDetail(tx, transactionId);

      if (transaction.workflowStatus !== TransactionWorkflowStatus.PENDING && !transaction.approvals.some((approval) => approval.resolutionBatchId && approval.status === ApprovalStatus.PENDING)) {
        throw new WorkflowError("Transaction is not pending approval.", 409);
      }

      const currentProjectLeadIds = new Set([
        ...(transaction.project?.leadUser ? [transaction.project.leadUser.id] : []),
        ...(transaction.project?.members ?? []).map((member) => member.user.id),
      ]);
      const currentApproval = currentPendingApproval(user, transaction.approvals, currentProjectLeadIds);

      if (!currentApproval) {
        throw new WorkflowError("No approval is waiting for this user.", 403);
      }

      await tx.transactionApproval.update({
        where: { id: currentApproval.id },
        data: {
          actedAt: now,
          approverNameSnapshot: user.name,
          approverTagSnapshot: currentApproval.requiredTag,
          comment: reason,
          status: ApprovalStatus.REJECTED,
          userId: user.id,
        },
      });

      if (currentApproval.resolutionBatchId && !transaction.sourceTransactionId) {
        const batchId = currentApproval.resolutionBatchId;
        const unposted = await tx.transactionItemOutcome.count({ where: { transactionId, resolutionBatchId: batchId, approvedAt: null } });
        if (!unposted) throw new WorkflowError("Posted outcomes cannot be rejected.", 409, "RETURN_BATCH_ALREADY_POSTED");
        await tx.returnBatch.update({ where: { id: batchId }, data: { state: "REJECTED" } });
        await tx.transactionApproval.updateMany({ where: { transactionId, resolutionBatchId: batchId, status: ApprovalStatus.PENDING }, data: { status: ApprovalStatus.REJECTED, comment: reason, actedAt: now } });
        const soldOutcomes = await tx.transactionItemOutcome.findMany({ where: { transactionId, resolutionBatchId: batchId, soldTransactionId: { not: null } }, select: { soldTransactionId: true } });
        for (const saleId of new Set(soldOutcomes.map((outcome) => outcome.soldTransactionId).filter((id): id is string => Boolean(id)))) {
          await tx.transaction.update({ where: { id: saleId }, data: { workflowStatus: TransactionWorkflowStatus.REJECTED } });
          await tx.transactionApproval.updateMany({ where: { transactionId: saleId, status: ApprovalStatus.PENDING }, data: { status: ApprovalStatus.REJECTED, comment: reason, actedAt: now } });
        }
        await refreshTransactionResolutionStatus(tx, transactionId, now);
        return findTransactionDetail(tx, transactionId);
      }

      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          completedAt: null,
          status: transaction.status,
          workflowStatus: TransactionWorkflowStatus.REJECTED,
        },
      });

      if (transaction.sourceTransactionId) {
        await recordRejectedDerivedResolutionItems(tx, transaction, user.id, reason);
        const linked = await tx.transactionItemOutcome.findMany({ where: { soldTransactionId: transactionId, approvedAt: null }, select: { resolutionBatchId: true } });
        for (const batchId of new Set(linked.map((outcome) => outcome.resolutionBatchId).filter((id): id is string => Boolean(id)))) {
          await tx.returnBatch.update({ where: { id: batchId }, data: { state: "REJECTED" } });
        }
        await refreshTransactionResolutionStatus(tx, transaction.sourceTransactionId, now);
      } else {
        await releaseRejectedTransactionItems(tx, transaction, user.id, reason);
      }

      return findTransactionDetail(tx, transactionId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}


export type UpdatePendingTransactionRequestInput = {
  items?: RequestAssetItemInput[];
  internalRequest?: boolean;
  note?: string | null;
  projectId?: string | null;
  projectRequest?: boolean;
  purpose: string;
  serviceRequest?: boolean;
  soldPrice?: string | null;
  type: TransactionType;
};

export async function updatePendingTransactionRequest(
  user: CurrentUser,
  transactionId: string,
  input: UpdatePendingTransactionRequestInput,
) {
  const purpose = requireText(input.purpose, input.projectRequest ? "Project" : "Customer Name");
  const note = cleanText(input.note);
  const soldPrice = cleanText(input.soldPrice);
  if (input.type === TransactionType.SOLD && soldPrice && Number.isNaN(Number(soldPrice))) {
    throw new WorkflowError("Price must be a valid number.");
  }
  const toStatus = getTransactionAssetStatus(input.type);
  const requestedItems = input.items ? normalizeRequestItems(input) : null;

  return db.$transaction(
    async (tx) => {
      const transaction = await findTransactionDetail(tx, transactionId);

      if (transaction.requestedBy.id !== user.id) {
        throw new WorkflowError("Only the requester can edit this request.", 403);
      }

      const isRejectedEdit = transaction.workflowStatus === TransactionWorkflowStatus.REJECTED;

      if (
        transaction.workflowStatus !== TransactionWorkflowStatus.PENDING &&
        transaction.workflowStatus !== TransactionWorkflowStatus.REJECTED
      ) {
        throw new WorkflowError("Only pending or rejected requests can be edited.", 409);
      }

      if (
        !isRejectedEdit &&
        transaction.approvals.some((approval) => approval.status === ApprovalStatus.APPROVED && approval.stepSequence > 1)
      ) {
        throw new WorkflowError("This request is locked because approval has already started.", 409);
      }

      if (input.type === TransactionType.USING && !input.internalRequest) {
        throw new WorkflowError("Using requests must be Internal.");
      }

      if (input.type !== TransactionType.USING) {
        if (input.internalRequest) {
          throw new WorkflowError("Borrow and sold requests must be Service or Project only.");
        }

        if (Boolean(input.serviceRequest) === Boolean(input.projectRequest)) {
          throw new WorkflowError("Choose either Service or Project.");
        }
      }

      let requestPurpose = purpose;
      let projectId = cleanText(input.projectId);

      if (input.projectRequest) {
        const project = await findProjectForRequest(tx, user, projectId);
        projectId = project.id;
        requestPurpose = project.name;
      } else {
        projectId = null;
      }

      const approvalInput = { ...input, projectId, purpose: requestPurpose };

      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          internalRequest: input.internalRequest ?? false,
          note,
          projectId,
          projectRequest: input.projectRequest ?? false,
          purpose: requestPurpose,
          serviceRequest: input.serviceRequest ?? false,
          soldPrice: input.type === TransactionType.SOLD && soldPrice ? new Prisma.Decimal(soldPrice) : null,
          type: input.type,
          workflowStatus: TransactionWorkflowStatus.PENDING,
          status: getInitialTransactionStatus(input.type),
          completedAt: null,
          returnedAt: null,
        },
      });

      if (!requestedItems) {
        await tx.transactionItem.updateMany({
          where: { transactionId },
          data: { note, toStatus },
        });

        const requester = await requireWorkflowUserById(tx, transaction.requestedBy.id);
        const workflowItems = transaction.items.map((item) => ({
          asset: item.asset as unknown as WorkflowAsset,
          quantity: item.requestedQuantity,
        }));

        if (isRejectedEdit) {
          for (const workflowItem of workflowItems) {
            if (isQuantityAsset(workflowItem.asset)) {
              await refreshQuantityRequestStatus(tx, workflowItem.asset.id, requester.id);
            } else {
              await holdAsset(tx, workflowItem.asset, user, new Date());
            }
          }
        }

        await replaceTransactionApprovals(
          tx,
          transactionId,
          await buildApprovalCandidates(tx, requester, { ...approvalInput, requestDate: transaction.requestDate }, workflowItems),
          undefined,
          requester,
        );

        return findTransactionDetail(tx, transactionId);
      }

      assertHasItems(requestedItems, "Asset items");

      const nextItems = await findRequestItems(tx, requestedItems);
      const previousByAssetId = new Map(
        transaction.items.map((item) => [item.assetId, item]),
      );
      await assertNoOpenSerialTransactionItems(
        tx,
        nextItems,
        new Set(previousByAssetId.keys()),
      );
      const nextByAssetId = new Map(
        nextItems.map((item) => [item.asset.id, item]),
      );
      const availableQuantities = await getAvailableQuantities(
        tx,
        nextItems.map((item) => item.asset),
      );

      for (const nextItem of nextItems) {
        const previous = previousByAssetId.get(nextItem.asset.id);

        assertCanRequestWarehouse(user, nextItem.asset.warehouse.code);

        if (!isQuantityAsset(nextItem.asset) && nextItem.quantity !== 1) {
          throw new WorkflowError(
            `Serial asset ${assetDisplayName(nextItem.asset)} can only be requested with quantity 1.`,
            409,
            "INVALID_SERIAL_QUANTITY",
          );
        }

        if (isQuantityAsset(nextItem.asset)) {
          const previousQuantity = previous?.requestedQuantity ?? 0;
          const availableQuantity =
            (availableQuantities.get(nextItem.asset.id) ?? 0) + previousQuantity;

          if (
            !previous &&
            nextItem.asset.status !== AssetStatus.READY &&
            nextItem.asset.status !== AssetStatus.REQUEST
          ) {
            throw new WorkflowError(
              `Asset ${assetDisplayName(nextItem.asset)} is not ready for request.`,
              409,
              "ASSET_NOT_READY",
            );
          }

          if (nextItem.quantity > availableQuantity) {
            throw new WorkflowError(
              `Asset ${assetDisplayName(nextItem.asset)} has only ${availableQuantity} available.`,
              409,
              "INSUFFICIENT_ASSET_QUANTITY",
            );
          }
        } else if (!previous) {
          if (nextItem.asset.status !== AssetStatus.READY) {
            throw new WorkflowError(
              `Asset ${assetDisplayName(nextItem.asset)} is not ready for request.`,
              409,
              "ASSET_NOT_READY",
            );
          }

          if (nextItem.asset.requestLockedById) {
            throw new WorkflowError(
              `Asset ${assetDisplayName(nextItem.asset)} is locked by another user.`,
              409,
              "ASSET_LOCKED_BY_ANOTHER_USER",
            );
          }
        }
      }

      const removedItems = transaction.items.filter(
        (item) => !nextByAssetId.has(item.assetId),
      );
      const addedItems = nextItems.filter(
        (item) => !previousByAssetId.has(item.asset.id),
      );
      const keptItems = nextItems.filter((item) =>
        previousByAssetId.has(item.asset.id),
      );

      const quantityAssetIdsToRefresh = new Set<string>();

      for (const removed of removedItems) {
        const workflowItem = {
          asset: removed.asset as unknown as WorkflowAsset,
          quantity: removed.requestedQuantity,
        };

        if (isQuantityTransactionItem(removed)) {
          quantityAssetIdsToRefresh.add(removed.assetId);
        } else {
          await releaseHeldAsset(tx, workflowItem.asset, transaction.requestedBy.id);
        }
      }

      for (const added of addedItems) {
        if (isQuantityAsset(added.asset)) {
          quantityAssetIdsToRefresh.add(added.asset.id);
        } else {
          await holdAsset(tx, added.asset, user, new Date());
        }
      }

      for (const kept of keptItems) {
        if (isQuantityAsset(kept.asset)) {
          quantityAssetIdsToRefresh.add(kept.asset.id);
        } else if (isRejectedEdit) {
          await holdAsset(tx, kept.asset, user, new Date());
        }
      }

      if (removedItems.length > 0) {
        await tx.transactionItem.deleteMany({
          where: {
            id: { in: removedItems.map((item) => item.id) },
            transactionId,
          },
        });
      }

      for (const kept of keptItems) {
        const previous = previousByAssetId.get(kept.asset.id);

        if (!previous) {
          continue;
        }

        await tx.transactionItem.update({
          where: { id: previous.id },
          data: {
            note,
            requestedQuantity: kept.quantity,
            soldPrice: input.type === TransactionType.SOLD && soldPrice ? new Prisma.Decimal(soldPrice) : null,
            toStatus,
          },
        });
      }

      if (addedItems.length > 0) {
        await tx.transactionItem.createMany({
          data: addedItems.map(({ asset, quantity }) => ({
            assetId: asset.id,
            fromStatus: isQuantityAsset(asset) ? AssetStatus.READY : AssetStatus.REQUEST,
            note,
            requestedQuantity: quantity,
            soldPrice: input.type === TransactionType.SOLD && soldPrice ? new Prisma.Decimal(soldPrice) : null,
            toStatus,
            transactionId,
          })),
        });
      }

      for (const assetId of quantityAssetIdsToRefresh) {
        await refreshQuantityRequestStatus(tx, assetId, user.id);
      }

      const requester = await requireWorkflowUserById(tx, transaction.requestedBy.id);
      await replaceTransactionApprovals(
        tx,
        transactionId,
        await buildApprovalCandidates(tx, requester, { ...approvalInput, requestDate: transaction.requestDate }, nextItems),
        undefined,
        requester,
      );

      const historyRows = [
        ...removedItems.map((item) => ({
          actionType: AssetActionType.STATUS_CHANGE,
          assetId: item.assetId,
          changedById: user.id,
          fromStatus: AssetStatus.REQUEST,
          note: "Removed from pending request",
          toStatus: AssetStatus.READY,
          transactionId,
        })),
        ...addedItems.map(({ asset, quantity }) => ({
          actionType: AssetActionType.REQUEST_HOLD,
          assetId: asset.id,
          changedById: user.id,
          fromStatus: AssetStatus.READY,
          note: isQuantityAsset(asset)
            ? `Added to pending request; quantity: ${quantity}`
            : "Added to pending request",
          toStatus: AssetStatus.REQUEST,
          transactionId,
        })),
        ...keptItems
          .filter((item) => {
            const previous = previousByAssetId.get(item.asset.id);

            return previous && previous.requestedQuantity !== item.quantity;
          })
          .map(({ asset, quantity }) => ({
            actionType: AssetActionType.ADJUST_QUANTITY,
            assetId: asset.id,
            changedById: user.id,
            fromStatus: AssetStatus.REQUEST,
            note: `Pending request quantity changed to ${quantity}`,
            toStatus: AssetStatus.REQUEST,
            transactionId,
          })),
      ];

      if (historyRows.length > 0) {
        await tx.assetStatusHistory.createMany({ data: historyRows });
      }

      return findTransactionDetail(tx, transactionId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}


export async function getEditablePendingRequestsForUser(user: CurrentUser) {
  const transactions = await db.transaction.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      id: true,
      purpose: true,
      transactionNo: true,
      type: true,
      workflowStatus: true,
      _count: { select: { items: true } },
    },
    where: {
      requestedById: user.id,
      sourceTransactionId: null,
      OR: [
        { workflowStatus: TransactionWorkflowStatus.REJECTED },
        {
          workflowStatus: TransactionWorkflowStatus.PENDING,
          approvals: { none: { isCurrent: true, status: ApprovalStatus.APPROVED, stepSequence: { gt: 1 } } },
        },
      ],
    },
  });

  return transactions.map((transaction) => ({
    createdAt: transaction.createdAt,
    id: transaction.id,
    itemCount: transaction._count.items,
    purpose: transaction.purpose,
    transactionNo: transaction.transactionNo,
    type: transaction.type,
    workflowStatus: transaction.workflowStatus,
  }));
}

export async function addItemsToPendingTransaction(
  user: CurrentUser,
  transactionId: string,
  input: { items?: RequestAssetItemInput[] },
) {
  const requestItems = normalizeRequestItems(input);
  assertHasItems(requestItems, "Asset items");

  const transaction = await db.transaction.findUnique({
    select: {
      id: true,
      internalRequest: true,
      items: { select: { assetId: true, requestedQuantity: true } },
      note: true,
      projectId: true,
      projectRequest: true,
      purpose: true,
      requestedById: true,
      serviceRequest: true,
      type: true,
    },
    where: { id: transactionId },
  });

  if (!transaction) {
    throw new WorkflowError("Transaction not found.", 404);
  }

  if (transaction.requestedById !== user.id) {
    throw new WorkflowError("Only the requester can edit this request.", 403);
  }

  const nextItems = new Map<string, RequestAssetItemInput>();
  for (const item of transaction.items) {
    if (!item.assetId) throw new WorkflowError("Assign a valid asset before editing this request.", 409, "TRANSACTION_ASSET_MISSING");
    nextItems.set(item.assetId, {
      assetId: item.assetId,
      quantity: item.requestedQuantity,
    });
  }

  for (const item of requestItems) {
    const existing = nextItems.get(item.assetId);
    nextItems.set(item.assetId, {
      assetId: item.assetId,
      quantity: existing ? (existing.quantity ?? 1) + item.quantity : item.quantity,
    });
  }

  return updatePendingTransactionRequest(user, transactionId, {
    internalRequest: transaction.internalRequest,
    items: [...nextItems.values()],
    note: transaction.note,
    projectId: transaction.projectId,
    projectRequest: transaction.projectRequest,
    purpose: transaction.purpose,
    serviceRequest: transaction.serviceRequest,
    type: transaction.type,
  });
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


async function createReturnApprovalTransaction(
  tx: Prisma.TransactionClient,
  actor: CurrentUser,
  sourceTransaction: TransactionDetail,
  returnItems: Array<TransactionDetail["items"][number] & { returnCondition?: AssetCondition }>,
  note: string | null,
  now: Date,
  resolutionBatchId: string,
) {
  const workflowItems = returnItems.map((item) => ({
    asset: item.asset as unknown as WorkflowAsset,
    quantity: item.requestedQuantity,
  }));
  const approvals = await buildReturnApprovalCandidates(tx, sourceTransaction, workflowItems);
  await tx.transactionItemOutcome.createMany({
    data: returnItems.map((item) => ({
      transactionId: sourceTransaction.id,
      transactionItemId: item.id,
      outcomeStatus: item.toStatus,
      returnCondition: item.toStatus === AssetStatus.READY && isQuantityTransactionItem(item) ? item.returnCondition ?? AssetCondition.NEW : null,
      resolutionBatchId,
      quantity: item.requestedQuantity,
      note: item.resolutionNote,
      soldPrice: item.toStatus === AssetStatus.SOLD && item.soldPrice ? new Prisma.Decimal(item.soldPrice) : null,
    })),
  });

  await tx.assetStatusHistory.createMany({
    data: returnItems.map((item) => ({
      actionType: AssetActionType.STATUS_CHANGE,
      assetId: item.assetId,
      changedById: actor.id,
      fromStatus: item.toStatus,
      toStatus: item.toStatus,
      note: [note, `Return approval pending: ${item.toStatus} (${item.requestedQuantity})`].filter(Boolean).join("\n"),
      transactionId: sourceTransaction.id,
    })),
  });

  await tx.transactionApproval.createMany({
    data: approvals.map((approval) => ({
      approverNameSnapshot: approval.approverNameSnapshot,
      approverTagSnapshot: approval.approverTagSnapshot,
      requiredTag: approval.requiredTag,
      resolutionBatchId,
      stepSequence: approval.stepSequence,
      transactionId: sourceTransaction.id,
      userId: approval.userId,
    })),
  });

  await recordRequesterConfirmation(tx, sourceTransaction.id, actor, now, resolutionBatchId);

  await tx.transaction.update({
    where: { id: sourceTransaction.id },
    data: { completedAt: null, returnedAt: null, workflowStatus: TransactionWorkflowStatus.IN_PROGRESS },
  });

  return sourceTransaction;
}


async function applyQuantityReturnStock(
  tx: Prisma.TransactionClient,
  item: TransactionDetail["items"][number],
  condition: AssetCondition,
  quantity: number,
  userId: string,
  stockCodeAssetId: string | null,
) {
  const sourceAsset = item.asset;
  if (!sourceAsset) {
    throw new WorkflowError("The returned quantity is not linked to an asset model.", 409, "RETURN_ASSET_MISSING");
  }

  if (!stockCodeAssetId) {
    throw new WorkflowError("Storeman must select an existing Stock Code before approving this return.", 409, "RETURN_STOCK_CODE_REQUIRED");
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
      assetModel: { select: { id: true, name: true, brand: true, partNo: true, description: true } },
      stockCode: true,
    },
  });

  const selectedStockCode = stockCodeSource?.stockCode;
  if (!stockCodeSource || !selectedStockCode || (condition === AssetCondition.NEW && selectedStockCode !== sourceAsset.stockCode)) {
    throw new WorkflowError(
      "The selected Stock Code must match the canonical model, warehouse and condition. Legacy Used masters require an approved migration first.",
      409,
      "RETURN_STOCK_CODE_INVALID",
    );
  }

  const bucketKey = JSON.stringify([sourceAsset.assetModelId, sourceAsset.warehouseId, selectedStockCode, condition]);
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
    return { assetId: updated.id, stockCode: selectedStockCode, quantityBefore, quantityAfter };
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
  return { assetId: created.id, stockCode: selectedStockCode, quantityBefore: 0, quantityAfter: quantity };
}

async function applyApprovedOutcomeCycle(
  tx: Prisma.TransactionClient,
  transaction: TransactionDetail,
  userId: string,
  now: Date,
  resolutionBatchId?: string | null,
) {
  const outcomesByItem = new Map<string, typeof transaction.outcomeRecords>();
  for (const outcome of transaction.outcomeRecords.filter((record) =>
    record.outcomeStatus !== AssetStatus.SOLD &&
    (!resolutionBatchId || record.resolutionBatchId === resolutionBatchId),
  )) {
    const existing = outcomesByItem.get(outcome.transactionItemId) ?? [];
    existing.push(outcome);
    outcomesByItem.set(outcome.transactionItemId, existing);
  }

  for (const [itemId, outcomes] of outcomesByItem) {
    const item = transaction.items.find((candidate) => candidate.id === itemId);
    if (!item) continue;
    for (const outcome of outcomes.filter((candidate) => !candidate.approvedAt)) {
      const asset = item.asset;
      if (!asset || !item.assetId) throw new WorkflowError("The issued item has no source asset.", 409, "RETURN_ASSET_MISSING");
      const isQuantityPool = getEffectiveAssetTrackMethod(asset) === AssetTrackMethod.QUANTITY;
      let outcomeAssetId = item.assetId;

      if (isQuantityPool && outcome.outcomeStatus === AssetStatus.READY) {
        if (!outcome.returnCondition) {
          throw new WorkflowError(
            "Storeman must select a return condition for every quantity-pool return.",
            409,
            "RETURN_CONDITION_REQUIRED",
          );
        }

        // Older quantity loans were reserved but never removed from stock at
        // checkout. Only add stock back for loans recorded as dispatched by
        // the quantity-accounting flow; otherwise this would inflate stock.
        const stock = item.dispatchedAt
          ? await applyQuantityReturnStock(
              tx,
              item,
              outcome.returnCondition,
              outcome.quantity,
              userId,
              outcome.assetId,
            )
          : {
              assetId: asset.id,
              stockCode: asset.stockCode,
              quantityBefore: asset?.assetQuantity ?? 0,
              quantityAfter: asset?.assetQuantity ?? 0,
            };
        outcomeAssetId = stock.assetId;
        if (outcome.returnCondition === AssetCondition.USED) {
          const target = await tx.asset.findUniqueOrThrow({ where: { id: stock.assetId }, select: { note: true } });
          await tx.asset.update({ where: { id: stock.assetId }, data: {
            note: appendUsedReturnRemarks(target.note, [{ id: outcome.id, quantity: outcome.quantity, requestNo: transaction.transactionNo ?? transaction.documentRef }]),
            updatedById: userId,
          } });
        }

        await tx.assetStatusHistory.create({
          data: {
            actionType: AssetActionType.RETURN,
            assetId: stock.assetId,
            changedById: userId,
            condition: outcome.returnCondition,
            stockCode: stock.stockCode,
            fromStatus: asset?.status ?? null,
            toStatus: AssetStatus.READY,
            quantityBefore: stock.quantityBefore,
            quantityAfter: stock.quantityAfter,
            quantityChanged: stock.quantityAfter - stock.quantityBefore,
            note: "Approved quantity-pool return",
            transactionId: transaction.id,
          },
        });
      } else if (isQuantityPool && (outcome.outcomeStatus === AssetStatus.FAIL || outcome.outcomeStatus === AssetStatus.LOST)) {
        const currentAsset = await tx.asset.findUnique({ where: { id: asset.id }, select: { note: true } });
        if (!currentAsset) throw new WorkflowError("Source stock row disappeared.", 409, "RETURN_ASSET_MISSING");
        const marker = `[return-outcome:${outcome.id}]`;
        if (!currentAsset.note?.includes(marker)) {
          await tx.asset.update({ where: { id: asset.id }, data: {
            note: [currentAsset.note, `${marker} ${outcome.outcomeStatus} ${outcome.quantity} from ${transaction.transactionNo ?? transaction.id}; return batch ${outcome.resolutionBatchId}`].filter(Boolean).join("\n"),
            updatedById: userId,
          } });
        }
        await tx.assetStatusHistory.create({
          data: {
            actionType: AssetActionType.STATUS_CHANGE,
            assetId: item.assetId,
            changedById: userId,
            condition: asset?.condition ?? AssetCondition.NEW,
            stockCode: asset?.stockCode,
            fromStatus: asset?.status ?? null,
            toStatus: asset?.status ?? AssetStatus.READY,
            quantityBefore: asset?.assetQuantity,
            quantityAfter: asset?.assetQuantity,
            quantityChanged: 0,
            note: `${outcome.outcomeStatus} ${outcome.quantity} from ${transaction.transactionNo ?? transaction.id}; return batch ${outcome.resolutionBatchId}; outcome ${outcome.id}. ${outcome.note ?? ""}`,
            transactionId: transaction.id,
          },
        });
      } else {
        await resolveItem(
          tx,
          item,
          { id: userId } as CurrentUser,
          now,
          outcome.outcomeStatus,
          "Approved return outcome",
          null,
          outcome.quantity,
        );

        await tx.assetStatusHistory.create({
          data: {
            actionType: outcome.outcomeStatus === AssetStatus.READY
              ? AssetActionType.RETURN
              : AssetActionType.STATUS_CHANGE,
            assetId: item.assetId,
            changedById: userId,
            condition: asset?.condition ?? AssetCondition.NEW,
            fromStatus: asset?.status ?? null,
            toStatus: outcome.outcomeStatus,
            quantityChanged: isQuantityPool ? outcome.quantity : null,
            note: "Approved return outcome",
            transactionId: transaction.id,
          },
        });
      }

      await tx.transactionItemOutcome.update({
        where: { id: outcome.id },
        data: {
          assetId: outcomeAssetId,
          approvedAt: now,
          approvedById: userId,
        },
      });
    }
    const approvedQuantity = await tx.transactionItemOutcome.aggregate({
      _sum: { quantity: true },
      where: { transactionItemId: item.id, approvedAt: { not: null } },
    });
    const fullyResolved = (approvedQuantity._sum.quantity ?? 0) >= item.requestedQuantity;
    await tx.transactionItem.update({
      where: { id: item.id },
      data: {
        resolvedStatus: outcomes.at(-1)?.outcomeStatus ?? null,
        returnedAt: fullyResolved ? now : null,
        returnedById: fullyResolved ? userId : null,
      },
    });
  }

  await refreshTransactionResolutionStatus(tx, transaction.id, now);
}

async function createReturnSaleApprovalTransaction(
  tx: Prisma.TransactionClient,
  actor: CurrentUser,
  sourceTransaction: TransactionDetail,
  saleItems: TransactionDetail["items"],
  note: string | null,
  now: Date,
  resolutionBatchId: string,
) {
  const combined = new Map<string, TransactionDetail["items"][number]>();
  for (const item of saleItems) {
    const previous = combined.get(item.id);
    combined.set(item.id, { ...item, requestedQuantity: (previous?.requestedQuantity ?? 0) + item.requestedQuantity });
  }
  saleItems = Array.from(combined.values());
  const workflowItems = saleItems.map((item) => ({
    asset: item.asset as unknown as WorkflowAsset,
    quantity: item.requestedQuantity,
  }));
  const approvals = await buildReturnApprovalCandidates(tx, sourceTransaction, workflowItems, true);
  const transaction = await tx.transaction.create({
    data: {
      completedAt: null,
      createdById: actor.id,
      documentRef: null,
      dueDate: null,
      internalRequest: false,
      note,
      projectId: sourceTransaction.projectId,
      projectRequest: sourceTransaction.projectRequest,
      purpose: sourceTransaction.purpose,
      requestDate: now,
      requestedById: sourceTransaction.requestedBy.id,
      serviceRequest: sourceTransaction.serviceRequest,
      soldPrice: null,
      sourceTransactionId: sourceTransaction.id,
      status: TransactionStatus.COMPLETED,
      // A sold-from-return ticket is a child history record, not a new request.
      // Keep the original requisition sequence untouched and display it as
      // `From REQ-...` through sourceTransactionId.
      transactionNo: null,
      type: TransactionType.SOLD,
      workflowStatus: TransactionWorkflowStatus.PENDING,
    },
  });

  await tx.transactionItem.createMany({
    data: saleItems.map((item) => ({
      assetId: item.assetId,
      fromStatus: item.toStatus,
      note,
      requestedQuantity: item.requestedQuantity,
      soldPrice: item.soldPrice ? new Prisma.Decimal(item.soldPrice) : null,
      toStatus: AssetStatus.SOLD,
      transactionId: transaction.id,
    })),
  });

  await tx.transactionItemOutcome.updateMany({
    where: { transactionId: sourceTransaction.id, resolutionBatchId, outcomeStatus: AssetStatus.SOLD, approvedAt: null },
    data: { soldTransactionId: transaction.id },
  });

  await replaceTransactionApprovals(tx, transaction.id, approvals, resolutionBatchId);

  await tx.assetStatusHistory.createMany({
    data: saleItems.map((item) => ({
      actionType: AssetActionType.STATUS_CHANGE,
      assetId: item.assetId,
      changedById: actor.id,
      fromStatus: item.toStatus,
      note: [note, `Created sold-from-return approval from ${sourceTransaction.transactionNo ?? sourceTransaction.documentRef ?? sourceTransaction.id}`]
        .filter(Boolean)
        .join("\n"),
      toStatus: item.toStatus,
      transactionId: transaction.id,
    })),
  });

  return transaction;
}

export async function resolveTransactionItems(
  user: CurrentUser,
  input: ResolveTransactionInput,
) {
  const itemIds = uniqueIds(input.items.map((item) => item.itemId));
  assertHasIds(itemIds, "Transaction items");
  const resolutionMap = buildResolutionMap(
    input.items.map((item) => ({
      ...item,
      itemId: item.itemId.trim(),
      note: cleanText(item.note),
      soldPrice: cleanText(item.soldPrice),
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

      const hasPendingReturnOutcome = transaction.outcomeRecords.some(
        (outcome) => !outcome.approvedAt,
      );
      const canAppendReturnBatch =
        transaction.workflowStatus === TransactionWorkflowStatus.PENDING &&
        hasPendingReturnOutcome;

      if (
        transaction.workflowStatus !== TransactionWorkflowStatus.IN_PROGRESS &&
        !canAppendReturnBatch
      ) {
        throw new WorkflowError(
          "This transaction is still pending approval and cannot be returned.",
          409,
          "TRANSACTION_NOT_APPROVED",
        );
      }

      if (transaction.requestedBy.id !== user.id) {
        throw new WorkflowError(
          "Only the original requester can return this transaction.",
          403,
          "RETURN_REQUESTER_ONLY",
        );
      }

      const items = getOpenResolutionItems(
        transaction,
        Array.from(resolutionMap.values()),
      );

      if (items.length === 0) {
        throw new WorkflowError("No open transaction items to resolve.", 409);
      }

      assertCanResolveTransaction(user, { items });
      const grouped = new Map<AssetStatus, Array<TransactionDetail["items"][number] & { returnCondition?: AssetCondition }>>();
      const resolutionBatchId = input.resolutionBatchId ?? randomUUID();
      const existingBatch = input.resolutionBatchId ? await tx.returnBatch.findFirst({ where: { id: resolutionBatchId, transactionId: transaction.id } }) : null;
      if (input.resolutionBatchId && !existingBatch) throw new WorkflowError("Return batch not found.", 404);
      if (existingBatch) {
        await assertReturnBatchEditable(tx, transaction.id, existingBatch.id);
        const posted = await tx.transactionItemOutcome.count({ where: { resolutionBatchId, approvedAt: { not: null } } });
        if (posted && existingBatch.state !== "REJECTED") throw new WorkflowError("Posted return batches cannot be revised.", 409, "RETURN_BATCH_ALREADY_POSTED");
      }
      const activeBatches = await tx.returnBatch.findMany({ where: { transactionId: transaction.id, state: { notIn: ["REJECTED", "CANCELLED"] } }, select: { id: true } });
      const activeBatchIds = new Set(activeBatches.map((batch) => batch.id));
      const approvedQuantities = new Map<string, number>();
      for (const outcome of transaction.outcomeRecords) {
        if (outcome.approvedAt || (outcome.resolutionBatchId !== existingBatch?.id && (!outcome.resolutionBatchId || activeBatchIds.has(outcome.resolutionBatchId)))) {
          approvedQuantities.set(
            outcome.transactionItemId,
            (approvedQuantities.get(outcome.transactionItemId) ?? 0) + outcome.quantity,
          );
        }
      }
      for (const item of items) {
        const resolution = resolutionMap.get(item.id);
        const remainingQuantity = Math.max(0, item.requestedQuantity - (approvedQuantities.get(item.id) ?? 0));
        const allocations = resolution?.allocations?.length
          ? resolution.allocations
          : [{ quantity: resolution?.quantity ?? remainingQuantity, toStatus: resolution?.toStatus ?? AssetStatus.READY, returnCondition: resolution?.returnCondition, note: resolution?.note, soldPrice: resolution?.soldPrice }];
        const totalQuantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
        if (totalQuantity <= 0 || totalQuantity > remainingQuantity) {
          throw new WorkflowError(`Resolution quantity for ${transactionItemAssetName(item)} cannot exceed the requested quantity.`);
        }
        for (const allocation of allocations) {
          if (!isQuantityTransactionItem(item) && (allocation.quantity !== 1 || allocations.length !== 1 || allocation.returnCondition === AssetCondition.USED)) throw new WorkflowError("Serialized returns must use quantity 1 and cannot be USED.", 400, "INVALID_SERIAL_RETURN");
          if (allocation.returnCondition && allocation.toStatus !== AssetStatus.READY) throw new WorkflowError("Return condition is only valid for RETURN or USED outcomes.");
          const group = grouped.get(allocation.toStatus) ?? [];
          group.push({
            ...item,
            requestedQuantity: allocation.quantity,
            toStatus: allocation.toStatus,
            returnCondition: allocation.returnCondition,
            resolutionNote: cleanText(allocation.note),
            soldPrice: allocation.soldPrice ? new Prisma.Decimal(allocation.soldPrice) : null,
          });
          grouped.set(allocation.toStatus, group);
        }
      }

      const soldItems = grouped.get(AssetStatus.SOLD) ?? [];
      const returnItems = Array.from(grouped.entries())
        .flatMap(([, items]) => items);
      if (existingBatch) {
        if (existingBatch.damagePdf || existingBatch.signedPdf) {
          await tx.returnBatchEvidence.createMany({ data: [{
            batchId: existingBatch.id, revision: existingBatch.revision,
            damagePdf: existingBatch.damagePdf, signedPdf: existingBatch.signedPdf,
            signedFilename: existingBatch.signedFilename, signedById: existingBatch.signedById,
            signedAt: existingBatch.signedAt,
          }], skipDuplicates: true });
        }
        await tx.transactionApproval.updateMany({ where: { transactionId: transaction.id, resolutionBatchId, isCurrent: true }, data: { isCurrent: false } });
        const sales = await tx.transactionItemOutcome.findMany({ where: { resolutionBatchId, soldTransactionId: { not: null }, approvedAt: null }, select: { soldTransactionId: true } });
        for (const id of new Set(sales.map((outcome) => outcome.soldTransactionId).filter((id): id is string => Boolean(id)))) {
          await tx.transaction.update({ where: { id }, data: { workflowStatus: TransactionWorkflowStatus.CANCELLED } });
          await tx.transactionApproval.updateMany({ where: { transactionId: id, isCurrent: true }, data: { isCurrent: false } });
        }
        await tx.transactionItemOutcome.deleteMany({ where: { resolutionBatchId, approvedAt: null } });
        await tx.returnBatch.update({ where: { id: resolutionBatchId }, data: { revision: { increment: 1 }, state: "SUBMITTED", damagePdf: null, signedPdf: null, signedFilename: null, signedById: null, signedAt: null } });
      } else {
        await tx.returnBatch.create({ data: { id: resolutionBatchId, transactionId: transaction.id, requestNo: `FROM ${transaction.transactionNo}` } });
      }
      if (returnItems.length > 0) {
        await createReturnApprovalTransaction(
          tx,
          user,
          transaction,
          returnItems,
          cleanText(resolutionMap.get(returnItems[0].id)?.note),
          now,
          resolutionBatchId,
        );
      }
      if (soldItems.length > 0) {
        await createReturnSaleApprovalTransaction(
          tx,
          user,
          transaction,
          soldItems,
          cleanText(resolutionMap.get(soldItems[0].id)?.note),
          now,
          resolutionBatchId,
        );
      }

      return findTransactionDetail(tx, transaction.id);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function deletePendingReturnOutcome(
  user: CurrentUser,
  input: DeleteReturnOutcomeInput,
) {
  return db.$transaction(
    async (tx) => {
      const outcome = await tx.transactionItemOutcome.findFirst({
        where: {
          id: input.outcomeId,
          transactionId: input.transactionId,
        },
        select: {
          id: true,
          transactionItemId: true,
          approvedAt: true,
          resolutionBatchId: true,
          soldTransactionId: true,
          transactionItem: { select: { assetId: true } },
          transaction: { select: { requestedById: true } },
          soldTransaction: { select: { id: true, workflowStatus: true } },
        },
      });

      if (!outcome) {
        throw new WorkflowError("Return outcome not found.", 404, "RETURN_OUTCOME_NOT_FOUND");
      }

      if (outcome.transaction?.requestedById !== user.id) {
        throw new WorkflowError("Only the original requester can remove a pending return outcome.", 403, "RETURN_OUTCOME_DELETE_FORBIDDEN");
      }

      if (outcome.approvedAt) {
        throw new WorkflowError("Approved return outcomes cannot be removed.", 409, "RETURN_OUTCOME_ALREADY_APPROVED");
      }
      if (!outcome.resolutionBatchId) throw new WorkflowError("Legacy outcomes must be assigned to a return batch before editing.", 409, "RETURN_BATCH_REQUIRED");
      await assertReturnBatchEditable(tx, input.transactionId, outcome.resolutionBatchId);

      if (outcome.soldTransactionId && outcome.soldTransaction &&
          (outcome.soldTransaction.workflowStatus === TransactionWorkflowStatus.PENDING ||
           outcome.soldTransaction.workflowStatus === TransactionWorkflowStatus.REJECTED)) {
        const remainingSoldQuantity = await tx.transactionItemOutcome.aggregate({
          where: {
            soldTransactionId: outcome.soldTransactionId,
            transactionItemId: outcome.transactionItemId,
            approvedAt: null,
            id: { not: outcome.id },
          },
          _sum: { quantity: true },
        });
        const saleItem = await tx.transactionItem.findFirst({
          where: {
            transactionId: outcome.soldTransactionId,
            assetId: outcome.transactionItem?.assetId ?? undefined,
          },
          select: { id: true },
        });
        if (saleItem) {
          const quantity = remainingSoldQuantity._sum.quantity ?? 0;
          if (quantity > 0) {
            await tx.transactionItem.update({ where: { id: saleItem.id }, data: { requestedQuantity: quantity } });
          } else {
            await tx.transactionItem.delete({ where: { id: saleItem.id } });
          }
        }

        const remainingSaleItems = await tx.transactionItem.count({
          where: { transactionId: outcome.soldTransactionId },
        });
        if (remainingSaleItems === 0) {
          await tx.transaction.update({ where: { id: outcome.soldTransactionId }, data: { workflowStatus: TransactionWorkflowStatus.CANCELLED } });
          await tx.transactionApproval.updateMany({ where: { transactionId: outcome.soldTransactionId, isCurrent: true }, data: { isCurrent: false } });
        }
      }

      await tx.transactionItemOutcome.delete({ where: { id: outcome.id } });

      const remainingBatchOutcomes = outcome.resolutionBatchId
        ? await tx.transactionItemOutcome.count({
            where: {
              transactionId: input.transactionId,
              resolutionBatchId: outcome.resolutionBatchId,
              approvedAt: null,
            },
          })
        : 0;

      if (!outcome.resolutionBatchId || remainingBatchOutcomes === 0) {
        await tx.transactionApproval.updateMany({
          where: {
            transactionId: input.transactionId,
            ...(outcome.resolutionBatchId ? { resolutionBatchId: outcome.resolutionBatchId } : {}),
            status: ApprovalStatus.PENDING,
            isCurrent: true,
          },
          data: { isCurrent: false },
        });
        await tx.returnBatch.update({ where: { id: outcome.resolutionBatchId }, data: { state: "CANCELLED" } });
      } else {
        const remaining = await tx.transactionItemOutcome.findMany({
          where: { transactionId: input.transactionId, resolutionBatchId: outcome.resolutionBatchId, approvedAt: null },
          select: { transactionItem: { select: { asset: { select: { warehouse: { select: { code: true } } } } } } },
        });
        if (remaining.some((row) => !row.transactionItem.asset)) {
          throw new WorkflowError("A remaining return item has no source warehouse.", 409, "TRANSACTION_ASSET_MISSING");
        }
        const activeTags = [...new Set(remaining.flatMap((row) => {
          const code = row.transactionItem.asset!.warehouse.code;
          return [`RETURN_CHECK:${code}`, `STOREMAN:${code}`];
        }))];
        await tx.transactionApproval.updateMany({
          where: {
            transactionId: input.transactionId,
            resolutionBatchId: outcome.resolutionBatchId,
            isCurrent: true,
            AND: [
              { OR: [{ requiredTag: { startsWith: "RETURN_CHECK:" } }, { requiredTag: { startsWith: "STOREMAN:" } }] },
              { requiredTag: { notIn: activeTags } },
            ],
          },
          data: { isCurrent: false },
        });
      }

      const remainingPendingOutcomes = await tx.transactionItemOutcome.count({
        where: { transactionId: input.transactionId, approvedAt: null },
      });
      if (remainingPendingOutcomes === 0) {
        await tx.transaction.update({
          where: { id: input.transactionId },
          data: { workflowStatus: TransactionWorkflowStatus.IN_PROGRESS },
        });
      }

      return findTransactionDetail(tx, input.transactionId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function cancelReturnBatch(user: CurrentUser, transactionId: string, batchId: string) {
  return db.$transaction(async (tx) => {
    const transaction = await findTransactionDetail(tx, transactionId);
    if (transaction.requestedBy.id !== user.id) throw new WorkflowError("Only the original requester can cancel a return batch.", 403, "RETURN_REQUESTER_ONLY");
    await assertReturnBatchEditable(tx, transactionId, batchId);
    if (await tx.transactionItemOutcome.count({ where: { transactionId, resolutionBatchId: batchId, approvedAt: { not: null } } })) throw new WorkflowError("Posted return outcomes cannot be cancelled.", 409, "RETURN_BATCH_ALREADY_POSTED");
    await tx.returnBatch.update({ where: { id: batchId }, data: { state: "CANCELLED" } });
    await tx.transactionApproval.updateMany({ where: { transactionId, resolutionBatchId: batchId, isCurrent: true }, data: { isCurrent: false } });
    const outcomes = await tx.transactionItemOutcome.findMany({ where: { transactionId, resolutionBatchId: batchId, soldTransactionId: { not: null } }, select: { soldTransactionId: true } });
    for (const saleId of new Set(outcomes.map((outcome) => outcome.soldTransactionId).filter((id): id is string => Boolean(id)))) {
      await tx.transaction.update({ where: { id: saleId }, data: { workflowStatus: TransactionWorkflowStatus.CANCELLED } });
      await tx.transactionApproval.updateMany({ where: { transactionId: saleId, isCurrent: true }, data: { isCurrent: false } });
    }
    await refreshTransactionResolutionStatus(tx, transactionId, new Date());
    return findTransactionDetail(tx, transactionId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function migrateLegacyReturnBatch(
  transactionId: string,
  batchId: string,
  expectedOutcomeIds: string[],
  returnConditions: Record<string, AssetCondition> = {},
) {
  return db.$transaction(async (tx) => {
    const transaction = await findTransactionDetail(tx, transactionId);
    if (!isReturnableTransaction(transaction.type) || transaction.sourceTransactionId) throw new WorkflowError("Legacy migration requires an issued source request.", 409, "LEGACY_BATCH_INVALID");
    const outcomes = await tx.transactionItemOutcome.findMany({ where: { transactionId, resolutionBatchId: batchId } });
    const expected = uniqueIds(expectedOutcomeIds);
    if (!expected.length || outcomes.length !== expected.length || outcomes.some((outcome) => !expected.includes(outcome.id) || outcome.approvedAt || outcome.outcomeStatus === AssetStatus.SOLD || outcome.soldTransactionId)) throw new WorkflowError("Legacy outcome IDs must exactly match an entirely unposted non-SOLD batch.", 409, "LEGACY_BATCH_MISMATCH");
    const existing = await tx.returnBatch.findFirst({ where: { id: batchId, transactionId } });
    if (existing) return existing;
    const acted = await tx.transactionApproval.count({ where: { transactionId, resolutionBatchId: batchId, isCurrent: true, status: ApprovalStatus.APPROVED, stepSequence: { gt: 1 } } });
    if (acted) throw new WorkflowError("This migration cannot replace an already approved legacy phase.", 409, "LEGACY_APPROVAL_ALREADY_ACTED");
    for (const outcome of outcomes) {
      const item = transaction.items.find((item) => item.id === outcome.transactionItemId);
      if (!item || outcome.quantity <= 0) throw new WorkflowError("Legacy outcome has no valid issued item.", 409, "LEGACY_BATCH_INVALID");
      const condition = outcome.returnCondition ?? returnConditions[outcome.id];
      if (outcome.outcomeStatus === AssetStatus.READY && isQuantityTransactionItem(item)) {
        if (!condition || (condition !== AssetCondition.NEW && condition !== AssetCondition.USED)) throw new WorkflowError("An explicit return condition is required for each legacy quantity return.", 409, "LEGACY_CONDITION_REQUIRED");
        if (condition === AssetCondition.NEW && !item.asset.stockCode) throw new WorkflowError("The original stock code is missing.", 409, "RETURN_STOCK_CODE_REQUIRED");
        await tx.transactionItemOutcome.update({ where: { id: outcome.id }, data: { returnCondition: condition, ...(condition === AssetCondition.NEW ? { assetId: item.assetId } : {}) } });
      }
    }
    const itemIds = new Set(outcomes.map((outcome) => outcome.transactionItemId));
    const items = transaction.items.filter((item) => itemIds.has(item.id));
    const requester = await requireWorkflowUserById(tx, transaction.requestedBy.id);
    const approvals = await buildReturnApprovalCandidates(tx, transaction, items.map((item) => ({ asset: item.asset as WorkflowAsset, quantity: item.requestedQuantity })));
    const batch = await tx.returnBatch.create({ data: { id: batchId, transactionId, requestNo: `FROM ${transaction.transactionNo}` } });
    await replaceTransactionApprovals(tx, transactionId, approvals, batchId, requester);
    await tx.transaction.update({ where: { id: transactionId }, data: { workflowStatus: TransactionWorkflowStatus.IN_PROGRESS, completedAt: null, returnedAt: null } });
    return batch;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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








