import { ApprovalStatus, TransactionWorkflowStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getTransactionResolutionForUser,
  WorkflowError,
} from "@/lib/workflow";
import {
  TransactionReturnClient,
  type TransactionReturnRecord,
} from "@/features/transaction-return/transaction-return-client";
import { approvalMatchesUser } from "@/lib/approval-flow";
import { hasRole } from "@/lib/permissions";
import { isReturnableTransaction } from "@/lib/workflow-rules";

type TransactionReturnPageProps = {
  transactionId: string;
};

function personName(person: { email: string; name: string } | null | undefined) {
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

function currentStepLabel(
  transaction: Awaited<ReturnType<typeof getTransactionResolutionForUser>>,
) {
  if (transaction.workflowStatus === TransactionWorkflowStatus.PENDING) {
    const pendingApproval = transaction.approvals.find(
      (approval) => approval.status === ApprovalStatus.PENDING,
    );

    if (pendingApproval) {
      const approver = pendingApproval.user
        ? personName(pendingApproval.user)
        : pendingApproval.requiredTag;

      return `Step ${pendingApproval.stepSequence}: ${approver}`;
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

function serializeTransaction(
  transaction: Awaited<ReturnType<typeof getTransactionResolutionForUser>>,
  user: Awaited<ReturnType<typeof requireCurrentUser>>,
): TransactionReturnRecord {
  const canReturnByWorkflow =
    transaction.workflowStatus === TransactionWorkflowStatus.IN_PROGRESS &&
    isReturnableTransaction(transaction.type);
  const canReturnByUser =
    transaction.requestedBy.id === user.id || hasRole(user, "ADMIN");
  const canReturn = canReturnByWorkflow && canReturnByUser;
  const returnBlockedReason = !canReturnByWorkflow
    ? "This request is not fully approved yet. You can review the request details, but return actions are disabled."
    : !canReturnByUser
      ? "Only the requester or an admin can return this transaction."
      : null;
  const stepLabel = currentStepLabel(transaction);
  const kindLabel = `${titleCase(transaction.type)} / ${requestScopeLabel(transaction)}`;
  const pendingApprovals = transaction.approvals.filter(
    (approval) => approval.status === ApprovalStatus.PENDING,
  );
  const currentStep = pendingApprovals.length
    ? Math.min(...pendingApprovals.map((approval) => approval.stepSequence))
    : null;
  const currentApproval = currentStep
    ? pendingApprovals.find(
        (approval) =>
          approval.stepSequence === currentStep && approvalMatchesUser(user, approval),
      )
    : null;
  const hasApprovedApproval = transaction.approvals.some(
    (approval) => approval.status === ApprovalStatus.APPROVED,
  );
  const canEditPendingRequest =
    transaction.workflowStatus === TransactionWorkflowStatus.PENDING &&
    transaction.requestedBy.id === user.id &&
    !hasApprovedApproval;

  return {
    approvalStep: currentApproval?.stepSequence ?? null,
    approvalTag: currentApproval?.requiredTag ?? null,
    canApprove: Boolean(currentApproval),
    canEditPendingRequest,
    canReturn,
    hasSignature: Boolean(user.signatureDataUrl),
    returnBlockedReason,
    id: transaction.id,
    items: transaction.items.map((item) => ({
      assetId: item.asset.id,
      brand: item.asset.assetModel.brand,
      currentStep: stepLabel,
      currentStatus: item.asset.status,
      isQuantityAsset: item.asset.assetModel.assetType?.trackMethod === "QUANTITY",
      itemId: item.id,
      kindLabel,
      model: item.asset.assetModel.name,
      note: item.note,
      requestedQuantity: item.requestedQuantity,
      resolvedAt: item.returnedAt?.toISOString() ?? null,
      resolvedStatus: item.resolvedStatus,
      resolutionNote: item.resolutionNote,
      serialNo: item.asset.serialNo,
      stockCode: item.asset.stockCode,
    })),
    internalRequest: transaction.internalRequest,
    kindLabel,
    note: transaction.note,
    projectId: transaction.projectId,
    projectRequest: transaction.projectRequest,
    purpose: transaction.purpose,
    rejectBlockedReason: currentApproval ? null : "No approval is waiting for this user.",
    requestedBy: personName(transaction.requestedBy),
    requiresSoldPriceApproval: Boolean(currentApproval?.requiredTag === "BSD_STAFF" && transaction.type === "SOLD"),
    serviceRequest: transaction.serviceRequest,
    transactionNo: transaction.transactionNo ?? transaction.id,
    type: transaction.type,
    workflowStatus: transaction.workflowStatus,
  };
}

export async function TransactionReturnPage({
  transactionId,
}: TransactionReturnPageProps) {
  const user = await requireCurrentUser(`/logs/${transactionId}/return`);

  try {
    const [transaction, projects] = await Promise.all([
      getTransactionResolutionForUser(user, transactionId),
      db.project.findMany({
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true, projectId: true },
        where: { status: "ACTIVE" },
      }),
    ]);

    return (
      <TransactionReturnClient
        projects={projects}
        transaction={serializeTransaction(transaction, user)}
      />
    );
  } catch (error) {
    if (error instanceof WorkflowError && error.statusCode === 404) {
      notFound();
    }

    throw error;
  }
}




