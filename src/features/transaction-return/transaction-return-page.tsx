import { ApprovalStatus, AssetStatus, TransactionWorkflowStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isQuantityTrackedAsset } from "@/lib/asset-tracking";
import {
  getTransactionResolutionForUser,
  WorkflowError,
} from "@/lib/workflow";
import {
  TransactionReturnClient,
  type TransactionOutcomeSummary,
  type TransactionReturnRecord,
} from "@/features/transaction-return/transaction-return-client";
import { approvalMatchesUser, approvalMatchesWarehouse } from "@/lib/approval-flow";
import { hasRole } from "@/lib/permissions";
import { getReturnBatchReviews } from "@/lib/return-batch-service";
import { readStoredSalePriceGroups } from "@/lib/sale-price-groups-schema";
import { ReturnBatchReview, type ReturnBatchReviewBatch } from "@/features/transaction-return/return-batch-review";
import { isReturnableTransaction } from "@/lib/workflow-rules";
import { canConfirmIssueSerial } from "./serial-confirmation";

type ReturnStockOption = {
  id: string;
  stockCode: string;
};

type TransactionReturnPageProps = {
  transactionId: string;
};

type ReturnApproval = Awaited<ReturnType<typeof getTransactionResolutionForUser>>["approvals"][number] & { isCurrent?: boolean };
type SourceReturnContext = {
  approvals: ReturnApproval[];
  batchIds: string[];
  outcomes: { resolutionBatchId: string | null; transactionItem: { assetId: string | null } }[];
};

function isActiveApproval(approval: { status: ApprovalStatus; isCurrent?: boolean }) {
  return approval.isCurrent !== false;
}

export function hasSubstantiveApproval(approvals: Pick<ReturnApproval, "status" | "stepSequence" | "requiredTag" | "isCurrent">[]) {
  return approvals.some((approval) => isActiveApproval(approval) && approval.status === ApprovalStatus.APPROVED &&
    approval.stepSequence > 1 && !approval.requiredTag.startsWith("ACK_"));
}

export function canEditRequestAtStatus(status: TransactionWorkflowStatus, hasApprovedOther: boolean) {
  return status === TransactionWorkflowStatus.REJECTED ||
    (status === TransactionWorkflowStatus.PENDING && !hasApprovedOther);
}

export function isReturnBatchEditable(phase: string, hasPosted: boolean, hasRemaining: boolean, hasApprovedOther: boolean) {
  return phase === "REJECTED" ? hasRemaining :
    !["COMPLETED", "CANCELLED"].includes(phase) && !hasPosted && !hasApprovedOther;
}

export function needsReturnBatchMigration(batchIds: string[], pendingBatchIds: (string | null)[]) {
  return pendingBatchIds.some((id) => !id || !batchIds.includes(id));
}

export function needsResolutionMigration(registeredBatchIds: string[], pendingBatchIds: (string | null)[], source: { batchIds: string[]; outcomeBatchIds: (string | null)[] } | null) {
  if (!source) return needsReturnBatchMigration(registeredBatchIds, pendingBatchIds);
  return !source.outcomeBatchIds.length ||
    needsReturnBatchMigration(source.batchIds, source.outcomeBatchIds) ||
    needsReturnBatchMigration(source.outcomeBatchIds.filter((id): id is string => Boolean(id)), pendingBatchIds);
}

export function currentBatchApprovals<T extends Pick<ReturnApproval, "status" | "stepSequence" | "requiredTag" | "resolutionBatchId" | "isCurrent">>(
  approvals: T[], batchId: string | null, warehouseCode?: string,
) {
  const pending = approvals.filter((approval) => isActiveApproval(approval) && approval.resolutionBatchId === batchId && approval.status === ApprovalStatus.PENDING);
  const step = Math.min(...pending.map((approval) => approval.stepSequence));
  return pending.filter((approval) => approval.stepSequence === step &&
    (!warehouseCode || approvalMatchesWarehouse(approval.requiredTag, warehouseCode)));
}

