import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetCondition, AssetStatus } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";

const mocks = vi.hoisted(() => {
  const delegate = () => ({ findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() });
  return { tx: { transaction: delegate(), transactionItem: delegate(), transactionItemOutcome: delegate(), transactionApproval: delegate(), returnBatch: delegate(), returnBatchEvidence: delegate(), asset: delegate(), assetStatusHistory: delegate(), user: delegate(), project: delegate(), assetReservation: delegate(), warehouseManagerAssignment: delegate(), $queryRaw: vi.fn(), $executeRaw: vi.fn() }, number: vi.fn() };
});
vi.mock("@/lib/db", () => ({ db: { ...mocks.tx, $transaction: (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx) } }));
vi.mock("@/lib/permissions", () => ({ assertCanViewWarehouse: vi.fn(), assertCanRequestWarehouse: vi.fn(), assertCanChangeAssetStatus: vi.fn(), canManageWarehouseForUser: () => true, hasAnyRole: () => false }));
vi.mock("@/lib/approval-flow", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, approvalMatchesUser: (user: { id: string }, approval: { userId: string }) => user.id === approval.userId };
});
vi.mock("@/lib/requisition-no", () => ({ createMonthlyRequisitionNo: mocks.number, MonthlyRequisitionLimitError: class extends Error {} }));

import { approveTransaction, cancelReturnBatch, deletePendingReturnOutcome, getTransactionResolutionForUser, migrateLegacyReturnBatch, rejectTransaction, resolveTransactionItems } from "@/lib/workflow";

const user = { id: "requester", name: "Requester", signatureDataUrl: "signature", roles: [], organizationAssignments: [], permissions: [] } as unknown as CurrentUser;
const storeman = { ...user, id: "storeman" };
const asset = (id = "asset", warehouse = "A", serialized = false) => ({ id, assetModelId: "model", warehouseId: warehouse, stockCode: "LAN001", serialNo: serialized ? "SERIAL" : null, status: serialized ? "BORROW" : "READY", condition: "NEW", assetQuantity: 70, assetModel: { id: "model", isSerialized: serialized, name: "LAN" }, warehouse: { code: warehouse } });
const item = (id = "item", warehouse = "A", serialized = false) => ({ id, assetId: id === "item" ? "asset" : id, requestedQuantity: serialized ? 1 : 30, returnedAt: null, dispatchedAt: new Date(), toStatus: "BORROW", soldPrice: null, asset: asset(id === "item" ? "asset" : id, warehouse, serialized) });
const approval = (tag: string, status = "PENDING", sequence = 4, actor = "storeman") => ({ id: tag, requiredTag: tag, status, stepSequence: sequence, userId: actor, resolutionBatchId: "batch", isCurrent: true });
const outcome = (status = "FAIL", quantity = 10, id = "outcome", sourceItem = item()) => ({ id, transactionId: "source", transactionItemId: sourceItem.id, resolutionBatchId: "batch", outcomeStatus: status, quantity, approvedAt: null as Date | null, soldTransactionId: null as string | null, returnCondition: status === "READY" ? "NEW" : null, assetId: sourceItem.assetId, checks: [{ userId: "storeman" }], transactionItem: sourceItem });
let source: ReturnType<typeof makeSource>;
function makeSource() {
  return { id: "source", requestedBy: { id: "requester", name: "Requester" }, requestedById: "requester", sourceTransactionId: null, type: "BORROW", status: "BORROWED", workflowStatus: "IN_PROGRESS", projectRequest: true, projectId: "project", project: { leadUser: { id: "lead" }, members: [] }, purpose: "Project", transactionNo: "REQ-20261005-01", approvals: [approval("STOREMAN:A")], items: [item()], outcomeRecords: [outcome()] };
}

