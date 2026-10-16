import {
  calculateSaleGrandTotal,
  validateSalePriceGroups,
  type SalePriceGroup,
} from "@/lib/sale-price-groups";
import {
  ApprovalStatus,
  AssetActionType,
  AssetCondition,
  AssetStatus,
  OrganizationTag,
  Prisma,
  ProjectMemberTag,
  TransactionStatus,
  TransactionWorkflowStatus,
  TransactionType,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import {
  approvalMatchesUser,
  ACK_BSD_REQUIRED_TAG,
  ACK_WAREHOUSE_MANAGER_REQUIRED_TAG,
  isWarehouseStockControllerRequiredTag,
} from "@/lib/approval-flow";
import { db } from "@/lib/db";
import {
  AssetTrackMethod,
  getEffectiveAssetTrackMethod,
} from "@/lib/asset-tracking";
import { getTransactionAssetStatus } from "@/lib/workflow-rules";
import {
  WorkflowError,
  cleanText,
  findTransactionDetail,
  isQuantityTransactionItem,
  requireText,
} from "./shared";
import type { TransactionDetail, WorkflowAsset } from "./shared";
import {
  assertReturnFinalGate,
  currentPendingApproval,
} from "./approval-guards";
import {
  applyApprovedOutcomeCycle,
  applyApprovedReturnSaleTransaction,
  applyApprovedReturnTransaction,
  refreshTransactionResolutionStatus,
} from "./return-workflow";
import {
  refreshQuantityRequestStatus,
  releaseHeldAsset,
  updateSubmittedAsset,
  updateSubmittedQuantityAsset,
} from "./stock-movement";
import { findOrganizationApprover } from "./approval-routing";

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
    await applyApprovedOutcomeCycle(
      tx,
      transaction,
      userId,
      now,
      resolutionBatchId,
    );
    await tx.returnBatch.update({
      where: { id: resolutionBatchId },
      data: { state: "COMPLETED" },
    });
    return;
  }

  if (
    transaction.outcomeRecords.some(
      (outcome) =>
        !outcome.approvedAt &&
        (!resolutionBatchId || outcome.resolutionBatchId === resolutionBatchId),
    )
  ) {
    await applyApprovedOutcomeCycle(
      tx,
      transaction,
      userId,
      now,
      resolutionBatchId,
    );
    return;
  }
  const toStatus = getTransactionAssetStatus(transaction.type);

  if (
    transaction.status === TransactionStatus.RETURNED &&
    transaction.sourceTransactionId
  ) {
    await applyApprovedReturnTransaction(tx, transaction, userId, now);
    return;
  }

  if (
    transaction.type === TransactionType.SOLD &&
    transaction.sourceTransactionId
  ) {
    await applyApprovedReturnSaleTransaction(tx, transaction, userId, now);
    return;
  }

  for (const item of transaction.items) {
    if (
      (isQuantityTransactionItem(item) && item.dispatchedAt) ||
      (!isQuantityTransactionItem(item) && item.asset.status === toStatus)
    )
      continue;
    const workflowItem = {
      asset: item.asset as unknown as WorkflowAsset,
      quantity: item.requestedQuantity,
    };
    if (isQuantityTransactionItem(item)) {
      await updateSubmittedQuantityAsset(
        tx,
        workflowItem,
        userId,
        toStatus,
        transactionId,
      );
      if (
        toStatus === AssetStatus.BORROW ||
        toStatus === AssetStatus.USING ||
        toStatus === AssetStatus.SOLD
      ) {
        await tx.transactionItem.update({
          where: { id: item.id },
          data: { dispatchedAt: now, dispatchedById: userId },
        });
      }
    } else {
      await updateSubmittedAsset(
        tx,
        workflowItem.asset,
        transaction.requestedBy.id,
        toStatus,
      );
      await tx.transactionItem.update({
        where: { id: item.id },
        data: { dispatchedAt: now, dispatchedById: userId },
      });
    }
  }

  await tx.assetStatusHistory.createMany({
    data: transaction.items.map((item) => ({
      actionType: AssetActionType.REQUEST_SUBMIT,
      assetId: item.assetId,
      changedById: userId,
      fromStatus: isQuantityTransactionItem(item)
        ? AssetStatus.READY
        : AssetStatus.REQUEST,
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

export type ApproveTransactionInput = {
  comment?: string | null;
  prices?: Record<string, string>;
  totals?: Record<string, string>;
  priceGroups?: Record<string, SalePriceGroup[]>;
  returnConditions?: Record<string, AssetCondition>;
  returnStockAssetIds?: Record<string, string>;
  soldPrice?: string | null;
};

async function createTransactionAcknowledgements(
  tx: Prisma.TransactionClient,
  transactionId: string,
) {
  const transaction = await tx.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    select: {
      requestedById: true,
      items: {
        select: {
          asset: { select: { warehouse: { select: { code: true } } } },
        },
      },
    },
  });
  const recipients = new Map<string, { userId: string; requiredTag: string }>();
  const bsd = await findOrganizationApprover(
    tx,
    OrganizationTag.BSD_STAFF,
    transaction.requestedById,
  );
  if (bsd)
    recipients.set(`${bsd.id}:${ACK_BSD_REQUIRED_TAG}`, {
      userId: bsd.id,
      requiredTag: ACK_BSD_REQUIRED_TAG,
    });
  for (const item of transaction.items) {
    if (!item.asset)
      throw new WorkflowError(
        "Transaction asset is missing.",
        409,
        "TRANSACTION_ASSET_MISSING",
      );
    const managers = await tx.warehouseManagerAssignment.findMany({
      where: { warehouse: { code: item.asset.warehouse.code, isActive: true } },
      select: { userId: true },
    });
    for (const manager of managers) {
      recipients.set(
        `${manager.userId}:${ACK_WAREHOUSE_MANAGER_REQUIRED_TAG}`,
        {
          userId: manager.userId,
          requiredTag: ACK_WAREHOUSE_MANAGER_REQUIRED_TAG,
        },
      );
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
      const source = input.priceGroups?.[item.id] ?? [
        {
          quantity: item.requestedQuantity,
          unitPrice: input.prices?.[item.id] ?? "",
          total: "",
        },
      ];
      if (!draft && source.some((group) => !group.unitPrice.trim())) {
        throw new WorkflowError(
          "BSD must enter a valid Price / unit for every sold item.",
          400,
          "SOLD_PRICE_REQUIRED",
        );
      }
      const groups = validateSalePriceGroups(
        source,
        item.requestedQuantity,
        item.requestedQuantity === 1,
        draft,
      );
      return {
        id: item.id,
        groups,
        total: groups.every((group) => group.unitPrice)
          ? calculateSaleGrandTotal(groups)
          : null,
      };
    });
    return {
      items: calculated,
      grandTotal: calculateSaleGrandTotal(
        calculated.flatMap((item) => item.groups),
      ),
    };
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    throw new WorkflowError(
      (error as Error).message,
      400,
      "SALE_PRICE_GROUPS_INVALID",
    );
  }
}

export async function saveSalePriceDraft(
  user: CurrentUser,
  transactionId: string,
  input: ApproveTransactionInput,
) {
  return db.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: transactionId },
      include: { items: true, approvals: { where: { isCurrent: true } } },
    });
    if (!transaction) throw new WorkflowError("Transaction not found.", 404);
    const approval = currentPendingApproval(user, transaction.approvals);
    if (
      transaction.type !== TransactionType.SOLD ||
      transaction.workflowStatus !== TransactionWorkflowStatus.PENDING ||
      approval?.requiredTag !== OrganizationTag.BSD_STAFF
    ) {
      throw new WorkflowError(
        "Only the assigned BSD Staff can save prices at the sale approval step.",
        403,
      );
    }
    if (transaction.sourceTransactionId) {
      if (!approval.resolutionBatchId)
        throw new WorkflowError("Sale source batch is missing.", 409);
      await assertReturnFinalGate(
        tx,
        transaction.sourceTransactionId,
        approval.resolutionBatchId,
        true,
      );
    }
    const pricing = calculateTransactionSalePricing(
      transaction.items,
      input,
      true,
    );
    for (const item of pricing.items) {
      await tx.transactionItem.update({
        where: { id: item.id },
        data: {
          salePriceGroups: item.groups,
          soldPrice:
            item.groups.length === 1 && item.groups[0].unitPrice
              ? new Prisma.Decimal(item.groups[0].unitPrice)
              : null,
          soldTotal: item.total ? new Prisma.Decimal(item.total) : null,
        },
      });
    }
    await tx.transaction.update({
      where: { id: transactionId },
      data: { soldPrice: new Prisma.Decimal(pricing.grandTotal) },
    });
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
      if (
        pendingApprovals.length === 0 ||
        (transaction.workflowStatus !== TransactionWorkflowStatus.PENDING &&
          !pendingApprovals.some(
            (approval) =>
              approval.requiredTag.startsWith("ACK_") ||
              approval.resolutionBatchId,
          ))
      ) {
        throw new WorkflowError("Transaction is not pending approval.", 409);
      }
      const currentProjectLeadIds = new Set([
        ...(transaction.project?.leadUser
          ? [transaction.project.leadUser.id]
          : []),
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
            (candidate) =>
              candidate.resolutionBatchId === approval.resolutionBatchId &&
              !candidate.requiredTag.startsWith("ACK_"),
          );
          return (
            approval.stepSequence ===
            Math.min(...cyclePending.map((candidate) => candidate.stepSequence))
          );
        });

      if (!currentApproval) {
        throw new WorkflowError("No approval is waiting for this user.", 403);
      }

      if (currentApproval.requiredTag.startsWith("RETURN_CHECK:")) {
        throw new WorkflowError(
          "Confirm the individual outcomes through the return check service.",
          409,
          "RETURN_MANUAL_CHECK_REQUIRED",
        );
      }
      if (
        currentApproval.resolutionBatchId &&
        !transaction.sourceTransactionId
      ) {
        const batch = await tx.returnBatch.findFirst({
          where: { id: currentApproval.resolutionBatchId, transactionId },
        });
        if (
          !batch ||
          ["REJECTED", "CANCELLED", "COMPLETED"].includes(batch.state)
        )
          throw new WorkflowError(
            "This return batch is not pending approval.",
            409,
            "RETURN_BATCH_NOT_ACTIVE",
          );
        if (currentApproval.requiredTag.startsWith("STOREMAN:"))
          await assertReturnFinalGate(tx, transactionId, batch.id);
      }
      if (
        transaction.type === TransactionType.SOLD &&
        transaction.sourceTransactionId
      ) {
        const linked = await tx.transactionItemOutcome.findMany({
          where: { soldTransactionId: transactionId, approvedAt: null },
          select: { resolutionBatchId: true },
        });
        if (!linked.length)
          throw new WorkflowError("No pending sold outcome exists.", 409);
        for (const batchId of new Set(
          linked.map((outcome) => outcome.resolutionBatchId),
        )) {
          if (!batchId)
            throw new WorkflowError(
              "The sale has no return batch.",
              409,
              "RETURN_BATCH_REQUIRED",
            );
          await assertReturnFinalGate(
            tx,
            transaction.sourceTransactionId,
            batchId,
            true,
          );
        }
      }

      if (
        isWarehouseStockControllerRequiredTag(currentApproval.requiredTag) &&
        !currentApproval.resolutionBatchId
      ) {
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
        const itemsById = new Map(
          transaction.items.map((item) => [item.id, item]),
        );
        const quantityReturns = pendingReturns.filter((outcome) => {
          const item = itemsById.get(outcome.transactionItemId);
          return Boolean(
            item?.asset &&
            getEffectiveAssetTrackMethod(item.asset) ===
              AssetTrackMethod.QUANTITY &&
            item.asset.warehouse.code === warehouseCode,
          );
        });
        const returnConditions = input.returnConditions ?? {};
        const returnStockAssetIds = input.returnStockAssetIds ?? {};
        const missingCondition = quantityReturns.some((outcome) => {
          const condition = returnConditions[outcome.id];
          return (
            condition !== AssetCondition.NEW &&
            condition !== AssetCondition.USED
          );
        });
        if (missingCondition) {
          throw new WorkflowError(
            "Select NEW or USED for every quantity-pool item being returned.",
            409,
            "RETURN_CONDITION_REQUIRED",
          );
        }
        const missingStockCode = quantityReturns.some(
          (outcome) => !returnStockAssetIds[outcome.id],
        );
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
                select: {
                  id: true,
                  name: true,
                  brand: true,
                  partNo: true,
                  description: true,
                  isSerialized: true,
                },
              },
            },
          });
          const sourceModel = item?.asset?.assetModel;
          const matchesSourceModel = Boolean(
            selectedAsset &&
            sourceModel &&
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
            data: {
              returnCondition: returnConditions[outcome.id],
              assetId: selectedAsset.id,
            },
          });
        }
      }

      if (
        isWarehouseStockControllerRequiredTag(currentApproval.requiredTag) &&
        !currentApproval.resolutionBatchId &&
        !transaction.sourceTransactionId
      ) {
        const warehouseCode = currentApproval.requiredTag.split(":")[1];
        const undispatchedSerialItems = transaction.items.filter(
          (item) =>
            item.asset &&
            getEffectiveAssetTrackMethod(item.asset) ===
              AssetTrackMethod.SERIAL &&
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

      const isBsdSaleApproval =
        !isAcknowledgement &&
        currentApproval.requiredTag === OrganizationTag.BSD_STAFF &&
        transaction.type === TransactionType.SOLD;
      if (isBsdSaleApproval) {
        const pricing = calculateTransactionSalePricing(
          transaction.items,
          input,
          false,
        );
        for (const item of pricing.items) {
          await tx.transactionItem.update({
            where: { id: item.id },
            data: {
              salePriceGroups: item.groups,
              soldPrice:
                item.groups.length === 1
                  ? new Prisma.Decimal(item.groups[0].unitPrice)
                  : null,
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
          approverSignatureSnapshot: isAcknowledgement
            ? null
            : user.signatureDataUrl,
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
          requiredTag: {
            notIn: [ACK_BSD_REQUIRED_TAG, ACK_WAREHOUSE_MANAGER_REQUIRED_TAG],
          },
        },
      });

      if (!isAcknowledgement && remaining === 0) {
        await applyApprovedTransaction(
          tx,
          transactionId,
          user.id,
          now,
          currentApproval.resolutionBatchId,
        );
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
      await releaseHeldAsset(
        tx,
        workflowItem.asset,
        transaction.requestedBy.id,
      );
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
        throw new WorkflowError(
          "Only the original requester can cancel this request.",
          403,
          "CANCEL_REQUESTER_ONLY",
        );
      }

      if (
        transaction.workflowStatus !== TransactionWorkflowStatus.PENDING &&
        transaction.workflowStatus !== TransactionWorkflowStatus.REJECTED
      ) {
        throw new WorkflowError(
          "Only pending or rejected requests can be cancelled.",
          409,
          "CANCEL_REQUEST_NOT_ALLOWED",
        );
      }

      const approvedCount = transaction.approvals.filter(
        (approval) =>
          approval.status === ApprovalStatus.APPROVED &&
          approval.stepSequence > 1,
      ).length;
      if (
        approvedCount > 0 &&
        transaction.workflowStatus !== TransactionWorkflowStatus.REJECTED
      ) {
        throw new WorkflowError(
          "A request with completed approval cannot be cancelled.",
          409,
          "CANCEL_APPROVAL_ALREADY_COMPLETED",
        );
      }

      if (
        !transaction.sourceTransactionId &&
        transaction.workflowStatus === TransactionWorkflowStatus.PENDING
      ) {
        await releaseRejectedTransactionItems(
          tx,
          transaction,
          user.id,
          "Request cancelled by requester.",
        );
      }

      await tx.transactionApproval.updateMany({
        where: {
          transactionId: transaction.id,
          status: ApprovalStatus.PENDING,
        },
        data: {
          comment: "Cancelled by requester.",
          status: ApprovalStatus.REJECTED,
          actedAt: new Date(),
        },
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

      if (
        transaction.workflowStatus !== TransactionWorkflowStatus.PENDING &&
        !transaction.approvals.some(
          (approval) =>
            approval.resolutionBatchId &&
            approval.status === ApprovalStatus.PENDING,
        )
      ) {
        throw new WorkflowError("Transaction is not pending approval.", 409);
      }

      const currentProjectLeadIds = new Set([
        ...(transaction.project?.leadUser
          ? [transaction.project.leadUser.id]
          : []),
        ...(transaction.project?.members ?? []).map((member) => member.user.id),
      ]);
      const currentApproval = currentPendingApproval(
        user,
        transaction.approvals,
        currentProjectLeadIds,
      );

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

      if (
        currentApproval.resolutionBatchId &&
        !transaction.sourceTransactionId
      ) {
        const batchId = currentApproval.resolutionBatchId;
        const unposted = await tx.transactionItemOutcome.count({
          where: {
            transactionId,
            resolutionBatchId: batchId,
            approvedAt: null,
          },
        });
        if (!unposted)
          throw new WorkflowError(
            "Posted outcomes cannot be rejected.",
            409,
            "RETURN_BATCH_ALREADY_POSTED",
          );
        await tx.returnBatch.update({
          where: { id: batchId },
          data: { state: "REJECTED" },
        });
        await tx.transactionApproval.updateMany({
          where: {
            transactionId,
            resolutionBatchId: batchId,
            status: ApprovalStatus.PENDING,
          },
          data: {
            status: ApprovalStatus.REJECTED,
            comment: reason,
            actedAt: now,
          },
        });
        const soldOutcomes = await tx.transactionItemOutcome.findMany({
          where: {
            transactionId,
            resolutionBatchId: batchId,
            soldTransactionId: { not: null },
          },
          select: { soldTransactionId: true },
        });
        for (const saleId of new Set(
          soldOutcomes
            .map((outcome) => outcome.soldTransactionId)
            .filter((id): id is string => Boolean(id)),
        )) {
          await tx.transaction.update({
            where: { id: saleId },
            data: { workflowStatus: TransactionWorkflowStatus.REJECTED },
          });
          await tx.transactionApproval.updateMany({
            where: { transactionId: saleId, status: ApprovalStatus.PENDING },
            data: {
              status: ApprovalStatus.REJECTED,
              comment: reason,
              actedAt: now,
            },
          });
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
        await recordRejectedDerivedResolutionItems(
          tx,
          transaction,
          user.id,
          reason,
        );
        const linked = await tx.transactionItemOutcome.findMany({
          where: { soldTransactionId: transactionId, approvedAt: null },
          select: { resolutionBatchId: true },
        });
        for (const batchId of new Set(
          linked
            .map((outcome) => outcome.resolutionBatchId)
            .filter((id): id is string => Boolean(id)),
        )) {
          await tx.returnBatch.update({
            where: { id: batchId },
            data: { state: "REJECTED" },
          });
        }
        await refreshTransactionResolutionStatus(
          tx,
          transaction.sourceTransactionId,
          now,
        );
      } else {
        await releaseRejectedTransactionItems(tx, transaction, user.id, reason);
      }

      return findTransactionDetail(tx, transactionId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
