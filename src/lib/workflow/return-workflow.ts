import { appendUsedReturnRemarks } from "@/lib/used-return-remark";
import {
  ApprovalStatus,
  AssetActionType,
  AssetCondition,
  AssetStatus,
  Prisma,
  TransactionStatus,
  TransactionWorkflowStatus,
  TransactionType,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import {
  ACK_BSD_REQUIRED_TAG,
  ACK_WAREHOUSE_MANAGER_REQUIRED_TAG,
} from "@/lib/approval-flow";
import { db } from "@/lib/db";
import {
  AssetTrackMethod,
  getEffectiveAssetTrackMethod,
} from "@/lib/asset-tracking";
import { assertCanViewWarehouse } from "@/lib/permissions";
import {
  isTransactionItemResolutionStatus,
  isReturnableTransaction,
} from "@/lib/workflow-rules";
import { randomUUID } from "node:crypto";
import {
  WorkflowError,
  assertHasIds,
  cleanText,
  findTransactionDetail,
  isQuantityTransactionItem,
  requireOperationalTransaction,
  requireWorkflowUserById,
  transactionDetailSelect,
  transactionItemAssetName,
  uniqueIds,
  toWorkflowAsset,
} from "./shared";
import type {
  DeleteReturnOutcomeInput,
  ResolveTransactionInput,
  ResolveTransactionItemInput,
  ReturnTransactionInput,
  TransactionDetail,
} from "./shared";
import {
  assertReturnBatchEditable,
  assertReturnFinalGate,
} from "./approval-guards";
import { applyQuantityReturnStock, resolveItem } from "./stock-movement";
import {
  buildReturnApprovalCandidates,
  recordRequesterConfirmation,
  replaceTransactionApprovals,
} from "./approval-routing";

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
    throw new WorkflowError(
      "One or more transaction items were not found.",
      404,
    );
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
        throw new WorkflowError(
          `Cannot resolve item to ${allocation.toStatus}.`,
        );
      }
      if (!Number.isInteger(allocation.quantity) || allocation.quantity <= 0) {
        throw new WorkflowError(
          "Resolution quantity must be a positive whole number.",
        );
      }
      validateSoldAllocationPrice(allocation);
    }

    if (
      item.quantity !== null &&
      item.quantity !== undefined &&
      (!Number.isInteger(item.quantity) || item.quantity <= 0)
    ) {
      throw new WorkflowError(
        "Resolution quantity must be a positive whole number.",
      );
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

export async function refreshTransactionResolutionStatus(
  tx: Prisma.TransactionClient,
  transactionId: string,
  now: Date,
) {
  const openItems = await tx.transactionItem.count({
    where: { returnedAt: null, transactionId },
  });
  const activeBatches = await tx.returnBatch.findMany({
    where: { transactionId, state: { notIn: ["REJECTED", "CANCELLED"] } },
    select: { id: true },
  });

  const [pendingOutcomes, pendingApprovals, pendingSales] = await Promise.all([
    tx.transactionItemOutcome.count({
      where: {
        transactionId,
        approvedAt: null,
        OR: [
          { resolutionBatchId: null },
          { resolutionBatchId: { in: activeBatches.map((batch) => batch.id) } },
        ],
      },
    }),
    tx.transactionApproval.count({
      where: {
        transactionId,
        isCurrent: true,
        status: ApprovalStatus.PENDING,
        requiredTag: {
          notIn: [ACK_BSD_REQUIRED_TAG, ACK_WAREHOUSE_MANAGER_REQUIRED_TAG],
        },
      },
    }),
    tx.transaction.count({
      where: {
        sourceTransactionId: transactionId,
        type: TransactionType.SOLD,
        workflowStatus: TransactionWorkflowStatus.PENDING,
      },
    }),
  ]);

  if (pendingOutcomes > 0 || pendingApprovals > 0 || pendingSales > 0) {
    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        completedAt: null,
        returnedAt: null,
        workflowStatus: TransactionWorkflowStatus.IN_PROGRESS,
      },
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
    data: {
      completedAt: null,
      returnedAt: null,
      workflowStatus: TransactionWorkflowStatus.IN_PROGRESS,
    },
  });
}