describe("workflow return accounting and final gates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    source = makeSource();
    mocks.tx.transaction.findUnique.mockImplementation(async () => source);
    mocks.tx.transaction.findUniqueOrThrow.mockImplementation(async () => source);
    mocks.tx.transaction.count.mockResolvedValue(0);
    mocks.tx.transactionItem.count.mockResolvedValue(1);
    mocks.tx.transactionItemOutcome.count.mockResolvedValue(0);
    mocks.tx.transactionItemOutcome.aggregate.mockResolvedValue({ _sum: { quantity: 10 } });
    mocks.tx.transactionApproval.count.mockResolvedValue(1);
    mocks.tx.transactionApproval.findFirst.mockResolvedValue(null);
    mocks.tx.transactionApproval.findMany.mockResolvedValue([approval("RETURN_CHECK:A", "APPROVED", 3), approval("STOREMAN:A")]);
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([outcome()]);
    mocks.tx.returnBatch.findFirst.mockResolvedValue({ id: "batch", state: "SUBMITTED", revision: 1, signedPdf: Buffer.from("%PDF-"), signedAt: new Date(), signedById: "storeman" });
    mocks.tx.returnBatch.findMany.mockResolvedValue([{ id: "batch" }]);
    mocks.tx.asset.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.asset.findUnique.mockResolvedValue({ note: "Existing remark" });
    mocks.tx.asset.findUniqueOrThrow.mockResolvedValue({ note: "Existing remark" });
    mocks.tx.project.findFirst.mockResolvedValue({ leadUser: { id: "lead", name: "Lead" }, members: [] });
    mocks.tx.user.findMany.mockResolvedValue([{ id: "storeman", name: "Storeman" }]);
    mocks.tx.user.findFirst.mockResolvedValue({ ...user, organizationAssignments: [], roles: [], warehousePermissions: [], signatureUploadedBy: null });
    mocks.number.mockResolvedValue("REQ-20261005-02");
  });

  it.each([{ roles: [] }, { roles: ["ADMIN"] }])("rejects return submission by a non-requester with roles $roles", async ({ roles }) => {
    const otherUser = { ...user, id: "other-user", roles } as unknown as CurrentUser;
    await expect(resolveTransactionItems(otherUser, { transactionId: "source", items: [{ itemId: "item", quantity: 1, toStatus: AssetStatus.READY }] })).rejects.toThrow();
    expect(mocks.tx.returnBatch.create).not.toHaveBeenCalled();
    expect(mocks.tx.transactionItemOutcome.createMany).not.toHaveBeenCalled();
    expect(mocks.tx.asset.updateMany).not.toHaveBeenCalled();
  });

  it("rejects final approval without all per-outcome checks", async () => {
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([{ ...outcome(), checks: [] }]);
    await expect(approveTransaction(storeman, "source")).rejects.toMatchObject({ code: "RETURN_CHECKS_REQUIRED" });
    expect(mocks.tx.transactionApproval.update).not.toHaveBeenCalled();
    expect(mocks.tx.asset.updateMany).not.toHaveBeenCalled();
  });

  it.each(["FAIL", "LOST"])("requires signed evidence for %s", async (status) => {
    mocks.tx.returnBatch.findFirst.mockResolvedValue({ id: "batch", state: "SUBMITTED" });
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([outcome(status)]);
    await expect(approveTransaction(storeman, "source")).rejects.toMatchObject({ code: "SIGNED_RETURN_PDF_REQUIRED" });
  });

  it("requires signed evidence for USED even though its asset status is READY", async () => {
    mocks.tx.returnBatch.findFirst.mockResolvedValue({ id: "batch", state: "SUBMITTED" });
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([{ ...outcome("READY"), returnCondition: "USED" }]);
    await expect(approveTransaction(storeman, "source")).rejects.toMatchObject({ code: "SIGNED_RETURN_PDF_REQUIRED" });
  });

  it.each(["READY", "SOLD"])("does not require damage evidence for %s alone", async (status) => {
    mocks.tx.returnBatch.findFirst.mockResolvedValue({ id: "batch", state: "SUBMITTED" });
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([outcome(status)]);
    await approveTransaction(storeman, "source");
    expect(mocks.tx.transactionApproval.update).toHaveBeenCalledTimes(1);
  });

  it("never posts warehouse A while warehouse B remains pending", async () => {
    source.approvals.push(approval("STOREMAN:B", "PENDING", 4, "storeman-b"));
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([outcome("READY")]);
    await approveTransaction(storeman, "source");
    expect(mocks.tx.transactionApproval.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.asset.update).not.toHaveBeenCalled();
    expect(mocks.tx.asset.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.transactionItemOutcome.update).not.toHaveBeenCalled();
  });

  it("posts FAIL quantities without changing on-hand or the whole pool status", async () => {
    mocks.tx.transactionApproval.count.mockResolvedValue(0);
    mocks.tx.transactionApproval.findMany.mockResolvedValue([approval("RETURN_CHECK:A", "APPROVED", 3), approval("STOREMAN:A", "APPROVED")]);
    await approveTransaction(storeman, "source");
    expect(mocks.tx.asset.update).toHaveBeenCalledWith({ where: { id: "asset" }, data: { note: expect.stringContaining("Existing remark\n[return-outcome:outcome] FAIL 10"), updatedById: "storeman" } });
    expect(mocks.tx.asset.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.assetStatusHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ stockCode: "LAN001", quantityBefore: 70, quantityAfter: 70, quantityChanged: 0, note: expect.stringContaining("FAIL 10 from REQ-20261005-01") }) });
    expect(mocks.tx.transactionItem.update).toHaveBeenCalledWith({ where: { id: "item" }, data: expect.objectContaining({ returnedAt: null }) });
    expect(mocks.tx.transaction.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workflowStatus: "IN_PROGRESS", returnedAt: null }) }));
  });

  it.each([false, true])("retains split quantities with model isSerialized=%s and no serial number", async (isSerialized) => {
    source.items[0].asset.assetModel.isSerialized = isSerialized;
    source.outcomeRecords = [];
    source.approvals = [];
    mocks.tx.returnBatch.findMany.mockResolvedValue([]);
    await resolveTransactionItems(user, { transactionId: "source", items: [{ itemId: "item", toStatus: AssetStatus.READY, allocations: [{ toStatus: AssetStatus.READY, quantity: 2 }, { toStatus: AssetStatus.READY, quantity: 3, returnCondition: AssetCondition.USED }, { toStatus: AssetStatus.FAIL, quantity: 10 }] }] });
    const rows = mocks.tx.transactionItemOutcome.createMany.mock.calls[0][0].data;
    expect(rows.map((row: { quantity: number }) => row.quantity)).toEqual([2, 3, 10]);
    expect(rows[1].returnCondition).toBe("USED");
    expect(new Set(rows.map((row: { resolutionBatchId: string }) => row.resolutionBatchId)).size).toBe(1);
    expect(mocks.tx.returnBatch.create).toHaveBeenCalledWith({ data: expect.objectContaining({ requestNo: "FROM REQ-20261005-01", transactionId: "source" }) });
    expect(mocks.number).not.toHaveBeenCalled();
    expect(mocks.tx.transactionApproval.create).toHaveBeenCalledWith({ data: expect.objectContaining({ requiredTag: "REQUESTER", stepSequence: 1, status: "APPROVED", approverSignatureSnapshot: "signature" }) });
  });

  it("rejects quantities exceeding posted plus active pending allocations", async () => {
    source.outcomeRecords = [{ ...outcome("READY", 10), approvedAt: new Date() }, outcome("FAIL", 15)] as typeof source.outcomeRecords;
    await expect(resolveTransactionItems(user, { transactionId: "source", items: [{ itemId: "item", quantity: 6, toStatus: AssetStatus.READY }] })).rejects.toThrow("cannot exceed");
    expect(mocks.tx.returnBatch.create).not.toHaveBeenCalled();
  });

  it("does not autoapprove a different phase held by the same user", async () => {
    source.approvals = [approval("LEAD_PROJECT", "PENDING", 2), approval("STOREMAN:A")];
    source.project.leadUser.id = "storeman";
    await approveTransaction(storeman, "source");
    expect(mocks.tx.transactionApproval.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.transactionApproval.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "LEAD_PROJECT" } }));
  });

  it("cancels one batch without deleting outcomes, comments or cancelling the source", async () => {
    await cancelReturnBatch(user, "source", "batch");
    expect(mocks.tx.returnBatch.update).toHaveBeenCalledWith({ where: { id: "batch" }, data: { state: "CANCELLED" } });
    expect(mocks.tx.transactionApproval.updateMany).toHaveBeenCalledWith({ where: { transactionId: "source", resolutionBatchId: "batch", isCurrent: true }, data: { isCurrent: false } });
    expect(mocks.tx.transactionItemOutcome.deleteMany).not.toHaveBeenCalled();
    expect(mocks.tx.transaction.update.mock.calls.every(([args]) => args.data.workflowStatus !== "CANCELLED")).toBe(true);
  });

  it("locks requester removal after the first lead approval", async () => {
    mocks.tx.transactionItemOutcome.findFirst.mockResolvedValue({ ...outcome(), transaction: { requestedById: "requester" } });
    mocks.tx.transactionApproval.findFirst.mockResolvedValue(approval("LEAD_PROJECT", "APPROVED", 2, "lead"));
    await expect(deletePendingReturnOutcome(user, { transactionId: "source", outcomeId: "outcome" })).rejects.toMatchObject({ code: "RETURN_LEAD_ALREADY_APPROVED" });
    expect(mocks.tx.transactionItemOutcome.delete).not.toHaveBeenCalled();
  });

  it("retires only warehouse approvals no longer represented after removal", async () => {
    mocks.tx.transactionItemOutcome.findFirst.mockResolvedValue({ ...outcome(), transaction: { requestedById: "requester" } });
    mocks.tx.transactionItemOutcome.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([outcome("READY", 2, "remaining", item("other", "B"))]);
    await deletePendingReturnOutcome(user, { transactionId: "source", outcomeId: "outcome" });
    expect(mocks.tx.transactionApproval.updateMany).toHaveBeenCalledWith({
      where: {
        transactionId: "source", resolutionBatchId: "batch", isCurrent: true,
        AND: [
          { OR: [{ requiredTag: { startsWith: "RETURN_CHECK:" } }, { requiredTag: { startsWith: "STOREMAN:" } }] },
          { requiredTag: { notIn: ["RETURN_CHECK:B", "STOREMAN:B"] } },
        ],
      },
      data: { isCurrent: false },
    });
    expect(mocks.tx.returnBatch.update).not.toHaveBeenCalled();
    expect(mocks.tx.asset.update).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "REJECTED"])("preserves other sold allocations when removing one from a %s sale", async (status) => {
    mocks.tx.transactionItemOutcome.findFirst.mockResolvedValue({ ...outcome("SOLD", 1), soldTransactionId: "sale", soldTransaction: { id: "sale", workflowStatus: status }, transaction: { requestedById: "requester" } });
    mocks.tx.transactionItemOutcome.aggregate.mockResolvedValue({ _sum: { quantity: 2 } });
    mocks.tx.transactionItem.findFirst.mockResolvedValue({ id: "sale-item" });
    mocks.tx.transactionItemOutcome.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    await deletePendingReturnOutcome(user, { transactionId: "source", outcomeId: "outcome" });
    expect(mocks.tx.transactionItemOutcome.aggregate).toHaveBeenCalledWith({
      where: { soldTransactionId: "sale", transactionItemId: "item", approvedAt: null, id: { not: "outcome" } },
      _sum: { quantity: true },
    });
    expect(mocks.tx.transactionItem.update).toHaveBeenCalledWith({ where: { id: "sale-item" }, data: { requestedQuantity: 2 } });
    expect(mocks.tx.transactionItem.delete).not.toHaveBeenCalled();
    expect(mocks.tx.asset.update).not.toHaveBeenCalled();
  });

  it("fails closed for an operational item with no asset and never repairs history on reads", async () => {
    source.items[0].asset = null as unknown as typeof source.items[0]["asset"];
    await expect(getTransactionResolutionForUser(user, "source")).rejects.toMatchObject({ code: "TRANSACTION_ASSET_MISSING" });
    expect(mocks.tx.transactionApproval.createMany).not.toHaveBeenCalled();
    expect(mocks.tx.transactionItemOutcome.updateMany).not.toHaveBeenCalled();
  });

  it("rejects direct BSD sale approval without a price for every item", async () => {
    mocks.tx.transaction.findUnique.mockResolvedValue({ ...source, type: "SOLD", workflowStatus: "PENDING", outcomeRecords: [], approvals: [{ ...approval("BSD_STAFF", "PENDING", 5), resolutionBatchId: null }] });
    await expect(approveTransaction(storeman, "source")).rejects.toMatchObject({ code: "SOLD_PRICE_REQUIRED" });
    expect(mocks.tx.asset.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.transactionApproval.update).not.toHaveBeenCalled();
  });

  it("cannot approve a derived BSD sale before the source batch final warehouse gate", async () => {
    mocks.tx.transaction.findUnique.mockResolvedValue({ ...source, id: "sale", type: "SOLD", sourceTransactionId: "source", workflowStatus: "PENDING", outcomeRecords: [], approvals: [approval("BSD_STAFF", "PENDING", 2)] });
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([outcome("SOLD", 4)]);
    await expect(approveTransaction(storeman, "sale", { prices: { item: "100" } })).rejects.toMatchObject({ code: "RETURN_FINAL_APPROVAL_REQUIRED" });
    expect(mocks.tx.transactionItem.update).not.toHaveBeenCalled();
    expect(mocks.tx.asset.updateMany).not.toHaveBeenCalled();
  });

  it.each([false, true])("reuses a USED quantity bucket with model isSerialized=%s and no serial number", async (isSerialized) => {
    source.items[0].asset.assetModel.isSerialized = isSerialized;
    source.outcomeRecords = [{ ...outcome("READY", 3, "outcome", source.items[0]), returnCondition: "USED", assetId: "reuse-code" }];
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue(source.outcomeRecords);
    mocks.tx.transactionApproval.count.mockResolvedValue(0);
    mocks.tx.transactionApproval.findMany.mockResolvedValue([approval("RETURN_CHECK:A", "APPROVED", 3), approval("STOREMAN:A", "APPROVED")]);
    mocks.tx.asset.findFirst.mockResolvedValueOnce({ id: "reuse-code", assetModelId: "model", stockCode: "LAN002" }).mockResolvedValueOnce({ id: "reuse-bucket", assetQuantity: 0 });
    mocks.tx.asset.update.mockResolvedValue({ id: "reuse-bucket" });
    await approveTransaction(storeman, "source");
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.asset.findFirst.mock.invocationCallOrder[1]);
    expect(mocks.tx.asset.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "reuse-bucket" }, data: expect.objectContaining({ assetQuantity: { increment: 3 } }) }));
    expect(mocks.tx.asset.create).not.toHaveBeenCalled();
    expect(mocks.tx.asset.update).toHaveBeenCalledWith({ where: { id: "reuse-bucket" }, data: {
      note: "Existing remark\n[return-outcome:outcome] USED 3 from REQ-20261005-01", updatedById: "storeman",
    } });
    expect(mocks.tx.assetStatusHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ stockCode: "LAN002", condition: "USED", quantityBefore: 0, quantityAfter: 3 }) });
  });

  it("creates only a missing condition bucket using an existing canonical code", async () => {
    source.outcomeRecords = [{ ...outcome("READY", 3), returnCondition: "USED", assetId: "code" }];
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue(source.outcomeRecords);
    mocks.tx.transactionApproval.count.mockResolvedValue(0);
    mocks.tx.transactionApproval.findMany.mockResolvedValue([approval("RETURN_CHECK:A", "APPROVED", 3), approval("STOREMAN:A", "APPROVED")]);
    mocks.tx.asset.findFirst.mockResolvedValueOnce({ id: "code", assetModelId: "model", stockCode: "LAN002" }).mockResolvedValueOnce(null);
    mocks.tx.asset.create.mockResolvedValue({ id: "new-used-bucket" });
    await approveTransaction(storeman, "source");
    expect(mocks.tx.asset.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assetModelId: "model", warehouseId: "A", stockCode: "LAN002", condition: "USED", assetQuantity: 3 }) }));
  });

  it("does not increment old reservation-only quantity loans", async () => {
    source.items[0].dispatchedAt = null as unknown as Date;
    source.outcomeRecords = [outcome("READY", 3)];
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue(source.outcomeRecords);
    mocks.tx.transactionApproval.count.mockResolvedValue(0);
    mocks.tx.transactionApproval.findMany.mockResolvedValue([approval("RETURN_CHECK:A", "APPROVED", 3), approval("STOREMAN:A", "APPROVED")]);
    await approveTransaction(storeman, "source");
    expect(mocks.tx.asset.update).not.toHaveBeenCalled();
    expect(mocks.tx.assetStatusHistory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ quantityBefore: 70, quantityAfter: 70, quantityChanged: 0 }) });
  });

  it("does not duplicate a FAIL remark already recorded for an outcome", async () => {
    mocks.tx.transactionApproval.count.mockResolvedValue(0);
    mocks.tx.transactionApproval.findMany.mockResolvedValue([approval("RETURN_CHECK:A", "APPROVED", 3), approval("STOREMAN:A", "APPROVED")]);
    mocks.tx.asset.findUnique.mockResolvedValue({ note: "Existing\n[return-outcome:outcome] FAIL 10" });
    await approveTransaction(storeman, "source");
    expect(mocks.tx.asset.update).not.toHaveBeenCalled();
  });

  it("rejects a repeat final action without a second stock posting", async () => {
    source.approvals = [approval("STOREMAN:A", "APPROVED")];
    await expect(approveTransaction(storeman, "source")).rejects.toThrow("not pending approval");
    expect(mocks.tx.asset.update).not.toHaveBeenCalled();
    expect(mocks.tx.asset.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.transactionItemOutcome.update).not.toHaveBeenCalled();
  });

  it("revises only the unposted subset of a rejected mixed batch and archives signed evidence", async () => {
    source.outcomeRecords = [{ ...outcome("READY", 10, "posted"), approvedAt: new Date() }, { ...outcome("SOLD", 4, "pending"), soldTransactionId: "old-sale" }] as typeof source.outcomeRecords;
    mocks.tx.returnBatch.findFirst.mockResolvedValue({ id: "batch", requestNo: "REQ-20261005-02", state: "REJECTED", revision: 1, damagePdf: Buffer.from("damage"), signedPdf: Buffer.from("signed"), signedFilename: "signed.pdf", signedById: "storeman", signedAt: new Date() });
    mocks.tx.transactionItemOutcome.count.mockResolvedValue(1);
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([{ soldTransactionId: "old-sale" }]);
    await resolveTransactionItems(user, { transactionId: "source", resolutionBatchId: "batch", items: [{ itemId: "item", toStatus: AssetStatus.FAIL, quantity: 4 }] });
    expect(mocks.number).not.toHaveBeenCalled();
    expect(mocks.tx.returnBatchEvidence.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ batchId: "batch", revision: 1, signedFilename: "signed.pdf" })], skipDuplicates: true });
    expect(mocks.tx.transactionItemOutcome.deleteMany).toHaveBeenCalledWith({ where: { resolutionBatchId: "batch", approvedAt: null } });
    expect(mocks.tx.transactionItemOutcome.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ quantity: 4, outcomeStatus: "FAIL" })]);
    expect(mocks.tx.asset.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.returnBatchEvidence.createMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.tx.returnBatch.update.mock.invocationCallOrder[0]);
  });

  it("BSD rejection reopens only the pending sold batch and never reverses posted stock", async () => {
    const sale = { ...source, id: "sale", sourceTransactionId: "source", type: "SOLD", workflowStatus: "PENDING", approvals: [approval("BSD_STAFF", "PENDING", 2)], outcomeRecords: [] };
    mocks.tx.transaction.findUnique.mockResolvedValue(sale);
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([{ resolutionBatchId: "batch" }]);
    await rejectTransaction(storeman, "sale", { reason: "Correct the sold quantity" });
    expect(mocks.tx.returnBatch.update).toHaveBeenCalledWith({ where: { id: "batch" }, data: { state: "REJECTED" } });
    expect(mocks.tx.transaction.update).toHaveBeenCalledWith({ where: { id: "sale" }, data: expect.objectContaining({ completedAt: null, workflowStatus: "REJECTED" }) });
    expect(mocks.tx.asset.update).not.toHaveBeenCalled();
    expect(mocks.tx.asset.updateMany).not.toHaveBeenCalled();
  });

  it("legacy metadata migration requires an explicit condition and never replays stock", async () => {
    const pending = { ...outcome("READY", 3), returnCondition: null };
    mocks.tx.returnBatch.findFirst.mockResolvedValue(null);
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([pending]);
    mocks.tx.transactionApproval.count.mockResolvedValue(0);
    await expect(migrateLegacyReturnBatch("source", "batch", ["outcome"])).rejects.toMatchObject({ code: "LEGACY_CONDITION_REQUIRED" });
    await migrateLegacyReturnBatch("source", "batch", ["outcome"], { outcome: AssetCondition.NEW });
    expect(mocks.tx.transactionItemOutcome.update).toHaveBeenCalledWith({ where: { id: "outcome" }, data: { returnCondition: "NEW", assetId: "asset" } });
    expect(mocks.tx.transactionApproval.updateMany).toHaveBeenCalledWith({ where: { transactionId: "source", resolutionBatchId: "batch", isCurrent: true }, data: { isCurrent: false } });
    expect(mocks.tx.asset.update).not.toHaveBeenCalled();
    expect(mocks.tx.asset.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.transactionItem.update).not.toHaveBeenCalled();
  });

  it("refuses SOLD or already-posted legacy outcomes", async () => {
    mocks.tx.returnBatch.findFirst.mockResolvedValue(null);
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([outcome("SOLD", 3)]);
    await expect(migrateLegacyReturnBatch("source", "batch", ["outcome"], { outcome: AssetCondition.NEW })).rejects.toMatchObject({ code: "LEGACY_BATCH_MISMATCH" });
    mocks.tx.transactionItemOutcome.findMany.mockResolvedValue([{ ...outcome("READY", 3), approvedAt: new Date() }]);
    await expect(migrateLegacyReturnBatch("source", "batch", ["outcome"], { outcome: AssetCondition.NEW })).rejects.toMatchObject({ code: "LEGACY_BATCH_MISMATCH" });
    expect(mocks.tx.returnBatch.create).not.toHaveBeenCalled();
  });
});
