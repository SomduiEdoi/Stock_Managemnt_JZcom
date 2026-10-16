import {
  AssetCondition,
  AssetStatus,
  Prisma,
  ProjectMemberTag,
  TransactionWorkflowStatus,
  TransactionType,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import {
  AssetTrackMethod,
  getEffectiveAssetTrackMethod,
} from "@/lib/asset-tracking";
import {
  createMonthlyRequisitionNo,
  MonthlyRequisitionLimitError,
} from "@/lib/requisition-no";

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

export const assetWorkflowSelect = Prisma.validator<Prisma.AssetSelect>()({
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
        select: {
          canManage: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  },
});

export const transactionDetailSelect =
  Prisma.validator<Prisma.TransactionSelect>()({
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
    requestedBy: {
      select: { email: true, id: true, name: true, position: true },
    },
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
                  select: {
                    canManage: true,
                    user: { select: { id: true, name: true, email: true } },
                  },
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

export type WorkflowAsset = Prisma.AssetGetPayload<{
  select: typeof assetWorkflowSelect;
}>;

export function toWorkflowAsset(asset: WorkflowAsset): WorkflowAsset {
  return {
    id: asset.id,
    assetQuantity: asset.assetQuantity,
    condition: asset.condition,
    stockCode: asset.stockCode,
    requestLockedById: asset.requestLockedById,
    serialNo: asset.serialNo,
    status: asset.status,
    assetModel: {
      isSerialized: asset.assetModel.isSerialized,
      name: asset.assetModel.name,
    },
    warehouse: {
      code: asset.warehouse.code,
      permissions: asset.warehouse.permissions.map((permission) => ({
        canManage: permission.canManage,
        user: {
          id: permission.user.id,
          name: permission.user.name,
          email: permission.user.email,
        },
      })),
    },
  };
}

type RawTransactionDetail = Prisma.TransactionGetPayload<{
  select: typeof transactionDetailSelect;
}>;

type OperationalTransactionItem = RawTransactionDetail["items"][number] & {
  assetId: string;
  asset: NonNullable<RawTransactionDetail["items"][number]["asset"]>;
};

export type TransactionDetail = Omit<RawTransactionDetail, "items"> & {
  items: OperationalTransactionItem[];
};

export function requireOperationalTransaction(
  transaction: RawTransactionDetail,
): TransactionDetail {
  return {
    ...transaction,
    items: transaction.items.map((item) => {
      if (!item.asset || !item.assetId)
        throw new WorkflowError(
          "Assign a valid source asset before operating this transaction.",
          409,
          "TRANSACTION_ASSET_MISSING",
        );
      return { ...item, asset: item.asset, assetId: item.assetId };
    }),
  };
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
  allocations?: {
    quantity: number;
    toStatus: AssetStatus;
    returnCondition?: AssetCondition;
    note?: string | null;
    soldPrice?: string | null;
  }[];
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

export type WorkflowRequestItem = {
  asset: WorkflowAsset;
  quantity: number;
};

export function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function requireText(value: string, label: string) {
  const trimmed = cleanText(value);

  if (!trimmed) {
    throw new WorkflowError(`${label} is required.`);
  }

  return trimmed;
}

export function uniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function requirePositiveQuantity(
  value: number | null | undefined,
  label: string,
) {
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

export function normalizeRequestItems(input: {
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

export function assertHasIds(ids: string[], label: string) {
  if (ids.length === 0) {
    throw new WorkflowError(`${label} is required.`);
  }
}

export function assertHasItems(items: NormalizedRequestItem[], label: string) {
  if (items.length === 0) {
    throw new WorkflowError(`${label} is required.`);
  }
}

export async function createRequisitionNo(
  tx: Prisma.TransactionClient,
  now: Date,
) {
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

export async function findAssets(
  tx: Prisma.TransactionClient,
  assetIds: string[],
) {
  return tx.asset.findMany({
    where: { id: { in: assetIds }, isActive: true },
    select: assetWorkflowSelect,
  });
}

export async function findRequestItems(
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

async function findWorkflowUserById(
  tx: Prisma.TransactionClient,
  userId: string,
) {
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

export async function requireWorkflowUserById(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const user = await findWorkflowUserById(tx, userId);

  if (!user) {
    throw new WorkflowError(
      "Requester is not active.",
      409,
      "REQUESTER_INACTIVE",
    );
  }

  return toWorkflowCurrentUser(user);
}

function toWorkflowCurrentUser(user: WorkflowUserRecord): CurrentUser {
  const primaryAssignment =
    user.organizationAssignments.find((assignment) => assignment.isPrimary) ??
    user.organizationAssignments[0];

  return {
    azureAdObjectId: user.azureAdObjectId,
    email: user.email ?? "",
    id: user.id,
    lastLoginAt: user.lastLoginAt,
    name: user.name,
    organizationLevel:
      primaryAssignment?.organizationLevel ?? user.organizationLevel,
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
      ? {
          ...user.signatureUploadedBy,
          email: user.signatureUploadedBy.email ?? "",
        }
      : null,
  };
}

export function isQuantityAsset(asset: WorkflowAsset) {
  return getEffectiveAssetTrackMethod(asset) === AssetTrackMethod.QUANTITY;
}

export function assetDisplayName(asset: WorkflowAsset) {
  return asset.serialNo ?? asset.assetModel.name;
}

export async function findTransactionDetail(
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

export function isQuantityTransactionItem(
  item: TransactionDetail["items"][number],
) {
  return getEffectiveAssetTrackMethod(item.asset) === AssetTrackMethod.QUANTITY;
}

export function transactionItemAssetName(
  item: TransactionDetail["items"][number],
) {
  return item.asset.serialNo ?? item.asset.assetModel.name;
}