export function sourceBatchFinalized(approvals: Pick<ReturnApproval, "status" | "requiredTag" | "resolutionBatchId" | "isCurrent">[], batchId: string | null) {
  if (!batchId) return false;
  const cycle = approvals.filter((approval) => isActiveApproval(approval) && approval.resolutionBatchId === batchId && approval.requiredTag !== "BSD_HELP_DESK" && !approval.requiredTag.startsWith("ACK_"));
  return cycle.some((approval) => approval.requiredTag.startsWith("STOREMAN:")) &&
    cycle.every((approval) => approval.status === ApprovalStatus.APPROVED);
}

function personName(person: { email: string | null; name: string } | null | undefined) {
  if (!person) {
    return "-";
  }

  return person.name || person.email || "-";
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/(^|_)([a-z])/g, (_match, separator: string, char: string) =>
      `${separator ? " " : ""}${char.toUpperCase()}`,
    );
}

function requestScopeLabel(
  transaction: Awaited<ReturnType<typeof getTransactionResolutionForUser>>,
) {
  if (transaction.internalRequest) {
    return "Internal";
  }

  if (transaction.serviceRequest) {
    return "Service";
  }

  if (transaction.projectRequest) {
    return "Project";
  }

  return "-";
}

export function currentStepLabel(
  transaction: Awaited<ReturnType<typeof getTransactionResolutionForUser>>,
  warehouseCode?: string,
  approvalRecords: ReturnApproval[] = transaction.approvals,
  batchId?: string | null,
) {
  if (transaction.workflowStatus === TransactionWorkflowStatus.PENDING) {
    const pendingApprovals = approvalRecords.filter((approval) =>
      isActiveApproval(approval) && approval.status === ApprovalStatus.PENDING && (batchId === undefined || approval.resolutionBatchId === batchId),
    );

    if (pendingApprovals.length > 0) {
      const cycleIds = [...new Set(pendingApprovals.map((approval) => approval.resolutionBatchId))];
      const currentStepApprovals = cycleIds.flatMap((id) => currentBatchApprovals(approvalRecords, id, warehouseCode));
      if (!currentStepApprovals.length) return "Awaiting approval";
      const names = currentStepApprovals.flatMap((approval) => {
        if (approval.user) return [personName(approval.user)];
        if (approval.requiredTag === "LEAD_PROJECT") return ["Unassigned"];
        return transaction.items
          .filter((item) => !warehouseCode || item.asset?.warehouse.code === warehouseCode)
          .flatMap((item) => item.asset?.warehouse.permissions ?? [])
          .filter((permission) => approval.requiredTag.startsWith("STOREMAN:") || approval.requiredTag.startsWith("RETURN_CHECK:")
            ? permission.canManage
            : approval.requiredTag.startsWith("WAREHOUSE_MANAGER:"))
          .map((permission) => permission.user.name);
      }).filter((name, index, all) => all.indexOf(name) === index);

      return names.length > 0 ? names.join(", ") : "Unassigned";
    }

    return "Pending approval";
  }

  if (transaction.workflowStatus === TransactionWorkflowStatus.IN_PROGRESS) {
    return "Approved / Ready for return";
  }

  if (transaction.workflowStatus === TransactionWorkflowStatus.COMPLETED) {
    return "Completed";
  }

  return titleCase(transaction.workflowStatus);
}

async function getReturnStockOptions(
  transaction: Awaited<ReturnType<typeof getTransactionResolutionForUser>>,
) {
  const optionsByItem = new Map<string, ReturnStockOption[]>();

  for (const outcome of transaction.outcomeRecords) {
    if (outcome.approvedAt || outcome.outcomeStatus !== "READY" || outcome.returnCondition !== "USED") continue;
    const item = transaction.items.find((candidate) => candidate.id === outcome.transactionItemId);
    const asset = item?.asset;
    if (!asset || !isQuantityTrackedAsset(asset)) continue;

    const stockAssets = await db.asset.findMany({
      where: {
        assetModelId: asset.assetModel.id,
        warehouseId: asset.warehouseId,
        isActive: true,
        serialNo: null,
        stockCode: { not: null },
      },
      select: {
        id: true,
        assetModelId: true,
        condition: true,
        stockCode: true,
      },
      orderBy: [{ stockCode: "asc" }, { createdAt: "asc" }],
    });
    const stockCodeOptions = new Map<string, ReturnStockOption>();
    const usedStocks = stockAssets.filter((stockAsset) => stockAsset.condition === "USED");
    for (const stockAsset of usedStocks.length > 0 ? usedStocks : stockAssets) {
      if (!stockAsset.stockCode) continue;
      const existing = stockCodeOptions.get(stockAsset.stockCode);
      if (!existing) {
        stockCodeOptions.set(stockAsset.stockCode, {
          id: stockAsset.id,
          stockCode: stockAsset.stockCode,
        });
      }
    }
    optionsByItem.set(item.id, [...stockCodeOptions.values()]);
  }

  return optionsByItem;
}

