import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalStatus } from "@prisma/client";
import type { CurrentUser } from "./auth";
import { getPendingApprovalsForUser } from "./transaction-log";

const mocks = vi.hoisted(() => ({ batches: vi.fn(), approvals: vi.fn(), outcomes: vi.fn() }));
vi.mock("./db", () => ({ db: {
  returnBatch: { findMany: mocks.batches },
  transactionApproval: { findMany: mocks.approvals },
  transactionItemOutcome: { findMany: mocks.outcomes },
} }));

const user = { id: "lead", permissions: [], roles: [], organizationAssignments: [] } as unknown as CurrentUser;
function row(tag = "SUPERVISOR", batchId: string | null = "round") {
  return {
    id: "approval", userId: "lead", requiredTag: tag, status: ApprovalStatus.PENDING,
    resolutionBatchId: batchId, stepSequence: 2, user: { id: "lead", name: "Lead" },
    transaction: { id: "source", workflowStatus: "IN_PROGRESS", project: null,
      approvals: [], items: [{ id: "returned", requestedQuantity: 6 }, { id: "still-used", requestedQuantity: 2 }],
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.batches.mockResolvedValue([{ id: "round", transactionId: "source", state: "SUBMITTED", requestNo: "REQ-20261005-06", createdAt: new Date("2026-10-05") }]);
  mocks.outcomes.mockResolvedValue([{ resolutionBatchId: "round", transactionItemId: "returned", quantity: 1 }]);
});

describe("approval queue return rounds", () => {
  it("includes an active return on an in-use source and scopes items to the returned quantity", async () => {
    mocks.approvals.mockResolvedValue([row()]);
    const results = await getPendingApprovalsForUser(user);
    expect(results[0].returnRound?.requestNo).toBe("REQ-20261005-06");
    expect(results[0].transaction.items).toEqual([{ id: "returned", requestedQuantity: 1 }]);
    expect(mocks.approvals.mock.calls[1][0].where).toMatchObject({ isCurrent: true, OR: expect.arrayContaining([{ resolutionBatchId: { in: ["round"] } }]) });
    expect(mocks.approvals.mock.calls[1][0].select.transaction.select.approvals.where).toEqual({ isCurrent: true });
  });
  it("does not let pending approvals in another round block this round", async () => {
    const approval = row();
    (approval.transaction.approvals as unknown[]).push({ resolutionBatchId: "other", stepSequence: 1, status: ApprovalStatus.PENDING, requiredTag: "SUPERVISOR" });
    mocks.approvals.mockResolvedValue([approval]);
    expect(await getPendingApprovalsForUser(user)).toHaveLength(1);
  });
  it("blocks a later step until the lead in the same round approves", async () => {
    const approval = row("STOREMAN:INSTALLATION");
    approval.stepSequence = 4;
    (approval.transaction.approvals as unknown[]).push({ resolutionBatchId: "round", stepSequence: 2, status: ApprovalStatus.PENDING, requiredTag: "SUPERVISOR" });
    mocks.approvals.mockResolvedValue([approval]);
    expect(await getPendingApprovalsForUser(user)).toEqual([]);
  });
  it("excludes rejected, cancelled, completed or unregistered rounds", async () => {
    mocks.batches.mockResolvedValue([]);
    mocks.approvals.mockResolvedValue([row()]);
    expect(await getPendingApprovalsForUser(user)).toEqual([]);
    expect(mocks.batches).toHaveBeenCalledWith(expect.objectContaining({ where: { state: { in: ["SUBMITTED", "COMPLETED"] } } }));
  });
  it("does not expose approvals assigned to another user", async () => {
    mocks.approvals.mockResolvedValue([{ ...row(), userId: "other" }]);
    expect(await getPendingApprovalsForUser(user)).toEqual([]);
  });
  it("does not gate acknowledgement on operational approvals", async () => {
    const approval = row("ACK_BSD", null);
    approval.stepSequence = 8;
    (approval.transaction.approvals as unknown[]).push({ resolutionBatchId: null, stepSequence: 2, status: ApprovalStatus.PENDING, requiredTag: "SUPERVISOR" });
    mocks.approvals.mockResolvedValue([approval]);
    expect(await getPendingApprovalsForUser(user)).toHaveLength(1);
  });

  it("shows pending BSD sale pricing after the source return round completes", async () => {
    mocks.batches.mockResolvedValue([{ id: "round", transactionId: "source", state: "COMPLETED" }]);
    const approval = { ...row("BSD_HELP_DESK"), transaction: { ...row().transaction, id: "sale", sourceTransactionId: "source", type: "SOLD", workflowStatus: "PENDING" } };
    mocks.approvals.mockResolvedValueOnce([
      { transactionId: "source", resolutionBatchId: "round", requiredTag: "LEAD_PROJECT", status: ApprovalStatus.APPROVED },
      { transactionId: "source", resolutionBatchId: "round", requiredTag: "STOREMAN:A", status: ApprovalStatus.APPROVED },
    ]).mockResolvedValue([approval]);
    const results = await getPendingApprovalsForUser(user);
    expect(results).toHaveLength(1);
    expect(results[0].transaction.id).toBe("sale");
    expect(results[0].requiredTag).toBe("BSD_HELP_DESK");
    expect(mocks.approvals.mock.calls[1][0].where.OR[0]).toEqual({ resolutionBatchId: { in: [] } });
  });

  it.each(["SUBMITTED", "COMPLETED"])("keeps sale pricing hidden until all source warehouses approve (%s)", (state) => {
    mocks.batches.mockResolvedValue([{ id: "round", transactionId: "source", state }]);
    const approval = { ...row("BSD_HELP_DESK"), transaction: { ...row().transaction, id: "sale", sourceTransactionId: "source", type: "SOLD", workflowStatus: "PENDING" } };
    mocks.approvals.mockResolvedValueOnce([
      { transactionId: "source", resolutionBatchId: "round", requiredTag: "STOREMAN:A", status: ApprovalStatus.APPROVED },
      { transactionId: "source", resolutionBatchId: "round", requiredTag: "STOREMAN:B", status: ApprovalStatus.PENDING },
    ]).mockResolvedValue([approval]);
    return expect(getPendingApprovalsForUser(user)).resolves.toEqual([]);
  });

  it.each(["REJECTED", "CANCELLED", "COMPLETED"])("excludes stale source approvals on a %s round", async (state) => {
    mocks.batches.mockResolvedValue([{ id: "round", transactionId: "source", state }]);
    mocks.approvals.mockResolvedValue([row()]);
    expect(await getPendingApprovalsForUser(user)).toEqual([]);
  });

  it("does not expose a completed round's sale to another user", async () => {
    mocks.batches.mockResolvedValue([{ id: "round", transactionId: "source", state: "COMPLETED" }]);
    mocks.approvals.mockResolvedValueOnce([
      { transactionId: "source", resolutionBatchId: "round", requiredTag: "STOREMAN:A", status: ApprovalStatus.APPROVED },
    ]).mockResolvedValue([{ ...row("BSD_HELP_DESK"), userId: "other", transaction: { ...row().transaction, id: "sale", sourceTransactionId: "source", type: "SOLD", workflowStatus: "PENDING" } }]);
    expect(await getPendingApprovalsForUser(user)).toEqual([]);
  });
});