export async function applyApprovedReturnSaleTransaction(
  tx: Prisma.TransactionClient,
  transaction: TransactionDetail,
  userId: string,
  now: Date,
) {
  if (!transaction.sourceTransactionId) {
    throw new WorkflowError(
      "Source transaction is required for return sale.",
      409,
    );
  }

  const sourceTransaction = await findTransactionDetail(
    tx,
    transaction.sourceTransactionId,
  );
  const linkedBatches = await tx.transactionItemOutcome.findMany({
    where: { soldTransactionId: transaction.id, approvedAt: null },
    select: { resolutionBatchId: true },
  });
  for (const batchId of new Set(
    linkedBatches.map((outcome) => outcome.resolutionBatchId),
  )) {
    if (!batchId)
      throw new WorkflowError(
        "The sale is not linked to a verified return batch.",
        409,
        "RETURN_BATCH_REQUIRED",
      );
    await assertReturnFinalGate(tx, sourceTransaction.id, batchId, true);
  }
  if (
    !transaction.items.every(
      (item) =>
        item.soldPrice !== null ||
        (Array.isArray(item.salePriceGroups) &&
          item.salePriceGroups.length > 0),
    )
  ) {
    throw new WorkflowError(
      "BSD must price every sold item before posting.",
      409,
      "SOLD_PRICE_REQUIRED",
    );
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
    if (
      !linkedOutcomes.length ||
      saleItem.requestedQuantity !==
        linkedOutcomes.reduce((sum, outcome) => sum + outcome.quantity, 0)
    ) {
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
        saleItem.soldPrice?.toString() ??
          transaction.soldPrice?.toString() ??
          null,
        saleItem.requestedQuantity,
      );
    }
    await tx.transactionItemOutcome.updateMany({
      where: {
        soldTransactionId: transaction.id,
        transactionItemId: sourceItem.id,
        approvedAt: null,
      },
      data: { soldPrice: saleItem.soldPrice, soldTotal: saleItem.soldTotal },
    });
  }

  await tx.transactionItemOutcome.updateMany({
    where: {
      soldTransactionId: transaction.id,
      transactionId: sourceTransaction.id,
      outcomeStatus: AssetStatus.SOLD,
      approvedAt: null,
    },
    data: {
      approvedAt: now,
      approvedById: userId,
      soldTransactionId: transaction.id,
    },
  });

  for (const saleItem of transaction.items) {
    const sourceItem = sourceItemsByAsset.get(saleItem.assetId);
    if (!sourceItem) continue;
    const approvedQuantity = await tx.transactionItemOutcome.aggregate({
      _sum: { quantity: true },
      where: { transactionItemId: sourceItem.id, approvedAt: { not: null } },
    });
    const fullyResolved =
      (approvedQuantity._sum.quantity ?? 0) >= sourceItem.requestedQuantity;
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
      previousQuantity: isQuantityTransactionItem(item)
        ? item.asset.assetQuantity
        : null,
      newQuantity: isQuantityTransactionItem(item)
        ? item.asset.assetQuantity
        : null,
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

export async function applyApprovedReturnTransaction(
  tx: Prisma.TransactionClient,
  transaction: TransactionDetail,
  userId: string,
  now: Date,
) {
  if (!transaction.sourceTransactionId) {
    throw new WorkflowError(
      "Source transaction is required for return approval.",
      409,
    );
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
        data: {
          requestedQuantity: { decrement: returnItem.requestedQuantity },
        },
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
      actionType:
        item.toStatus === AssetStatus.READY
          ? AssetActionType.RETURN
          : AssetActionType.STATUS_CHANGE,
      assetId: item.assetId,
      changedById: userId,
      fromStatus: item.fromStatus,
      previousQuantity: isQuantityTransactionItem(item)
        ? item.asset.assetQuantity
        : null,
      newQuantity: isQuantityTransactionItem(item)
        ? item.asset.assetQuantity
        : null,
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

async function createReturnApprovalTransaction(
  tx: Prisma.TransactionClient,
  actor: CurrentUser,
  sourceTransaction: TransactionDetail,
  returnItems: Array<
    TransactionDetail["items"][number] & { returnCondition?: AssetCondition }
  >,
  note: string | null,
  now: Date,
  resolutionBatchId: string,
) {
  const workflowItems = returnItems.map((item) => ({
    asset: toWorkflowAsset(item.asset),
    quantity: item.requestedQuantity,
  }));
  const approvals = await buildReturnApprovalCandidates(
    tx,
    sourceTransaction,
    workflowItems,
  );
  await tx.transactionItemOutcome.createMany({
    data: returnItems.map((item) => ({
      transactionId: sourceTransaction.id,
      transactionItemId: item.id,
      outcomeStatus: item.toStatus,
      returnCondition:
        item.toStatus === AssetStatus.READY && isQuantityTransactionItem(item)
          ? (item.returnCondition ?? AssetCondition.NEW)
          : null,
      resolutionBatchId,
      quantity: item.requestedQuantity,
      note: item.resolutionNote,
      soldPrice:
        item.toStatus === AssetStatus.SOLD && item.soldPrice
          ? new Prisma.Decimal(item.soldPrice)
          : null,
    })),
  });

  await tx.assetStatusHistory.createMany({
    data: returnItems.map((item) => ({
      actionType: AssetActionType.STATUS_CHANGE,
      assetId: item.assetId,
      changedById: actor.id,
      fromStatus: item.toStatus,
      toStatus: item.toStatus,
      note: [
        note,
        `Return approval pending: ${item.toStatus} (${item.requestedQuantity})`,
      ]
        .filter(Boolean)
        .join("\n"),
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

  await recordRequesterConfirmation(
    tx,
    sourceTransaction.id,
    actor,
    now,
    resolutionBatchId,
  );

  await tx.transaction.update({
    where: { id: sourceTransaction.id },
    data: {
      completedAt: null,
      returnedAt: null,
      workflowStatus: TransactionWorkflowStatus.IN_PROGRESS,
    },
  });

  return sourceTransaction;
}

export async function applyApprovedOutcomeCycle(
  tx: Prisma.TransactionClient,
  transaction: TransactionDetail,
  userId: string,
  now: Date,
  resolutionBatchId?: string | null,
) {
  const outcomesByItem = new Map<string, typeof transaction.outcomeRecords>();
  for (const outcome of transaction.outcomeRecords.filter(
    (record) =>
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
    for (const outcome of outcomes.filter(
      (candidate) => !candidate.approvedAt,
    )) {
      const asset = item.asset;
      if (!asset || !item.assetId)
        throw new WorkflowError(
          "The issued item has no source asset.",
          409,
          "RETURN_ASSET_MISSING",
        );
      const isQuantityPool =
        getEffectiveAssetTrackMethod(asset) === AssetTrackMethod.QUANTITY;
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
          const target = await tx.asset.findUniqueOrThrow({
            where: { id: stock.assetId },
            select: { note: true },
          });
          await tx.asset.update({
            where: { id: stock.assetId },
            data: {
              note: appendUsedReturnRemarks(target.note, [
                {
                  id: outcome.id,
                  quantity: outcome.quantity,
                  requestNo:
                    transaction.transactionNo ?? transaction.documentRef,
                },
              ]),
              updatedById: userId,
            },
          });
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
      } else if (
        isQuantityPool &&
        (outcome.outcomeStatus === AssetStatus.FAIL ||
          outcome.outcomeStatus === AssetStatus.LOST)
      ) {
        const currentAsset = await tx.asset.findUnique({
          where: { id: asset.id },
          select: { note: true },
        });
        if (!currentAsset)
          throw new WorkflowError(
            "Source stock row disappeared.",
            409,
            "RETURN_ASSET_MISSING",
          );
        const marker = `[return-outcome:${outcome.id}]`;
        if (!currentAsset.note?.includes(marker)) {
          await tx.asset.update({
            where: { id: asset.id },
            data: {
              note: [
                currentAsset.note,
                `${marker} ${outcome.outcomeStatus} ${outcome.quantity} from ${transaction.transactionNo ?? transaction.id}; return batch ${outcome.resolutionBatchId}`,
              ]
                .filter(Boolean)
                .join("\n"),
              updatedById: userId,
            },
          });
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
            actionType:
              outcome.outcomeStatus === AssetStatus.READY
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
    const fullyResolved =
      (approvedQuantity._sum.quantity ?? 0) >= item.requestedQuantity;
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
    combined.set(item.id, {
      ...item,
      requestedQuantity:
        (previous?.requestedQuantity ?? 0) + item.requestedQuantity,
    });
  }
  saleItems = Array.from(combined.values());
  const workflowItems = saleItems.map((item) => ({
    asset: toWorkflowAsset(item.asset),
    quantity: item.requestedQuantity,
  }));
  const approvals = await buildReturnApprovalCandidates(
    tx,
    sourceTransaction,
    workflowItems,
    true,
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
    where: {
      transactionId: sourceTransaction.id,
      resolutionBatchId,
      outcomeStatus: AssetStatus.SOLD,
      approvedAt: null,
    },
    data: { soldTransactionId: transaction.id },
  });

  await replaceTransactionApprovals(
    tx,
    transaction.id,
    approvals,
    resolutionBatchId,
  );

  await tx.assetStatusHistory.createMany({
    data: saleItems.map((item) => ({
      actionType: AssetActionType.STATUS_CHANGE,
      assetId: item.assetId,
      changedById: actor.id,
      fromStatus: item.toStatus,
      note: [
        note,
        `Created sold-from-return approval from ${sourceTransaction.transactionNo ?? sourceTransaction.documentRef ?? sourceTransaction.id}`,
      ]
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
      const grouped = new Map<
        AssetStatus,
        Array<
          TransactionDetail["items"][number] & {
            returnCondition?: AssetCondition;
          }
        >
      >();
      const resolutionBatchId = input.resolutionBatchId ?? randomUUID();
      const existingBatch = input.resolutionBatchId
        ? await tx.returnBatch.findFirst({
            where: { id: resolutionBatchId, transactionId: transaction.id },
          })
        : null;
      if (input.resolutionBatchId && !existingBatch)
        throw new WorkflowError("Return batch not found.", 404);
      if (existingBatch) {
        await assertReturnBatchEditable(tx, transaction.id, existingBatch.id);
        const posted = await tx.transactionItemOutcome.count({
          where: { resolutionBatchId, approvedAt: { not: null } },
        });
        if (posted && existingBatch.state !== "REJECTED")
          throw new WorkflowError(
            "Posted return batches cannot be revised.",
            409,
            "RETURN_BATCH_ALREADY_POSTED",
          );
      }
      const activeBatches = await tx.returnBatch.findMany({
        where: {
          transactionId: transaction.id,
          state: { notIn: ["REJECTED", "CANCELLED"] },
        },
        select: { id: true },
      });
      const activeBatchIds = new Set(activeBatches.map((batch) => batch.id));
      const approvedQuantities = new Map<string, number>();
      for (const outcome of transaction.outcomeRecords) {
        if (
          outcome.approvedAt ||
          (outcome.resolutionBatchId !== existingBatch?.id &&
            (!outcome.resolutionBatchId ||
              activeBatchIds.has(outcome.resolutionBatchId)))
        ) {
          approvedQuantities.set(
            outcome.transactionItemId,
            (approvedQuantities.get(outcome.transactionItemId) ?? 0) +
              outcome.quantity,
          );
        }
      }
      for (const item of items) {
        const resolution = resolutionMap.get(item.id);
        const remainingQuantity = Math.max(
          0,
          item.requestedQuantity - (approvedQuantities.get(item.id) ?? 0),
        );
        const allocations = resolution?.allocations?.length
          ? resolution.allocations
          : [
              {
                quantity: resolution?.quantity ?? remainingQuantity,
                toStatus: resolution?.toStatus ?? AssetStatus.READY,
                returnCondition: resolution?.returnCondition,
                note: resolution?.note,
                soldPrice: resolution?.soldPrice,
              },
            ];
        const totalQuantity = allocations.reduce(
          (sum, allocation) => sum + allocation.quantity,
          0,
        );
        if (totalQuantity <= 0 || totalQuantity > remainingQuantity) {
          throw new WorkflowError(
            `Resolution quantity for ${transactionItemAssetName(item)} cannot exceed the requested quantity.`,
          );
        }
        for (const allocation of allocations) {
          if (
            !isQuantityTransactionItem(item) &&
            (allocation.quantity !== 1 ||
              allocations.length !== 1 ||
              allocation.returnCondition === AssetCondition.USED)
          )
            throw new WorkflowError(
              "Serialized returns must use quantity 1 and cannot be USED.",
              400,
              "INVALID_SERIAL_RETURN",
            );
          if (
            allocation.returnCondition &&
            allocation.toStatus !== AssetStatus.READY
          )
            throw new WorkflowError(
              "Return condition is only valid for RETURN or USED outcomes.",
            );
          const group = grouped.get(allocation.toStatus) ?? [];
          group.push({
            ...item,
            requestedQuantity: allocation.quantity,
            toStatus: allocation.toStatus,
            returnCondition: allocation.returnCondition,
            resolutionNote: cleanText(allocation.note),
            soldPrice: allocation.soldPrice
              ? new Prisma.Decimal(allocation.soldPrice)
              : null,
          });
          grouped.set(allocation.toStatus, group);
        }
      }

      const soldItems = grouped.get(AssetStatus.SOLD) ?? [];
      const returnItems = Array.from(grouped.entries()).flatMap(
        ([, items]) => items,
      );
      if (existingBatch) {
        if (existingBatch.damagePdf || existingBatch.signedPdf) {
          await tx.returnBatchEvidence.createMany({
            data: [
              {
                batchId: existingBatch.id,
                revision: existingBatch.revision,
                damagePdf: existingBatch.damagePdf,
                signedPdf: existingBatch.signedPdf,
                signedFilename: existingBatch.signedFilename,
                signedById: existingBatch.signedById,
                signedAt: existingBatch.signedAt,
              },
            ],
            skipDuplicates: true,
          });
        }
        await tx.transactionApproval.updateMany({
          where: {
            transactionId: transaction.id,
            resolutionBatchId,
            isCurrent: true,
          },
          data: { isCurrent: false },
        });
        const sales = await tx.transactionItemOutcome.findMany({
          where: {
            resolutionBatchId,
            soldTransactionId: { not: null },
            approvedAt: null,
          },
          select: { soldTransactionId: true },
        });
        for (const id of new Set(
          sales
            .map((outcome) => outcome.soldTransactionId)
            .filter((id): id is string => Boolean(id)),
        )) {
          await tx.transaction.update({
            where: { id },
            data: { workflowStatus: TransactionWorkflowStatus.CANCELLED },
          });
          await tx.transactionApproval.updateMany({
            where: { transactionId: id, isCurrent: true },
            data: { isCurrent: false },
          });
        }
        await tx.transactionItemOutcome.deleteMany({
          where: { resolutionBatchId, approvedAt: null },
        });
        await tx.returnBatch.update({
          where: { id: resolutionBatchId },
          data: {
            revision: { increment: 1 },
            state: "SUBMITTED",
            damagePdf: null,
            signedPdf: null,
            signedFilename: null,
            signedById: null,
            signedAt: null,
          },
        });
      } else {
        await tx.returnBatch.create({
          data: {
            id: resolutionBatchId,
            transactionId: transaction.id,
            requestNo: `FROM ${transaction.transactionNo}`,
          },
        });
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
        throw new WorkflowError(
          "Return outcome not found.",
          404,
          "RETURN_OUTCOME_NOT_FOUND",
        );
      }

      if (outcome.transaction?.requestedById !== user.id) {
        throw new WorkflowError(
          "Only the original requester can remove a pending return outcome.",
          403,
          "RETURN_OUTCOME_DELETE_FORBIDDEN",
        );
      }

      if (outcome.approvedAt) {
        throw new WorkflowError(
          "Approved return outcomes cannot be removed.",
          409,
          "RETURN_OUTCOME_ALREADY_APPROVED",
        );
      }
      if (!outcome.resolutionBatchId)
        throw new WorkflowError(
          "Legacy outcomes must be assigned to a return batch before editing.",
          409,
          "RETURN_BATCH_REQUIRED",
        );
      await assertReturnBatchEditable(
        tx,
        input.transactionId,
        outcome.resolutionBatchId,
      );

      if (
        outcome.soldTransactionId &&
        outcome.soldTransaction &&
        (outcome.soldTransaction.workflowStatus ===
          TransactionWorkflowStatus.PENDING ||
          outcome.soldTransaction.workflowStatus ===
            TransactionWorkflowStatus.REJECTED)
      ) {
        const remainingSoldQuantity = await tx.transactionItemOutcome.aggregate(
          {
            where: {
              soldTransactionId: outcome.soldTransactionId,
              transactionItemId: outcome.transactionItemId,
              approvedAt: null,
              id: { not: outcome.id },
            },
            _sum: { quantity: true },
          },
        );
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
            await tx.transactionItem.update({
              where: { id: saleItem.id },
              data: { requestedQuantity: quantity },
            });
          } else {
            await tx.transactionItem.delete({ where: { id: saleItem.id } });
          }
        }

        const remainingSaleItems = await tx.transactionItem.count({
          where: { transactionId: outcome.soldTransactionId },
        });
        if (remainingSaleItems === 0) {
          await tx.transaction.update({
            where: { id: outcome.soldTransactionId },
            data: { workflowStatus: TransactionWorkflowStatus.CANCELLED },
          });
          await tx.transactionApproval.updateMany({
            where: {
              transactionId: outcome.soldTransactionId,
              isCurrent: true,
            },
            data: { isCurrent: false },
          });
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
            ...(outcome.resolutionBatchId
              ? { resolutionBatchId: outcome.resolutionBatchId }
              : {}),
            status: ApprovalStatus.PENDING,
            isCurrent: true,
          },
          data: { isCurrent: false },
        });
        await tx.returnBatch.update({
          where: { id: outcome.resolutionBatchId },
          data: { state: "CANCELLED" },
        });
      } else {
        const remaining = await tx.transactionItemOutcome.findMany({
          where: {
            transactionId: input.transactionId,
            resolutionBatchId: outcome.resolutionBatchId,
            approvedAt: null,
          },
          select: {
            transactionItem: {
              select: {
                asset: { select: { warehouse: { select: { code: true } } } },
              },
            },
          },
        });
        if (remaining.some((row) => !row.transactionItem.asset)) {
          throw new WorkflowError(
            "A remaining return item has no source warehouse.",
            409,
            "TRANSACTION_ASSET_MISSING",
          );
        }
        const activeTags = [
          ...new Set(
            remaining.flatMap((row) => {
              const code = row.transactionItem.asset!.warehouse.code;
              return [`RETURN_CHECK:${code}`, `STOREMAN:${code}`];
            }),
          ),
        ];
        await tx.transactionApproval.updateMany({
          where: {
            transactionId: input.transactionId,
            resolutionBatchId: outcome.resolutionBatchId,
            isCurrent: true,
            AND: [
              {
                OR: [
                  { requiredTag: { startsWith: "RETURN_CHECK:" } },
                  { requiredTag: { startsWith: "STOREMAN:" } },
                ],
              },
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

export async function cancelReturnBatch(
  user: CurrentUser,
  transactionId: string,
  batchId: string,
) {
  return db.$transaction(
    async (tx) => {
      const transaction = await findTransactionDetail(tx, transactionId);
      if (transaction.requestedBy.id !== user.id)
        throw new WorkflowError(
          "Only the original requester can cancel a return batch.",
          403,
          "RETURN_REQUESTER_ONLY",
        );
      await assertReturnBatchEditable(tx, transactionId, batchId);
      if (
        await tx.transactionItemOutcome.count({
          where: {
            transactionId,
            resolutionBatchId: batchId,
            approvedAt: { not: null },
          },
        })
      )
        throw new WorkflowError(
          "Posted return outcomes cannot be cancelled.",
          409,
          "RETURN_BATCH_ALREADY_POSTED",
        );
      await tx.returnBatch.update({
        where: { id: batchId },
        data: { state: "CANCELLED" },
      });
      await tx.transactionApproval.updateMany({
        where: { transactionId, resolutionBatchId: batchId, isCurrent: true },
        data: { isCurrent: false },
      });
      const outcomes = await tx.transactionItemOutcome.findMany({
        where: {
          transactionId,
          resolutionBatchId: batchId,
          soldTransactionId: { not: null },
        },
        select: { soldTransactionId: true },
      });
      for (const saleId of new Set(
        outcomes
          .map((outcome) => outcome.soldTransactionId)
          .filter((id): id is string => Boolean(id)),
      )) {
        await tx.transaction.update({
          where: { id: saleId },
          data: { workflowStatus: TransactionWorkflowStatus.CANCELLED },
        });
        await tx.transactionApproval.updateMany({
          where: { transactionId: saleId, isCurrent: true },
          data: { isCurrent: false },
        });
      }
      await refreshTransactionResolutionStatus(tx, transactionId, new Date());
      return findTransactionDetail(tx, transactionId);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function migrateLegacyReturnBatch(
  transactionId: string,
  batchId: string,
  expectedOutcomeIds: string[],
  returnConditions: Record<string, AssetCondition> = {},
) {
  return db.$transaction(
    async (tx) => {
      const transaction = await findTransactionDetail(tx, transactionId);
      if (
        !isReturnableTransaction(transaction.type) ||
        transaction.sourceTransactionId
      )
        throw new WorkflowError(
          "Legacy migration requires an issued source request.",
          409,
          "LEGACY_BATCH_INVALID",
        );
      const outcomes = await tx.transactionItemOutcome.findMany({
        where: { transactionId, resolutionBatchId: batchId },
      });
      const expected = uniqueIds(expectedOutcomeIds);
      if (
        !expected.length ||
        outcomes.length !== expected.length ||
        outcomes.some(
          (outcome) =>
            !expected.includes(outcome.id) ||
            outcome.approvedAt ||
            outcome.outcomeStatus === AssetStatus.SOLD ||
            outcome.soldTransactionId,
        )
      )
        throw new WorkflowError(
          "Legacy outcome IDs must exactly match an entirely unposted non-SOLD batch.",
          409,
          "LEGACY_BATCH_MISMATCH",
        );
      const existing = await tx.returnBatch.findFirst({
        where: { id: batchId, transactionId },
      });
      if (existing) return existing;
      const acted = await tx.transactionApproval.count({
        where: {
          transactionId,
          resolutionBatchId: batchId,
          isCurrent: true,
          status: ApprovalStatus.APPROVED,
          stepSequence: { gt: 1 },
        },
      });
      if (acted)
        throw new WorkflowError(
          "This migration cannot replace an already approved legacy phase.",
          409,
          "LEGACY_APPROVAL_ALREADY_ACTED",
        );
      for (const outcome of outcomes) {
        const item = transaction.items.find(
          (item) => item.id === outcome.transactionItemId,
        );
        if (!item || outcome.quantity <= 0)
          throw new WorkflowError(
            "Legacy outcome has no valid issued item.",
            409,
            "LEGACY_BATCH_INVALID",
          );
        const condition =
          outcome.returnCondition ?? returnConditions[outcome.id];
        if (
          outcome.outcomeStatus === AssetStatus.READY &&
          isQuantityTransactionItem(item)
        ) {
          if (
            !condition ||
            (condition !== AssetCondition.NEW &&
              condition !== AssetCondition.USED)
          )
            throw new WorkflowError(
              "An explicit return condition is required for each legacy quantity return.",
              409,
              "LEGACY_CONDITION_REQUIRED",
            );
          if (condition === AssetCondition.NEW && !item.asset.stockCode)
            throw new WorkflowError(
              "The original stock code is missing.",
              409,
              "RETURN_STOCK_CODE_REQUIRED",
            );
          await tx.transactionItemOutcome.update({
            where: { id: outcome.id },
            data: {
              returnCondition: condition,
              ...(condition === AssetCondition.NEW
                ? { assetId: item.assetId }
                : {}),
            },
          });
        }
      }
      const itemIds = new Set(
        outcomes.map((outcome) => outcome.transactionItemId),
      );
      const items = transaction.items.filter((item) => itemIds.has(item.id));
      const requester = await requireWorkflowUserById(
        tx,
        transaction.requestedBy.id,
      );
      const approvals = await buildReturnApprovalCandidates(
        tx,
        transaction,
        items.map((item) => ({
          asset: toWorkflowAsset(item.asset),
          quantity: item.requestedQuantity,
        })),
      );
      const batch = await tx.returnBatch.create({
        data: {
          id: batchId,
          transactionId,
          requestNo: `FROM ${transaction.transactionNo}`,
        },
      });
      await replaceTransactionApprovals(
        tx,
        transactionId,
        approvals,
        batchId,
        requester,
      );
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          workflowStatus: TransactionWorkflowStatus.IN_PROGRESS,
          completedAt: null,
          returnedAt: null,
        },
      });
      return batch;
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