export function pendingOutcomeApproverLabel(
  transaction: Awaited<ReturnType<typeof getTransactionResolutionForUser>>,
  item: Awaited<ReturnType<typeof getTransactionResolutionForUser>>["items"][number],
  resolutionBatchId: string | null | undefined,
) {
  const asset = item.asset;
  if (!asset) return "Unavailable asset";
  if (!resolutionBatchId) return currentStepLabel(transaction, asset.warehouse.code);

  const outcome = transaction.outcomeRecords.find(
    (record) => record.transactionItemId === item.id && record.resolutionBatchId === resolutionBatchId,
  );
  const sourceCycle = transaction.approvals.filter((approval) => isActiveApproval(approval) && approval.resolutionBatchId === resolutionBatchId);
  const sourceFinalized = sourceBatchFinalized(sourceCycle, resolutionBatchId);
  const approvalRecords = sourceFinalized && outcome?.soldTransaction
    ? outcome.soldTransaction.approvals
    : sourceCycle;
  const pendingApprovals = approvalRecords.filter((approval) => isActiveApproval(approval) && approval.status === ApprovalStatus.PENDING);
  if (pendingApprovals.length === 0) return "Awaiting approval";

  const currentStep = Math.min(...pendingApprovals.map((approval) => approval.stepSequence));
  const currentStepApprovals = pendingApprovals.filter((approval) => approval.stepSequence === currentStep && approvalMatchesWarehouse(approval.requiredTag, asset.warehouse.code));
  if (!currentStepApprovals.length) return "Awaiting approval";
  const names = currentStepApprovals.flatMap((approval) => {
    if (approval.user) return [personName(approval.user)];
    if (approval.requiredTag === "LEAD_PROJECT") return ["Unassigned"];
    return asset.warehouse.permissions
      .filter((permission) => approval.requiredTag.startsWith("STOREMAN:") || approval.requiredTag.startsWith("RETURN_CHECK:")
        ? permission.canManage
        : approval.requiredTag.startsWith("WAREHOUSE_MANAGER:"))
      .map((permission) => permission.user.name);
  });

  return [...new Set(names)].join(", ") || "Pending approval";
}

export function returnActionBlockedReason(
  workflowStatus: TransactionWorkflowStatus,
  canReturnByWorkflow: boolean,
  canReturnByUser: boolean,
): string | null {
  if (workflowStatus === TransactionWorkflowStatus.COMPLETED) {
    return "This transaction is completed. No further return actions are available.";
  }
  if (!canReturnByWorkflow) {
    return "This request is not fully approved yet. You can review the request details, but return actions are disabled.";
  }
  return canReturnByUser ? null : "Only the original requester can return this transaction.";
}

export function excludeCancelledReturnOutcomes<T extends { resolutionBatchId: string | null }>(
  outcomes: T[],
  cancelledBatchIds: string[],
): T[] {
  const cancelled = new Set(cancelledBatchIds);
  return outcomes.filter((outcome) => !outcome.resolutionBatchId || !cancelled.has(outcome.resolutionBatchId));
}

export function isSupervisorApprovalTag(tag: string) {
  return tag === "DIRECT_MANAGER" || tag.endsWith("_SUPERVISOR");
}

