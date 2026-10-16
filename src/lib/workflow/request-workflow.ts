import {
  ApprovalStatus,
  AssetActionType,
  AssetStatus,
  Prisma,
  TransactionWorkflowStatus,
  TransactionType,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCanRequestWarehouse, hasAnyRole } from "@/lib/permissions";
import {
  getInitialTransactionStatus,
  getTransactionAssetStatus,
} from "@/lib/workflow-rules";
import {
  WorkflowError,
  assertHasItems,
  assetDisplayName,
  cleanText,
  createRequisitionNo,
  findAssets,
  findRequestItems,
  findTransactionDetail,
  isQuantityAsset,
  isQuantityTransactionItem,
  normalizeRequestItems,
  requireText,
  requireWorkflowUserById,
  uniqueIds,
} from "./shared";
import type {
  HoldAssetsInput,
  ReleaseAssetsInput,
  RequestAssetItemInput,
  SubmitTransactionInput,
  WorkflowAsset,
} from "./shared";
import {
  assertAssetsCanBeHeld,
  assertAssetsCanRelease,
  assertAssetsCanSubmit,
  assertNoOpenSerialTransactionItems,
  consumeQuantityReservation,
  getAvailableQuantities,
  getSubmittableItems,
  holdAsset,
  refreshQuantityRequestStatus,
  releaseHeldAsset,
  releaseQuantityReservation,
  reserveQuantityAsset,
} from "./stock-movement";
import {
  buildApprovalCandidates,
  recordRequesterConfirmation,
  replaceTransactionApprovals,
} from "./approval-routing";

