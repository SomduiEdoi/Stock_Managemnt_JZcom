import {
  ApprovalStatus,
  AssetActionType,
  AssetTrackMethod,
  AssetStatus,
  OrganizationLevel,
  OrganizationTag,
  Prisma,
  ProjectTag,
  StockControllerTag,
  TransactionStatus,
  TransactionWorkflowStatus,
  TransactionType,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import {
  approvalMatchesUser,
  domainHeadStockControllerRequiredTag,
  domainStockControllerRequiredTag,
} from "@/lib/approval-flow";
import { db } from "@/lib/db";
import {
  createMonthlyRequisitionNo,
  MonthlyRequisitionLimitError,
} from "@/lib/requisition-no";
import {
  assertCanChangeAssetStatus,
  assertCanRequestDomain,
  assertCanViewDomain,
  hasRole,
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
  domain: { select: { code: true, inventoryFamily: true } },
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
  project: { select: { id: true, name: true, projectId: true } },
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
    orderBy: [{ stepSequence: "asc" }, { createdAt: "asc" }],
    select: {
      actedAt: true,
      comment: true,
      id: true,
      requiredTag: true,
      status: true,
      stepSequence: true,
      userId: true,
      user: { select: { email: true, id: true, name: true } },
    },
  },
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
      soldPrice: true,
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
          domain: { select: { code: true, inventoryFamily: true } },
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
  projectId?: string | null;
  projectRequest?: boolean;
  purpose: string;
  requestDate: Date;
  serviceRequest?: boolean;
  soldPrice?: string | null;
  sourceTransactionId?: string | null;
  items?: RequestAssetItemInput[];
  type: TransactionType;
};