function serializeTransaction(
  transaction: Awaited<ReturnType<typeof getTransactionResolutionForUser>>,
  user: Awaited<ReturnType<typeof requireCurrentUser>>,
  returnStockOptionsByItem: Map<string, ReturnStockOption[]>,
  batches: ReturnBatchReviewBatch[],
  sourceContext: SourceReturnContext | null,
  registeredBatchIds: string[],
  cancelledBatchIds: string[],
): TransactionReturnRecord {
  // Retain cancelled outcomes in the audit trail, not in actionable quantities.
  transaction = { ...transaction, outcomeRecords: excludeCancelledReturnOutcomes(transaction.outcomeRecords, cancelledBatchIds) };
  const migrationRequired = needsResolutionMigration(registeredBatchIds,
    [
      ...transaction.outcomeRecords.filter((outcome) => !outcome.approvedAt).map((outcome) => outcome.resolutionBatchId),
      ...transaction.approvals.filter((approval) => isActiveApproval(approval) && approval.status === ApprovalStatus.PENDING && approval.resolutionBatchId).map((approval) => approval.resolutionBatchId),
    ], sourceContext ? { batchIds: sourceContext.batchIds, outcomeBatchIds: sourceContext.outcomes.map((outcome) => outcome.resolutionBatchId) } : null);
  const approvalBlockedReason = migrationRequired
    ? "Return batch migration is required before final approval. This legacy batch has not been migrated."
    : null;
  const canReturnByWorkflow =
    (transaction.workflowStatus === TransactionWorkflowStatus.IN_PROGRESS ||
      (transaction.workflowStatus === TransactionWorkflowStatus.PENDING &&
        transaction.outcomeRecords.some((outcome) => !outcome.approvedAt)) ||
      (transaction.workflowStatus === TransactionWorkflowStatus.REJECTED &&
        batches.some((batch) => batch.phase === "REJECTED"))) &&
    isReturnableTransaction(transaction.type);
  const canReturnByUser = transaction.requestedBy.id === user.id;
  const canReturn = canReturnByWorkflow && canReturnByUser;
  const editableReturnBatches = canReturnByUser ? batches.filter((batch) => isReturnBatchEditable(
    batch.phase,
    transaction.outcomeRecords.some((outcome) => outcome.resolutionBatchId === batch.id && Boolean(outcome.approvedAt)),
    transaction.outcomeRecords.some((outcome) => outcome.resolutionBatchId === batch.id && !outcome.approvedAt && outcome.quantity > 0),
    hasSubstantiveApproval(transaction.approvals.filter((approval) => approval.resolutionBatchId === batch.id)),
  ),
  ).map((batch) => ({ id: batch.id, requestNo: batch.requestNo, phase: batch.phase })) : [];
  const returnBlockedReason = returnActionBlockedReason(transaction.workflowStatus, canReturnByWorkflow, canReturnByUser);
  const stepLabel = currentStepLabel(transaction);
  const kindLabel = `${titleCase(transaction.type)} / ${requestScopeLabel(transaction)}`;
  const originWarehouse = [...new Set(transaction.items.flatMap((item) => item.asset ? [item.asset.warehouse.name] : []))].join(", ") || "-";
  const projectLeads = [
    ...(transaction.project?.leadUser ? [transaction.project.leadUser] : []),
    ...(transaction.project?.members ?? []).map((member) => member.user),
  ].filter((person): person is NonNullable<typeof person> => Boolean(person))
    .filter((person, index, all) => all.findIndex((item) => item.id === person.id) === index);
  const supervisorApprovers = transaction.approvals.filter(isActiveApproval)
    .filter((approval) => isSupervisorApprovalTag(approval.requiredTag) && approval.user)
    .map((approval) => approval.user)
    .filter((person): person is NonNullable<typeof person> => Boolean(person))
    .filter((person, index, all) => all.findIndex((item) => item.id === person.id) === index);
  const leadSupervisorName = [...(projectLeads.length > 0 ? projectLeads : supervisorApprovers)]
    .map(personName)
    .join(", ") || "-";
  const statusLabel = transaction.workflowStatus === TransactionWorkflowStatus.COMPLETED
    ? "Completed"
    : transaction.workflowStatus === TransactionWorkflowStatus.IN_PROGRESS
      ? "In Progress"
      : titleCase(transaction.workflowStatus);
  const pendingApprovals = transaction.approvals.filter(isActiveApproval).filter(
    (approval) => approval.status === ApprovalStatus.PENDING,
  );
  const currentProjectLeadIds = new Set([
    ...(transaction.project?.leadUser ? [transaction.project.leadUser.id] : []),
    ...(transaction.project?.members ?? []).map((member) => member.user.id),
  ]);
  const currentApproval = pendingApprovals
    .filter((approval) =>
      (approval.requiredTag === "LEAD_PROJECT"
        ? currentProjectLeadIds.has(user.id) && approval.userId === user.id
        : approvalMatchesUser(user, approval)),
    )
    .find((approval) => {
      if (approval.requiredTag.startsWith("ACK_")) return true;
      if (migrationRequired) return false;
      if (sourceContext) {
        const sourceBatchIds = new Set(sourceContext.outcomes.map((outcome) => outcome.resolutionBatchId));
        if (!sourceBatchIds.size || [...sourceBatchIds].some((id) => !sourceBatchFinalized(sourceContext.approvals, id))) return false;
      }
      const cyclePending = pendingApprovals.filter(
        (candidate) => candidate.resolutionBatchId === approval.resolutionBatchId,
      );
      if (approval.resolutionBatchId && approval.requiredTag.startsWith("STOREMAN:")) {
        const batch = batches.find((candidate) => candidate.id === approval.resolutionBatchId);
        if (!batch || !batch.allChecked || (batch.requiresDocument && !batch.hasSignedDocument)) return false;
      }
      return approval.stepSequence === Math.min(...cyclePending.map((candidate) => candidate.stepSequence));
    }) ?? null;
  const canEditPendingRequest =
    !transaction.sourceTransactionId &&
    transaction.requestedBy.id === user.id &&
    canEditRequestAtStatus(transaction.workflowStatus, hasSubstantiveApproval(transaction.approvals));

  const rejectedApproval = transaction.approvals.filter(isActiveApproval).find((approval) => approval.status === ApprovalStatus.REJECTED);
  const approvedOutcomeQuantities = new Map<string, number>();
  for (const outcome of transaction.outcomeRecords) {
    if (outcome.approvedAt) {
      approvedOutcomeQuantities.set(
        outcome.transactionItemId,
        (approvedOutcomeQuantities.get(outcome.transactionItemId) ?? 0) + outcome.quantity,
      );
    }
  }

  return {
    approvalStep: currentApproval?.stepSequence ?? null,
    approvalTag: currentApproval?.requiredTag ?? null,
    canApprove: Boolean(currentApproval),
    approvalBlockedReason,
    canExportAnytime: hasRole(user, "ADMIN") || hasRole(user, "STOREMAN") || user.permissions.some((permission) => permission.canManage),
    isAcknowledgement: Boolean(currentApproval?.requiredTag.startsWith("ACK_")),
    canEditPendingRequest,
    canReturn,
    editableReturnBatches,
    hasSignature: Boolean(user.signatureDataUrl),
    returnBlockedReason,
    id: transaction.id,
    sourceTransactionId: transaction.sourceTransactionId,
    soldPrice: transaction.soldPrice?.toString() ?? null,
    requestDate: transaction.requestDate.toISOString(),
    requisitionerName: personName(transaction.requestedBy),
    requisitionerPosition: transaction.requestedBy.position,
    customerName: transaction.project?.customerName ?? (transaction.serviceRequest ? transaction.purpose : null),
    projectName: transaction.project?.name ?? null,
    projectCode: transaction.project?.projectId ?? null,
    returnDate: transaction.returnedAt?.toISOString() ?? null,
    originWarehouse,
    leadSupervisorName,
    currentApprovalStep: stepLabel,
    statusLabel,
    items: transaction.items.map((item) => {
      const asset = item.asset;
      const pendingOutcome = transaction.outcomeRecords.find(
        (outcome) => outcome.transactionItemId === item.id && !outcome.approvedAt,
      );
      const hasPendingOutcome = Boolean(pendingOutcome);
      const sourceOutcome = sourceContext?.outcomes.find((outcome) => outcome.transactionItem.assetId === asset?.id);
      const sourceCycle = sourceOutcome
        ? sourceContext?.approvals.filter((approval) => isActiveApproval(approval) && approval.resolutionBatchId === sourceOutcome.resolutionBatchId) ?? []
        : [];
      const awaitingSource = sourceOutcome && !sourceBatchFinalized(sourceCycle, sourceOutcome.resolutionBatchId);
      const itemCurrentStep = sourceContext && !sourceOutcome
        ? "Awaiting approval"
        : awaitingSource
        ? currentStepLabel(transaction, asset?.warehouse.code, sourceCycle, sourceOutcome.resolutionBatchId)
        : hasPendingOutcome
        ? pendingOutcomeApproverLabel(transaction, item, pendingOutcome?.resolutionBatchId)
        : item.returnedAt
          ? "Completed"
          : canReturnByWorkflow
            ? "Approved / Ready for return"
          : asset ? currentStepLabel(transaction, asset.warehouse.code) : "Unavailable asset";

      return {
      hasPendingOutcome,
      pendingBatchIds: [...new Set(transaction.outcomeRecords.filter((outcome) => outcome.transactionItemId === item.id && !outcome.approvedAt).map((outcome) => outcome.resolutionBatchId))],
      assetId: asset?.id ?? item.id,
      brand: asset?.assetModel.brand ?? null,
      category: asset?.assetModel.category?.name ?? null,
      isDispatched: Boolean(item.dispatchedAt),
      canConfirmSerial: Boolean(asset && canConfirmIssueSerial({
        workflowStatus: transaction.workflowStatus,
        type: transaction.type,
        sourceTransactionId: transaction.sourceTransactionId,
        hasOutcomes: transaction.outcomeRecords.length > 0,
        approvalTag: currentApproval?.requiredTag ?? null,
        warehouseCode: asset.warehouse.code,
        isSerialized: !isQuantityTrackedAsset(asset),
        assetStatus: asset.status,
        serialNo: asset.serialNo,
        isDispatched: Boolean(item.dispatchedAt),
      })),
      currentStep: itemCurrentStep,
      currentStatus: asset?.status ?? AssetStatus.READY,
      isQuantityAsset: Boolean(asset && isQuantityTrackedAsset(asset)),
      itemId: item.id,
      kindLabel,
      model: asset?.assetModel.name ?? "Unavailable asset",
      partNo: asset?.assetModel.partNo ?? null,
      note: item.note,
      requestedQuantity: item.requestedQuantity,
      // Keep the stock total available to the pending-request editor. The
      // previous value incorrectly used requestedQuantity as the upper limit.
      availableQuantity: asset?.assetQuantity ?? 0,
      resolvedAt: item.returnedAt?.toISOString() ?? null,
      resolvedQuantity: approvedOutcomeQuantities.get(item.id) ?? (item.returnedAt ? item.requestedQuantity : 0),
      resolvedStatus: item.resolvedStatus,
      resolutionNote: item.resolutionNote,
      soldPrice: item.soldPrice?.toString() ?? null,
      soldTotal: item.soldTotal?.toString() ?? null,
      salePriceGroups: readStoredSalePriceGroups(item.salePriceGroups),
      serialNo: asset?.serialNo ?? null,
      stockCode: asset?.stockCode ?? null,
      typeName: asset?.assetModel.typeName ?? null,
      warehouseName: asset?.warehouse.name ?? "-",
      };
    }),
    outcomes: transaction.outcomeRecords.map((outcome): TransactionOutcomeSummary => {
      const item = transaction.items.find((candidate) => candidate.id === outcome.transactionItemId);
      return {
        id: outcome.id,
        itemId: outcome.transactionItemId,
        resolutionBatchId: outcome.resolutionBatchId,
        model: item?.asset?.assetModel.name ?? "Unknown asset",
        partNo: item?.asset?.assetModel.partNo ?? null,
        stockCode: item?.asset?.stockCode ?? null,
        typeName: item?.asset?.assetModel.typeName ?? null,
        warehouseName: item?.asset?.warehouse.name ?? "-",
        serialNo: item?.asset?.serialNo ?? null,
        outcomeStatus: outcome.outcomeStatus,
        quantity: outcome.quantity,
        returnCondition: outcome.returnCondition,
        returnStockAssetId: outcome.assetId,
        returnStockOptions: returnStockOptionsByItem.get(outcome.transactionItemId) ?? [],
        note: outcome.note,
        soldPrice: outcome.soldPrice?.toString() ?? null,
        soldTotal: outcome.soldTotal?.toString() ?? null,
        approvedAt: outcome.approvedAt?.toISOString() ?? null,
        canChooseCondition: false,
        canDelete: !outcome.approvedAt && transaction.requestedBy.id === user.id &&
          (!outcome.resolutionBatchId || editableReturnBatches.some((batch) => batch.id === outcome.resolutionBatchId)),
      };
    }),
    internalRequest: transaction.internalRequest,
    kindLabel,
    note: transaction.note,
    projectId: transaction.projectId,
    projectRequest: transaction.projectRequest,
    purpose: transaction.purpose,
    rejectedAt: rejectedApproval?.actedAt?.toISOString() ?? null,
    rejectedBy: rejectedApproval?.user ? personName(rejectedApproval.user) : null,
    rejectReason: rejectedApproval?.comment ?? null,
    rejectBlockedReason: approvalBlockedReason ?? (currentApproval
      ? null
      : currentProjectLeadIds.size > 0 &&
          pendingApprovals.some((approval) => approval.requiredTag === "LEAD_PROJECT")
        ? `Only the current Project Lead (${[...(transaction.project?.leadUser ? [transaction.project.leadUser] : []), ...(transaction.project?.members ?? []).map((member) => member.user)].map(personName).join(", ")}) can approve this request.`
        : "No approval is waiting for this user."),
    requestedBy: personName(transaction.requestedBy),
    requiresSoldPriceApproval: requiresBsdSalePricing(currentApproval?.requiredTag, transaction.type),
    serviceRequest: transaction.serviceRequest,
    transactionNo: transaction.transactionNo ?? transaction.id,
    type: transaction.type,
    workflowStatus: transaction.workflowStatus,
  };
}