function assertTransactionInput(input: SubmitTransactionInput) {
  const purpose = requireText(
    input.purpose,
    input.projectRequest ? "Project" : "Customer Name",
  );
  const soldPrice = cleanText(input.soldPrice);

  if (input.type === TransactionType.USING && !input.internalRequest) {
    throw new WorkflowError("Using requests must be Internal.");
  }

  if (input.type !== TransactionType.USING) {
    if (input.internalRequest) {
      throw new WorkflowError(
        "Borrow and sold requests must be Service or Project only.",
      );
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

  if (
    input.type === TransactionType.SOLD &&
    soldPrice &&
    Number.isNaN(Number(soldPrice))
  ) {
    throw new WorkflowError("Price must be a valid number.");
  }

  return { purpose, soldPrice };
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
    throw new WorkflowError(
      "Project not found or inactive.",
      404,
      "PROJECT_NOT_FOUND",
    );
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
            ? [note, `Reserved quantity: ${quantity}`]
                .filter(Boolean)
                .join("\n")
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
      const approvals = await buildApprovalCandidates(
        tx,
        user,
        approvalInput,
        items,
      );
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
          soldPrice:
            input.type === TransactionType.SOLD && soldPrice
              ? new Prisma.Decimal(soldPrice)
              : null,
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
          fromStatus: isQuantityAsset(asset)
            ? AssetStatus.READY
            : AssetStatus.REQUEST,
          note,
          requestedQuantity: quantity,
          soldPrice:
            input.type === TransactionType.SOLD && soldPrice
              ? new Prisma.Decimal(soldPrice)
              : null,
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
          fromStatus: isQuantityAsset(asset)
            ? AssetStatus.READY
            : AssetStatus.REQUEST,
          note: isQuantityAsset(asset)
            ? [note, `Submitted quantity: ${quantity}; pending approval`]
                .filter(Boolean)
                .join("\n")
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
  const purpose = requireText(
    input.purpose,
    input.projectRequest ? "Project" : "Customer Name",
  );
  const note = cleanText(input.note);
  const soldPrice = cleanText(input.soldPrice);
  if (
    input.type === TransactionType.SOLD &&
    soldPrice &&
    Number.isNaN(Number(soldPrice))
  ) {
    throw new WorkflowError("Price must be a valid number.");
  }
  const toStatus = getTransactionAssetStatus(input.type);
  const requestedItems = input.items ? normalizeRequestItems(input) : null;

  return db.$transaction(
    async (tx) => {
      const transaction = await findTransactionDetail(tx, transactionId);

      if (transaction.requestedBy.id !== user.id) {
        throw new WorkflowError(
          "Only the requester can edit this request.",
          403,
        );
      }

      const isRejectedEdit =
        transaction.workflowStatus === TransactionWorkflowStatus.REJECTED;

      if (
        transaction.workflowStatus !== TransactionWorkflowStatus.PENDING &&
        transaction.workflowStatus !== TransactionWorkflowStatus.REJECTED
      ) {
        throw new WorkflowError(
          "Only pending or rejected requests can be edited.",
          409,
        );
      }

      if (
        !isRejectedEdit &&
        transaction.approvals.some(
          (approval) =>
            approval.status === ApprovalStatus.APPROVED &&
            approval.stepSequence > 1,
        )
      ) {
        throw new WorkflowError(
          "This request is locked because approval has already started.",
          409,
        );
      }

      if (input.type === TransactionType.USING && !input.internalRequest) {
        throw new WorkflowError("Using requests must be Internal.");
      }

      if (input.type !== TransactionType.USING) {
        if (input.internalRequest) {
          throw new WorkflowError(
            "Borrow and sold requests must be Service or Project only.",
          );
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
          soldPrice:
            input.type === TransactionType.SOLD && soldPrice
              ? new Prisma.Decimal(soldPrice)
              : null,
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

        const requester = await requireWorkflowUserById(
          tx,
          transaction.requestedBy.id,
        );
        const workflowItems = transaction.items.map((item) => ({
          asset: item.asset as unknown as WorkflowAsset,
          quantity: item.requestedQuantity,
        }));

        if (isRejectedEdit) {
          for (const workflowItem of workflowItems) {
            if (isQuantityAsset(workflowItem.asset)) {
              await refreshQuantityRequestStatus(
                tx,
                workflowItem.asset.id,
                requester.id,
              );
            } else {
              await holdAsset(tx, workflowItem.asset, user, new Date());
            }
          }
        }

        await replaceTransactionApprovals(
          tx,
          transactionId,
          await buildApprovalCandidates(
            tx,
            requester,
            { ...approvalInput, requestDate: transaction.requestDate },
            workflowItems,
          ),
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
            (availableQuantities.get(nextItem.asset.id) ?? 0) +
            previousQuantity;

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
          await releaseHeldAsset(
            tx,
            workflowItem.asset,
            transaction.requestedBy.id,
          );
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
            soldPrice:
              input.type === TransactionType.SOLD && soldPrice
                ? new Prisma.Decimal(soldPrice)
                : null,
            toStatus,
          },
        });
      }

      if (addedItems.length > 0) {
        await tx.transactionItem.createMany({
          data: addedItems.map(({ asset, quantity }) => ({
            assetId: asset.id,
            fromStatus: isQuantityAsset(asset)
              ? AssetStatus.READY
              : AssetStatus.REQUEST,
            note,
            requestedQuantity: quantity,
            soldPrice:
              input.type === TransactionType.SOLD && soldPrice
                ? new Prisma.Decimal(soldPrice)
                : null,
            toStatus,
            transactionId,
          })),
        });
      }

      for (const assetId of quantityAssetIdsToRefresh) {
        await refreshQuantityRequestStatus(tx, assetId, user.id);
      }

      const requester = await requireWorkflowUserById(
        tx,
        transaction.requestedBy.id,
      );
      await replaceTransactionApprovals(
        tx,
        transactionId,
        await buildApprovalCandidates(
          tx,
          requester,
          { ...approvalInput, requestDate: transaction.requestDate },
          nextItems,
        ),
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
          approvals: {
            none: {
              isCurrent: true,
              status: ApprovalStatus.APPROVED,
              stepSequence: { gt: 1 },
            },
          },
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
    if (!item.assetId)
      throw new WorkflowError(
        "Assign a valid asset before editing this request.",
        409,
        "TRANSACTION_ASSET_MISSING",
      );
    nextItems.set(item.assetId, {
      assetId: item.assetId,
      quantity: item.requestedQuantity,
    });
  }

  for (const item of requestItems) {
    const existing = nextItems.get(item.assetId);
    nextItems.set(item.assetId, {
      assetId: item.assetId,
      quantity: existing
        ? (existing.quantity ?? 1) + item.quantity
        : item.quantity,
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
            ? [note, `Released quantity: ${quantity}`]
                .filter(Boolean)
                .join("\n")
            : note,
          toStatus: AssetStatus.READY,
        })),
      });

      return findAssets(tx, assetIds);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
