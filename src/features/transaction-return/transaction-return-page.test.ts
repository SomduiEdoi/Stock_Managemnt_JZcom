import { describe, expect, it, vi } from "vitest";
import { ApprovalStatus, TransactionWorkflowStatus } from "@prisma/client";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/auth", () => ({ requireCurrentUser: vi.fn() }));
vi.mock("@/lib/workflow", () => ({ getTransactionResolutionForUser: vi.fn(), WorkflowError: class extends Error {} }));
vi.mock("@/lib/return-batch-service", () => ({ getReturnBatchReviews: vi.fn() }));

import { canEditRequestAtStatus, currentBatchApprovals, hasSubstantiveApproval, isReturnBatchEditable, needsReturnBatchMigration, needsResolutionMigration, sourceBatchFinalized, returnActionBlockedReason, excludeCancelledReturnOutcomes } from "./transaction-return-page";

import { requiresBsdSalePricing, currentStepLabel, pendingOutcomeApproverLabel } from "./transaction-return-page";

describe("project lead current-step labels", () => {
  function fixture(firstStatus: ApprovalStatus, secondStatus: ApprovalStatus, batch: string | null) {
    const first = { id: "lead-a", name: "Suebskul P.", email: null };
    const second = { id: "lead-b", name: "Thawanat J.", email: null };
    return {
      workflowStatus: TransactionWorkflowStatus.PENDING,
      project: { leadUser: first, members: [{ user: first }, { user: second }, { user: { id: "member", name: "Not an approver", email: null } }] },
      approvals: [
        { ...approval("LEAD_PROJECT", 2, firstStatus), resolutionBatchId: batch, user: first },
        { ...approval("LEAD_PROJECT", 2, secondStatus), resolutionBatchId: batch, user: second },
        { ...approval("RETURN_CHECK:A", 3), resolutionBatchId: batch, user: { name: "Storeman A", email: null } },
      ],
      items: [], outcomeRecords: [],
    } as unknown as Parameters<typeof currentStepLabel>[0];
  }

  it("shows only the pending assigned lead for requisition and return", () => {
    const transaction = fixture(ApprovalStatus.APPROVED, ApprovalStatus.PENDING, null);
    expect(currentStepLabel(transaction, "A")).toBe("Thawanat J.");
    const returned = fixture(ApprovalStatus.APPROVED, ApprovalStatus.PENDING, "batch");
    const item = { id: "item", asset: { warehouse: { code: "A", permissions: [] } } } as unknown as Parameters<typeof pendingOutcomeApproverLabel>[1];
    expect(pendingOutcomeApproverLabel(returned, item, "batch")).toBe("Thawanat J.");
  });

  it("shows both pending leads once and never adds project members", () => {
    expect(currentStepLabel(fixture(ApprovalStatus.PENDING, ApprovalStatus.PENDING, null), "A"))
      .toBe("Suebskul P., Thawanat J.");
  });

  it("advances to Storeman only after both leads approve", () => {
    expect(currentStepLabel(fixture(ApprovalStatus.APPROVED, ApprovalStatus.APPROVED, null), "A"))
      .toBe("Storeman A");
  });
});

describe("BSD sale pricing", () => {
  it("requires prices for direct and derived sales without a source-link condition", () => {
    expect(requiresBsdSalePricing("BSD_STAFF", "SOLD")).toBe(true);
  });
  it("does not enable pricing for other roles or transaction types", () => {
    expect(requiresBsdSalePricing("STOREMAN:SALE_STOCK", "SOLD")).toBe(false);
    expect(requiresBsdSalePricing("BSD_STAFF", "BORROW")).toBe(false);
    expect(requiresBsdSalePricing(undefined, "SOLD")).toBe(false);
  });
});

describe("cancelled return outcome visibility", () => {
  it("excludes cancelled pending quantities without deleting audit records", () => {
    const outcomes = [{ resolutionBatchId: "cancelled", quantity: 1 }, { resolutionBatchId: "active", quantity: 2 }];
    expect(excludeCancelledReturnOutcomes(outcomes, ["cancelled"]))
      .toEqual([{ resolutionBatchId: "active", quantity: 2 }]);
    expect(outcomes).toHaveLength(2);
  });
  it("preserves completed, rejected-for-edit and legacy outcomes", () => {
    const outcomes = ["completed", "rejected", null].map((resolutionBatchId) => ({ resolutionBatchId }));
    expect(excludeCancelledReturnOutcomes(outcomes, ["cancelled"])).toEqual(outcomes);
  });
});

describe("return action blocked message", () => {
  it("describes completed transactions without claiming approvals are pending", () => {
    for (const requester of [true, false]) {
      expect(returnActionBlockedReason(TransactionWorkflowStatus.COMPLETED, false, requester))
        .toBe("This transaction is completed. No further return actions are available.");
    }
  });
  it("preserves approval and original-requester restrictions", () => {
    expect(returnActionBlockedReason(TransactionWorkflowStatus.PENDING, false, true)).toContain("not fully approved yet");
    expect(returnActionBlockedReason(TransactionWorkflowStatus.IN_PROGRESS, true, false)).toContain("Only the original requester");
    expect(returnActionBlockedReason(TransactionWorkflowStatus.IN_PROGRESS, true, true)).toBeNull();
  });
});

function approval(tag: string, step: number, status: ApprovalStatus = ApprovalStatus.PENDING, batch = "batch") {
  return { requiredTag: tag, stepSequence: step, status, resolutionBatchId: batch, isCurrent: true };
}