export function requiresBsdSalePricing(requiredTag: string | null | undefined, transactionType: string) {
  return requiredTag === "BSD_HELP_DESK" && transactionType === "SOLD";
}

export async function TransactionReturnPage({
  transactionId,
}: TransactionReturnPageProps) {
  const user = await requireCurrentUser(`/logs/${transactionId}/return`);

  try {
    const [transaction, projects, batches] = await Promise.all([
      getTransactionResolutionForUser(user, transactionId),
      db.project.findMany({
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true, projectId: true, customerName: true },
        where: { status: "ACTIVE" },
      }),
      getReturnBatchReviews(user, transactionId),
    ]);
    const returnStockOptionsByItem = await getReturnStockOptions(transaction);
    const sourceContext: SourceReturnContext | null = transaction.sourceTransactionId ? {
      batchIds: (await db.returnBatch.findMany({ where: { transactionId: transaction.sourceTransactionId }, select: { id: true } })).map((batch) => batch.id),
      approvals: await db.transactionApproval.findMany({
        where: { transactionId: transaction.sourceTransactionId },
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
      outcomes: await db.transactionItemOutcome.findMany({
        where: { soldTransactionId: transaction.id },
        select: { resolutionBatchId: true, transactionItem: { select: { assetId: true } } },
      }),
    } : null;
    const registeredBatches = await db.returnBatch.findMany({ where: { transactionId: transaction.id }, select: { id: true, state: true } });
    const registeredBatchIds = registeredBatches.map((batch) => batch.id);
    const cancelledBatchIds = registeredBatches.filter((batch) => batch.state === "CANCELLED").map((batch) => batch.id);

    return (
      <>
      <TransactionReturnClient
        canExportAnytime={hasRole(user, "ADMIN") || hasRole(user, "STOREMAN") || user.permissions.some((permission) => permission.canManage)}
        projects={projects}
        transaction={serializeTransaction(transaction, user, returnStockOptionsByItem, batches, sourceContext, registeredBatchIds, cancelledBatchIds)}
      />
      <ReturnBatchReview transactionId={transactionId} batches={batches} />
      </>
    );
  } catch (error) {
    if (error instanceof WorkflowError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}