export type ResolveTransactionItemInput = {
  itemId: string;
  note?: string | null;
  soldPrice?: string | null;
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
      projectTag: true,
      position: true,
      signatureDataUrl: true,
      signatureUploadedAt: true,
      stockControllerTag: true,
      signatureUploadedBy: {
        select: { email: true, name: true },
      },
      roles: {
        select: {
          role: { select: { code: true } },
        },
      },
      domainPermissions: {
        where: { domain: { isActive: true } },
        select: {
          canManage: true,
          canView: true,
          domain: { select: { code: true } },
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
  return {
    azureAdObjectId: user.azureAdObjectId,
    email: user.email,
    id: user.id,
    lastLoginAt: user.lastLoginAt,
    name: user.name,
    organizationLevel: user.organizationLevel,
    organizationTag: user.organizationTag,
    permissions: user.domainPermissions.map((permission) => ({
      canManage: permission.canManage,
      canView: permission.canView,
      domainCode: permission.domain.code,
    })),
    position: user.position,
    projectTag: user.projectTag,
    roles: user.roles.map(({ role }) => role.code),
    signatureDataUrl: user.signatureDataUrl,
    signatureUploadedAt: user.signatureUploadedAt,
    signatureUploadedBy: user.signatureUploadedBy,
    stockControllerTag: user.stockControllerTag,
  };
}

function isQuantityAsset(asset: WorkflowAsset) {
  return (
    asset.domain.inventoryFamily === AssetTrackMethod.QUANTITY ||
    asset.assetModel.assetType?.trackMethod === AssetTrackMethod.QUANTITY
  );
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
    assertCanRequestDomain(user, asset.domain.code);

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
  name: string;
  organizationTag: OrganizationTag | null;
  projectTag: ProjectTag | null;
  stockControllerTag: StockControllerTag | null;
  domainPermissions: Array<{ canManage: boolean; domain: { code: string } }>;
};

function managerTagFor(tag: string | null) {
  if (!tag) {
    return null;
  }

  if (tag.startsWith("S1_") || tag.startsWith("N1_") || tag.startsWith("C1_")) {
    return OrganizationTag.SCN_MANAGER;
  }

  if (tag.startsWith("CMS_") || tag.startsWith("SD_")) {
    return OrganizationTag.EN_MANAGER;
  }

  if (tag.startsWith("BSD_")) {
    return OrganizationTag.BSD_MANAGER;
  }

  if (tag.startsWith("DL_")) {
    return OrganizationTag.DL_MANAGER;
  }

  return null;
}

function supervisorTagFor(tag: string | null) {
  if (!tag?.endsWith("_STAFF")) {
    return null;
  }

  const candidate = tag.replace(/_STAFF$/, "_SUPERVISOR") as OrganizationTag;
  return Object.values(OrganizationTag).includes(candidate)
    ? candidate
    : managerTagFor(tag);
}

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

  return tx.user.findFirst({
    orderBy: { name: "asc" },
    select: {
      domainPermissions: {
        select: { canManage: true, domain: { select: { code: true } } },
      },
      id: true,
      name: true,
      organizationTag: true,
      projectTag: true,
      stockControllerTag: true,
    },
    where: {
      id: { not: requesterId },
      isActive: true,
      organizationTag: tag,
    },
  });
}

async function findProjectApprover(
  tx: Prisma.TransactionClient,
  requesterId: string,
  projectId: string | null | undefined,
) {
  const select = {
    domainPermissions: {
      select: { canManage: true, domain: { select: { code: true } } },
    },
    id: true,
    name: true,
    organizationTag: true,
    projectTag: true,
    stockControllerTag: true,
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

    const projectLead = project?.members[0]?.user ?? project?.leadUser ?? null;
    if (projectLead && projectLead.id !== requesterId) {
      return projectLead;
    }
  }

  return tx.user.findFirst({
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
  domainCode: string,
  stockControllerTag: StockControllerTag,
) {
  return tx.user.findMany({
    orderBy: { name: "asc" },
    select: {
      domainPermissions: {
        select: { canManage: true, domain: { select: { code: true } } },
      },
      id: true,
      name: true,
      organizationTag: true,
      projectTag: true,
      stockControllerTag: true,
    },
    where: {
      domainPermissions: {
        some: { canManage: true, domain: { code: domainCode } },
      },
      isActive: true,
      roles: { some: { role: { code: "STOCK_CONTROLLER" } } },
      stockControllerTag,
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

  return users.map((user) => candidateForUser(user, requiredTag, stepSequence));
}

async function buildApprovalCandidates(
  tx: Prisma.TransactionClient,
  user: CurrentUser,
  input: SubmitTransactionInput,
  items: WorkflowRequestItem[],
) {
  const approvals: ApprovalCandidate[] = [];
  let stepSequence = 1;

  const organizationLevel = user.organizationLevel as OrganizationLevel | null;
  const organizationTag = user.organizationTag as OrganizationTag | null;
  const businessTag =
    organizationLevel === OrganizationLevel.STAFF
      ? supervisorTagFor(organizationTag)
      : organizationLevel === OrganizationLevel.SUPERVISOR
        ? managerTagFor(organizationTag)
        : null;

  if (businessTag) {
    approvals.push(
      candidateForUser(
        await findOrganizationApprover(tx, businessTag, user.id),
        businessTag,
        stepSequence++,
      ),
    );
  }

  if (input.projectRequest && user.projectTag === ProjectTag.TEAM_MEMBER) {
    approvals.push(
      candidateForUser(
        await findProjectApprover(tx, user.id, input.projectId),
        ProjectTag.LEAD_PROJECT,
        stepSequence++,
      ),
    );
  }

  const domainCodes = Array.from(new Set(items.map((item) => item.asset.domain.code))).sort();
  const stockStep = stepSequence++;
  for (const domainCode of domainCodes) {
    approvals.push(
      ...candidatesForUsers(
        await findStockControllerApprovers(tx, domainCode, StockControllerTag.STOCK_CONTROLLER),
        domainStockControllerRequiredTag(domainCode),
        stockStep,
      ),
    );
  }

  const headStockStep = stepSequence++;
  for (const domainCode of domainCodes) {
    approvals.push(
      ...candidatesForUsers(
        await findStockControllerApprovers(tx, domainCode, StockControllerTag.HEAD_STOCK_CONTROLLER),
        domainHeadStockControllerRequiredTag(domainCode),
        headStockStep,
      ),
    );
  }

  approvals.push(
    candidateForUser(
      await findOrganizationApprover(tx, OrganizationTag.BSD_STAFF, user.id),
      OrganizationTag.BSD_STAFF,
      stepSequence++,
    ),
  );

  approvals.push(
    candidateForUser(
      await findOrganizationApprover(tx, OrganizationTag.BSD_MANAGER, user.id),
      OrganizationTag.BSD_MANAGER,
      stepSequence++,
    ),
  );

  return approvals;
}

async function replaceTransactionApprovals(
  tx: Prisma.TransactionClient,
  transactionId: string,
  approvals: ApprovalCandidate[],
) {
  await tx.transactionApproval.deleteMany({ where: { transactionId } });

  if (approvals.length === 0) {
    return;
  }

  await tx.transactionApproval.createMany({
    data: approvals.map((approval) => ({
      approverNameSnapshot: approval.approverNameSnapshot,
      approverTagSnapshot: approval.approverTagSnapshot,
      requiredTag: approval.requiredTag,
      stepSequence: approval.stepSequence,
      transactionId,
      userId: approval.userId,
    })),
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

  assertCanResolveTransaction(user, transaction);

  return transaction;
}

function assertCanResolveTransaction(
  user: CurrentUser,
  transaction: Pick<TransactionDetail, "items">,
) {
  for (const item of transaction.items) {
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

function buildResolutionMap(items: ResolveTransactionItemInput[]) {
  const map = new Map<string, ResolveTransactionItemInput>();

  for (const item of items) {
    if (map.has(item.itemId)) {
      throw new WorkflowError("Duplicate transaction item selected.");
    }

    if (!isTransactionItemResolutionStatus(item.toStatus)) {
      throw new WorkflowError(`Cannot resolve item to ${item.toStatus}.`);
    }

    map.set(item.itemId, { ...item, soldPrice: validateSoldResolutionPrice(item) });
  }

  return map;
}

function isQuantityTransactionItem(item: TransactionDetail["items"][number]) {
  return (
    item.asset.domain.inventoryFamily === AssetTrackMethod.QUANTITY ||
    item.asset.assetModel.assetType?.trackMethod === AssetTrackMethod.QUANTITY
  );
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
        soldPrice: toStatus === AssetStatus.SOLD && soldPrice ? new Prisma.Decimal(soldPrice) : null,
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
  const { purpose } = assertTransactionInput(input);
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
        const project = await tx.project.findFirst({
          where: { id: projectId ?? "", status: "ACTIVE" },
          select: { id: true, name: true },
        });

        if (!project) {
          throw new WorkflowError("Project not found or inactive.", 404, "PROJECT_NOT_FOUND");
        }

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
          soldPrice: null,
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
          soldPrice: null,
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
) {
  const transaction = await findTransactionDetail(tx, transactionId);
  const toStatus = getTransactionAssetStatus(transaction.type);

  if (transaction.type === TransactionType.SOLD && transaction.sourceTransactionId) {
    await applyApprovedReturnSaleTransaction(tx, transaction, userId, now);
    return;
  }

  for (const item of transaction.items) {
    const workflowItem = { asset: item.asset as unknown as WorkflowAsset, quantity: item.requestedQuantity };
    if (isQuantityTransactionItem(item)) {
      await updateSubmittedQuantityAsset(tx, workflowItem, transaction.requestedBy.id, toStatus);
    } else {
      await updateSubmittedAsset(tx, workflowItem.asset, transaction.requestedBy.id, toStatus);
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

    if (saleItem.requestedQuantity !== sourceItem.requestedQuantity) {
      throw new WorkflowError(
        "Return sale quantity must match the open source item quantity.",
        409,
        "RETURN_SALE_QUANTITY_MISMATCH",
      );
    }

    await resolveItem(
      tx,
      sourceItem,
      { id: userId } as CurrentUser,
      now,
      AssetStatus.SOLD,
      "Sold after return approval",
      saleItem.soldPrice?.toString() ?? transaction.soldPrice?.toString() ?? null,
    );
  }

  await tx.transactionItem.updateMany({
    where: { transactionId: transaction.id },
    data: {
      resolvedStatus: AssetStatus.SOLD,
      returnedAt: now,
      returnedById: userId,
    },
  });

  await tx.assetStatusHistory.createMany({
    data: transaction.items.map((item) => ({
      actionType: AssetActionType.STATUS_CHANGE,
      assetId: item.assetId,
      changedById: userId,
      fromStatus: item.fromStatus,
      note: "Approved sale from return",
      toStatus: AssetStatus.SOLD,
      transactionId: transaction.id,
    })),
  });

  await refreshTransactionResolutionStatus(tx, sourceTransaction.id, now);

  await tx.transaction.update({
    where: { id: transaction.id },
    data: {
      completedAt: now,
      status: TransactionStatus.COMPLETED,
      workflowStatus: TransactionWorkflowStatus.COMPLETED,
    },
  });
}

export type ApproveTransactionInput = {
  comment?: string | null;
  soldPrice?: string | null;
};

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
          soldPrice: true,
          type: true,
          workflowStatus: true,
          approvals: {
            orderBy: [{ stepSequence: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              requiredTag: true,
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

      if (transaction.workflowStatus !== TransactionWorkflowStatus.PENDING) {
        throw new WorkflowError("Transaction is not pending approval.", 409);
      }

      const pendingApprovals = transaction.approvals.filter(
        (approval) => approval.status === ApprovalStatus.PENDING,
      );
      const currentStep = Math.min(...pendingApprovals.map((approval) => approval.stepSequence));
      const currentApproval = pendingApprovals.find(
        (approval) =>
          approval.stepSequence === currentStep && approvalMatchesUser(user, approval),
      );

      if (!currentApproval) {
        throw new WorkflowError("No approval is waiting for this user.", 403);
      }

      const soldPrice = cleanText(input.soldPrice);
      if (transaction.type === TransactionType.SOLD && currentApproval.requiredTag === OrganizationTag.BSD_STAFF) {
        const effectiveSoldPrice = soldPrice ?? transaction.soldPrice?.toString() ?? null;

        if (!effectiveSoldPrice) {
          throw new WorkflowError("Price is required before BSD Staff approval.", 400, "SOLD_PRICE_REQUIRED");
        }

        if (Number.isNaN(Number(effectiveSoldPrice))) {
          throw new WorkflowError("Price must be a valid number.", 400, "INVALID_SOLD_PRICE");
        }

        await tx.transaction.update({
          where: { id: transactionId },
          data: { soldPrice: new Prisma.Decimal(effectiveSoldPrice) },
        });

        await tx.transactionItem.updateMany({
          where: { transactionId },
          data: { soldPrice: new Prisma.Decimal(effectiveSoldPrice) },
        });
      }

      await tx.transactionApproval.update({
        where: { id: currentApproval.id },
        data: {
          actedAt: now,
          approverNameSnapshot: user.name,
          approverTagSnapshot: currentApproval.requiredTag,
          comment: cleanText(input.comment),
          status: ApprovalStatus.APPROVED,
          userId: user.id,
        },
      });

      const remaining = await tx.transactionApproval.count({
        where: { transactionId, status: ApprovalStatus.PENDING },
      });

      if (remaining === 0) {
        await applyApprovedTransaction(tx, transactionId, user.id, now);
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
  }>,
) {
  const pendingApprovals = approvals.filter(
    (approval) => approval.status === ApprovalStatus.PENDING,
  );

  if (pendingApprovals.length === 0) {
    return null;
  }

  const currentStep = Math.min(
    ...pendingApprovals.map((approval) => approval.stepSequence),
  );

  return pendingApprovals.find(
    (approval) =>
      approval.stepSequence === currentStep && approvalMatchesUser(user, approval),
  ) ?? null;
}

async function releaseRejectedTransactionItems(
  tx: Prisma.TransactionClient,
  transaction: TransactionDetail,
  userId: string,
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
      note: "Rejected request",
      toStatus: AssetStatus.READY,
      transactionId: transaction.id,
    })),
  });
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

      if (transaction.workflowStatus !== TransactionWorkflowStatus.PENDING) {
        throw new WorkflowError("Transaction is not pending approval.", 409);
      }

      const currentApproval = currentPendingApproval(user, transaction.approvals);

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

      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          completedAt: now,
          status: TransactionStatus.COMPLETED,
          workflowStatus: TransactionWorkflowStatus.REJECTED,
        },
      });

      await releaseRejectedTransactionItems(tx, transaction, user.id);

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
  type: TransactionType;
};

export async function updatePendingTransactionRequest(
  user: CurrentUser,
  transactionId: string,
  input: UpdatePendingTransactionRequestInput,
) {
  const purpose = requireText(input.purpose, input.projectRequest ? "Project" : "Customer Name");
  const note = cleanText(input.note);
  const toStatus = getTransactionAssetStatus(input.type);
  const requestedItems = input.items ? normalizeRequestItems(input) : null;

  return db.$transaction(
    async (tx) => {
      const transaction = await findTransactionDetail(tx, transactionId);

      if (transaction.requestedBy.id !== user.id) {
        throw new WorkflowError("Only the requester can edit this request.", 403);
      }

      if (transaction.workflowStatus !== TransactionWorkflowStatus.PENDING) {
        throw new WorkflowError("Only pending requests can be edited.", 409);
      }

      if (transaction.approvals.some((approval) => approval.status === ApprovalStatus.APPROVED)) {
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
        const project = await tx.project.findFirst({
          where: { id: projectId ?? "", status: "ACTIVE" },
          select: { id: true, name: true },
        });

        if (!project) {
          throw new WorkflowError("Project not found or inactive.", 404, "PROJECT_NOT_FOUND");
        }

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
          type: input.type,
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
        await replaceTransactionApprovals(
          tx,
          transactionId,
          await buildApprovalCandidates(tx, requester, { ...approvalInput, requestDate: transaction.requestDate }, workflowItems),
        );

        return findTransactionDetail(tx, transactionId);
      }

      assertHasItems(requestedItems, "Asset items");

      const nextItems = await findRequestItems(tx, requestedItems);
      const previousByAssetId = new Map(
        transaction.items.map((item) => [item.assetId, item]),
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

        assertCanRequestDomain(user, nextItem.asset.domain.code);

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
            soldPrice: null,
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
            soldPrice: null,
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

async function createReturnSaleApprovalTransaction(
  tx: Prisma.TransactionClient,
  actor: CurrentUser,
  sourceTransaction: TransactionDetail,
  saleItems: TransactionDetail["items"],
  note: string | null,
  now: Date,
) {
  const requester = await requireWorkflowUserById(
    tx,
    sourceTransaction.requestedBy.id,
  );
  const workflowItems = saleItems.map((item) => ({
    asset: item.asset as unknown as WorkflowAsset,
    quantity: item.requestedQuantity,
  }));
  const approvalInput: SubmitTransactionInput = {
    internalRequest: false,
    items: workflowItems.map((item) => ({
      assetId: item.asset.id,
      quantity: item.quantity,
    })),
    note,
    projectId: sourceTransaction.projectId,
    projectRequest: sourceTransaction.projectRequest,
    purpose: sourceTransaction.purpose,
    requestDate: now,
    serviceRequest: sourceTransaction.serviceRequest,
    sourceTransactionId: sourceTransaction.id,
    type: TransactionType.SOLD,
  };
  const approvals = await buildApprovalCandidates(
    tx,
    requester,
    approvalInput,
    workflowItems,
  );
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
      transactionNo: await createRequisitionNo(tx, now),
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
      soldPrice: null,
      toStatus: AssetStatus.SOLD,
      transactionId: transaction.id,
    })),
  });

  await replaceTransactionApprovals(tx, transaction.id, approvals);

  await tx.assetStatusHistory.createMany({
    data: saleItems.map((item) => ({
      actionType: AssetActionType.STATUS_CHANGE,
      assetId: item.assetId,
      changedById: actor.id,
      fromStatus: item.toStatus,
      note: [note, `Created sale approval request ${transaction.transactionNo}`]
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

      if (transaction.workflowStatus !== TransactionWorkflowStatus.IN_PROGRESS) {
        throw new WorkflowError(
          "This transaction is still pending approval and cannot be returned.",
          409,
          "TRANSACTION_NOT_APPROVED",
        );
      }

      if (transaction.requestedBy.id !== user.id && !hasRole(user, "ADMIN")) {
        throw new WorkflowError(
          "Only the requester or an admin can return this transaction.",
          403,
          "RETURN_REQUESTER_OR_ADMIN_ONLY",
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

      const saleItems = items.filter((item) => {
        const resolution = resolutionMap.get(item.id);

        return resolution?.toStatus === AssetStatus.SOLD;
      });
      const returnItems = items.filter((item) => {
        const resolution = resolutionMap.get(item.id);

        return resolution?.toStatus !== AssetStatus.SOLD;
      });

      if (saleItems.length > 0) {
        const firstSaleResolution = resolutionMap.get(saleItems[0].id);
        await createReturnSaleApprovalTransaction(
          tx,
          user,
          transaction,
          saleItems,
          cleanText(firstSaleResolution?.note),
          now,
        );
      }

      for (const item of returnItems) {
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
          cleanText(resolution.soldPrice),
        );
      }

      if (returnItems.length > 0) {
        await tx.assetStatusHistory.createMany({
          data: returnItems.map((item) => {
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
      }

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