describe("batch-wide current step", () => {
  it("does not advance warehouse A while warehouse B still checks", () => {
    const approvals = [
      approval("RETURN_CHECK:A", 2, ApprovalStatus.APPROVED),
      approval("RETURN_CHECK:B", 2),
      approval("STOREMAN:A", 3),
      approval("STOREMAN:B", 3),
    ];
    expect(currentBatchApprovals(approvals, "batch", "A")).toEqual([]);
    expect(currentBatchApprovals(approvals, "batch", "B").map((item) => item.requiredTag)).toEqual(["RETURN_CHECK:B"]);
  });

  it("ignores other batches and superseded revision approvals", () => {
    const approvals = [
      approval("RETURN_CHECK:B", 1, ApprovalStatus.PENDING, "other"),
      { ...approval("RETURN_CHECK:A", 1), isCurrent: false },
      approval("STOREMAN:A", 3),
    ];
    expect(currentBatchApprovals(approvals, "batch", "A").map((item) => item.requiredTag)).toEqual(["STOREMAN:A"]);
  });

  it("retains shared lead approval before warehouse steps", () => {
    expect(currentBatchApprovals([approval("LEAD_PROJECT", 1), approval("RETURN_CHECK:A", 2)], "batch", "A").map((item) => item.requiredTag)).toEqual(["LEAD_PROJECT"]);
  });
});

describe("derived SOLD source gate", () => {
  it("does not wait for its own BSD pricing or acknowledgements", () => {
    expect(sourceBatchFinalized([
      approval("C1_SUPERVISOR", 2, ApprovalStatus.APPROVED),
      approval("RETURN_CHECK:A", 3, ApprovalStatus.APPROVED),
      approval("STOREMAN:A", 4, ApprovalStatus.APPROVED),
      approval("BSD_STAFF", 2), approval("ACK_BSD", 999),
    ], "batch")).toBe(true);
  });

  it("validates derived batch references against linked source outcomes", () => {
    const source = { batchIds: ["source-batch"], outcomeBatchIds: ["source-batch"] };
    expect(needsResolutionMigration([], ["source-batch"], source)).toBe(false);
    expect(needsResolutionMigration([], ["unrelated"], source)).toBe(true);
    expect(needsResolutionMigration([], ["source-batch"], { ...source, batchIds: [] })).toBe(true);
    expect(needsResolutionMigration([], [], { ...source, outcomeBatchIds: [] })).toBe(true);
    expect(needsResolutionMigration([], ["source-batch"], null)).toBe(true);
  });
  it("waits for every source warehouse final approval", () => {
    const approvals = [approval("LEAD_PROJECT", 1, ApprovalStatus.APPROVED), approval("RETURN_CHECK:A", 2, ApprovalStatus.APPROVED), approval("STOREMAN:A", 3, ApprovalStatus.APPROVED), approval("STOREMAN:B", 3)];
    expect(sourceBatchFinalized(approvals, "batch")).toBe(false);
    approvals[3].status = ApprovalStatus.APPROVED;
    expect(sourceBatchFinalized(approvals, "batch")).toBe(true);
  });

  it("ignores superseded source approvals and fails closed on missing finals", () => {
    expect(sourceBatchFinalized([{ ...approval("RETURN_CHECK:A", 1), isCurrent: false }, approval("STOREMAN:A", 3, ApprovalStatus.APPROVED)], "batch")).toBe(true);
    expect(sourceBatchFinalized([approval("RETURN_CHECK:A", 2, ApprovalStatus.APPROVED)], "batch")).toBe(false);
    expect(sourceBatchFinalized([], null)).toBe(false);
  });
});

describe("pending edit lock", () => {
  it("reopens rejected requests even after prior lead approval", () => {
    expect(canEditRequestAtStatus(TransactionWorkflowStatus.REJECTED, true)).toBe(true);
    expect(canEditRequestAtStatus(TransactionWorkflowStatus.PENDING, true)).toBe(false);
    expect(canEditRequestAtStatus(TransactionWorkflowStatus.PENDING, false)).toBe(true);
    expect(canEditRequestAtStatus(TransactionWorkflowStatus.COMPLETED, false)).toBe(false);
  });
  it("ignores requester confirmation, acknowledgements and superseded approvals", () => {
    expect(hasSubstantiveApproval([
      approval("REQUESTER", 1, ApprovalStatus.APPROVED),
      approval("ACK_BSD", 4, ApprovalStatus.APPROVED),
      { ...approval("LEAD_PROJECT", 2, ApprovalStatus.APPROVED), isCurrent: false },
    ])).toBe(false);
    expect(hasSubstantiveApproval([approval("LEAD_PROJECT", 2, ApprovalStatus.APPROVED)])).toBe(true);
  });
});

describe("mixed rejected batch revision", () => {
  it("allows remaining unposted quantities without reopening posted quantities", () => {
    expect(isReturnBatchEditable("REJECTED", true, true, true)).toBe(true);
    expect(isReturnBatchEditable("REJECTED", true, false, true)).toBe(false);
    expect(isReturnBatchEditable("SUBMITTED", true, true, false)).toBe(false);
    expect(isReturnBatchEditable("COMPLETED", false, true, false)).toBe(false);
  });
});

describe("legacy migration guard", () => {
  it("blocks legacy missing batch records without affecting registered rounds", () => {
    expect(needsReturnBatchMigration([], ["old-unmigrated"])).toBe(true);
    expect(needsReturnBatchMigration(["new-migrated"], ["new-migrated"])).toBe(false);
    expect(needsReturnBatchMigration(["new-migrated"], [null])).toBe(true);
    expect(needsReturnBatchMigration([], [])).toBe(false);
  });
});
