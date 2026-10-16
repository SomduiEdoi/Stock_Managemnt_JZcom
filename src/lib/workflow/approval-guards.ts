import {
  ApprovalStatus,
  AssetCondition,
  AssetStatus,
  Prisma,
  ProjectMemberTag,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { approvalMatchesUser } from "@/lib/approval-flow";
import { WorkflowError } from "./shared";

export async function assertReturnFinalGate(
  tx: Prisma.TransactionClient,
  transactionId: string,
  batchId: string,
  requireFinalApprovals = false,
) {
  const batch = await tx.returnBatch.findFirst({
    where: { id: batchId, transactionId },
  });
  if (!batch || ["REJECTED", "CANCELLED"].includes(batch.state)) {
    throw new WorkflowError(
      "This return batch is not active.",
      409,
      "RETURN_BATCH_NOT_ACTIVE",
    );
  }
  const [approvals, outcomes] = await Promise.all([
    tx.transactionApproval.findMany({
      where: { transactionId, resolutionBatchId: batchId, isCurrent: true },
    }),
    tx.transactionItemOutcome.findMany({
      where: { transactionId, resolutionBatchId: batchId, approvedAt: null },
      include: {
        checks: true,
        transactionItem: {
          include: { asset: { include: { warehouse: true } } },
        },
      },
    }),
  ]);
  const checks = approvals.filter((approval) =>
    approval.requiredTag.startsWith("RETURN_CHECK:"),
  );
  if (
    !checks.length ||
    checks.some((approval) => approval.status !== ApprovalStatus.APPROVED) ||
    outcomes.some((outcome) => {
      const code = outcome.transactionItem.asset?.warehouse.code;
      const required = checks.filter(
        (approval) => approval.requiredTag === `RETURN_CHECK:${code}`,
      );
      return (
        !required.length ||
        required.some(
          (approval) =>
            !approval.userId ||
            !outcome.checks.some((check) => check.userId === approval.userId),
        )
      );
    })
  ) {
    throw new WorkflowError(
      "All outcomes must be checked by every assigned Storeman.",
      409,
      "RETURN_CHECKS_REQUIRED",
    );
  }
  const requiresDocument = outcomes.some(
    (outcome) =>
      outcome.outcomeStatus === AssetStatus.FAIL ||
      outcome.outcomeStatus === AssetStatus.LOST ||
      outcome.returnCondition === AssetCondition.USED,
  );
  if (
    requiresDocument &&
    (!batch.signedPdf?.byteLength || !batch.signedAt || !batch.signedById)
  ) {
    throw new WorkflowError(
      "Upload the signed PDF for this return revision before final approval.",
      409,
      "SIGNED_RETURN_PDF_REQUIRED",
    );
  }
  if (requireFinalApprovals) {
    const finalApprovals = approvals.filter((approval) =>
      approval.requiredTag.startsWith("STOREMAN:"),
    );
    if (
      !finalApprovals.length ||
      finalApprovals.some(
        (approval) => approval.status !== ApprovalStatus.APPROVED,
      ) ||
      approvals.some(
        (approval) =>
          !approval.requiredTag.startsWith("ACK_") &&
          approval.status !== ApprovalStatus.APPROVED,
      )
    ) {
      throw new WorkflowError(
        "Every warehouse must complete final return approval before sale or stock posting.",
        409,
        "RETURN_FINAL_APPROVAL_REQUIRED",
      );
    }
  }
}

export async function assertReturnBatchEditable(
  tx: Prisma.TransactionClient,
  transactionId: string,
  batchId: string,
) {
  const batch = await tx.returnBatch.findFirst({
    where: { id: batchId, transactionId },
  });
  if (!batch || ["COMPLETED", "CANCELLED"].includes(batch.state))
    throw new WorkflowError(
      "This return batch cannot be edited.",
      409,
      "RETURN_BATCH_LOCKED",
    );
  if (batch.state === "REJECTED") return;
  const approved = await tx.transactionApproval.findFirst({
    where: {
      transactionId,
      resolutionBatchId: batchId,
      isCurrent: true,
      status: ApprovalStatus.APPROVED,
      stepSequence: { gt: 1 },
    },
  });
  if (approved)
    throw new WorkflowError(
      "The return batch is locked after lead approval. Reject it before editing.",
      409,
      "RETURN_LEAD_ALREADY_APPROVED",
    );
}

export function currentPendingApproval(
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
    (approval) =>
      approval.status === ApprovalStatus.PENDING &&
      !approval.requiredTag.startsWith("ACK_"),
  );

  if (pendingApprovals.length === 0) {
    return null;
  }

  return (
    pendingApprovals.find(
      (approval) =>
        approval.stepSequence ===
          Math.min(
            ...pendingApprovals
              .filter(
                (candidate) =>
                  candidate.resolutionBatchId === approval.resolutionBatchId,
              )
              .map((candidate) => candidate.stepSequence),
          ) &&
        (approval.requiredTag === ProjectMemberTag.LEAD_PROJECT &&
        currentProjectLeadIds
          ? currentProjectLeadIds.has(user.id) && approval.userId === user.id
          : approvalMatchesUser(user, approval)),
    ) ?? null
  );
}
