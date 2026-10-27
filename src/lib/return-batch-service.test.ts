import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";

const mocks = vi.hoisted(() => ({ batch: vi.fn(), outcomes: vi.fn(), approvals: vi.fn(), update: vi.fn(), checks: vi.fn(), noteUpdate: vi.fn(), target: vi.fn() }));
vi.mock("@/lib/db", () => {
  const tx = { returnBatch: { findFirst: mocks.batch, update: mocks.update }, transactionItemOutcome: { findMany: mocks.outcomes }, transactionApproval: { findMany: mocks.approvals }, returnOutcomeCheck: { create: mocks.checks, update: mocks.noteUpdate } };
  const client = { ...tx, asset: { findFirst: mocks.target } };
  return { db: { ...client, $transaction: (fn: (transaction: typeof client) => unknown) => fn(client) } };
});
vi.mock("@/lib/workflow", () => ({ WorkflowError: class extends Error { constructor(message: string, public statusCode: number, public code: string) { super(message); } } }));
vi.mock("@/lib/return-damage-pdf", () => ({ buildDamagePdf: vi.fn() }));

import { checkReturnOutcomes, getDamageDocument, getSignedReturnDocument, uploadSignedReturnDocument, saveReturnInspectionNotes } from "@/lib/return-batch-service";

const user = { id: "a", name: "Storeman A", signatureDataUrl: "signature", organizationAssignments: [], permissions: [{ warehouseCode: "A", canManage: true, canView: true }] } as unknown as CurrentUser;
const approval = (tag: string, status = "PENDING", stepSequence = 3) => ({ id: tag, requiredTag: tag, userId: "a", status, stepSequence });

describe("return batch gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batch.mockResolvedValue({ id: "batch", state: "SUBMITTED" });
    mocks.outcomes.mockResolvedValue([{ id: "outcome", outcomeStatus: "FAIL", returnCondition: null, approvedAt: null, checks: [], transactionItem: { asset: { warehouse: { code: "B" } } } }]);
    mocks.approvals.mockResolvedValue([approval("RETURN_CHECK:A"), approval("STOREMAN:A", "PENDING", 4)]);
  });

  it("cannot check another warehouse's outcome", async () => {
    await expect(checkReturnOutcomes(user, "source", "batch", ["outcome"], {})).rejects.toMatchObject({ code: "RETURN_CHECK_SCOPE" });
    expect(mocks.checks).not.toHaveBeenCalled();
  });

  it("returns the exact uploaded PDF after completion", async () => {
    const pdf = Buffer.from("%PDF-uploaded-fixture");
    mocks.batch.mockResolvedValue({ id: "batch", state: "COMPLETED", transaction: { requestedById: "requester" }, signedPdf: pdf, signedFilename: "signed.pdf" });
    await expect(getSignedReturnDocument("source", "batch")).resolves.toEqual({ pdf, filename: "signed.pdf" });
  });

  it("reads the uploaded PDF without requiring an approval assignment", async () => {
    const pdf = Buffer.from("%PDF-shared");
    mocks.batch.mockResolvedValue({ signedPdf: pdf, signedFilename: null });
    await expect(getSignedReturnDocument("source", "batch")).resolves.toEqual({ pdf, filename: "signed-return.pdf" });
    expect(mocks.batch).toHaveBeenCalledWith({ where: { id: "batch", transactionId: "source" }, select: { signedPdf: true, signedFilename: true } });
    expect(mocks.approvals).not.toHaveBeenCalled();
  });

  it("returns not found when the batch does not belong to the transaction", async () => {
    mocks.batch.mockResolvedValue(null);
    await expect(getSignedReturnDocument("source", "batch")).rejects.toMatchObject({ statusCode: 404, code: "RETURN_BATCH_NOT_FOUND" });
  });

  it("returns not found when no PDF has been uploaded", async () => {
    mocks.batch.mockResolvedValue({ signedPdf: null });
    await expect(getSignedReturnDocument("source", "batch")).rejects.toMatchObject({ statusCode: 404, code: "SIGNED_DOCUMENT_NOT_FOUND" });
  });

  it("requires an existing READY USED bucket for the same model and warehouse", async () => {
    mocks.outcomes.mockResolvedValue([{ id: "outcome", outcomeStatus: "READY", returnCondition: "USED", approvedAt: null, checks: [], transactionItem: { asset: { id: "new-stock", assetModelId: "model", warehouseId: "warehouse", serialNo: null, assetModel: { isSerialized: false }, warehouse: { code: "A" } } } }]);
    mocks.target.mockResolvedValue(null);
    await expect(checkReturnOutcomes(user, "source", "batch", ["outcome"], { outcome: "target" })).rejects.toMatchObject({ code: "INVALID_RETURN_STOCK_TARGET" });
    expect(mocks.target).toHaveBeenCalledWith({ where: expect.objectContaining({ id: "target", assetModelId: "model", warehouseId: "warehouse", condition: "USED", status: "READY" }) });
    expect(mocks.checks).not.toHaveBeenCalled();
  });

  it("cannot edit another warehouse's inspection note", async () => {
    await expect(saveReturnInspectionNotes(user, "source", "batch", { outcome: "Lost during transport" })).rejects.toMatchObject({ code: "INSPECTION_NOTE_SCOPE" });
    expect(mocks.noteUpdate).not.toHaveBeenCalled();
  });

  it("saves the verifying Storeman's note separately and invalidates the PDF", async () => {
    mocks.outcomes.mockResolvedValue([{ id: "outcome", note: "Requester remark", approvedAt: null, checks: [{ id: "check", userId: "a" }], transactionItem: { asset: { warehouse: { code: "A" } } } }]);
    await saveReturnInspectionNotes(user, "source", "batch", { outcome: "  Lost during transport  " });
    expect(mocks.noteUpdate).toHaveBeenCalledWith({ where: { id: "check" }, data: { note: "Lost during transport" } });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "batch" }, data: { damagePdf: null, revision: { increment: 1 } } });
  });

  it("locks inspection notes after signed evidence", async () => {
    mocks.batch.mockResolvedValue({ state: "SUBMITTED", signedPdf: Buffer.from("%PDF-") });
    await expect(saveReturnInspectionNotes(user, "source", "batch", { outcome: "Changed" })).rejects.toMatchObject({ code: "INSPECTION_NOTES_LOCKED" });
    expect(mocks.noteUpdate).not.toHaveBeenCalled();
  });

  it("locks inspection notes when final approval has started", async () => {
    mocks.approvals.mockResolvedValue([approval("STOREMAN:A", "APPROVED", 4)]);
    await expect(saveReturnInspectionNotes(user, "source", "batch", { outcome: "Changed" })).rejects.toMatchObject({ code: "INSPECTION_NOTES_LOCKED" });
  });

  it("cannot verify before lead approval", async () => {
    mocks.approvals.mockResolvedValue([approval("SUPERVISOR", "PENDING", 2), approval("RETURN_CHECK:A")]);
    await expect(checkReturnOutcomes(user, "source", "batch", ["outcome"], {})).rejects.toMatchObject({ code: "RETURN_CHECK_FORBIDDEN" });
  });

  it.each(["CANCELLED", "REJECTED", "COMPLETED"])("cannot check a %s batch even with stale pending approvals", async (state) => {
    mocks.batch.mockResolvedValue({ id: "batch", state });
    await expect(checkReturnOutcomes(user, "source", "batch", ["outcome"], {})).rejects.toMatchObject({ code: "RETURN_ROUND_LOCKED" });
    expect(mocks.checks).not.toHaveBeenCalled();
  });

  it("cannot upload to a cancelled batch even with stale approved checks", async () => {
    mocks.batch.mockResolvedValue({ id: "batch", state: "CANCELLED", damagePdf: Buffer.from("%PDF-") });
    mocks.approvals.mockResolvedValue([approval("RETURN_CHECK:A", "APPROVED"), approval("STOREMAN:A", "PENDING", 4)]);
    await expect(uploadSignedReturnDocument(user, "source", "batch", { data: Buffer.from("%PDF-1.7"), filename: "signed.pdf" })).rejects.toMatchObject({ code: "SIGNED_DOCUMENT_NOT_READY" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("cannot export until every warehouse has checked", async () => {
    mocks.approvals.mockResolvedValue([approval("RETURN_CHECK:A", "APPROVED"), approval("RETURN_CHECK:B"), approval("STOREMAN:A", "PENDING", 4)]);
    await expect(getDamageDocument(user, "source", "batch")).rejects.toMatchObject({ code: "RETURN_DOCUMENT_NOT_READY" });
  });

  it("requires generated evidence before signed upload", async () => {
    mocks.approvals.mockResolvedValue([approval("RETURN_CHECK:A", "APPROVED"), approval("STOREMAN:A", "PENDING", 4)]);
    await expect(uploadSignedReturnDocument(user, "source", "batch", { data: Buffer.from("%PDF-1.7"), filename: "signed.pdf" })).rejects.toMatchObject({ code: "SIGNED_DOCUMENT_NOT_READY" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("cannot replace evidence once final approval starts", async () => {
    mocks.batch.mockResolvedValue({ state: "SUBMITTED", damagePdf: Buffer.from("%PDF-") });
    mocks.approvals.mockResolvedValue([approval("RETURN_CHECK:A", "APPROVED"), approval("STOREMAN:A", "APPROVED", 4)]);
    await expect(uploadSignedReturnDocument(user, "source", "batch", { data: Buffer.from("%PDF-1.7"), filename: "signed.pdf" })).rejects.toMatchObject({ code: "SIGNED_DOCUMENT_LOCKED" });
  });

  it("can replace an uploaded PDF before final approval", async () => {
    mocks.batch.mockResolvedValue({ state: "SUBMITTED", damagePdf: Buffer.from("%PDF-generated"), signedPdf: Buffer.from("%PDF-old") });
    mocks.approvals.mockResolvedValue([approval("RETURN_CHECK:A", "APPROVED"), approval("STOREMAN:A", "PENDING", 4)]);
    await expect(uploadSignedReturnDocument(user, "source", "batch", { data: Buffer.from("%PDF-new"), filename: "replacement.pdf" })).resolves.toEqual({ uploaded: true });
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "batch" }, data: expect.objectContaining({ signedFilename: "replacement.pdf", signedById: user.id }) });
  });

  it("rejects non-PDF and oversized uploads", async () => {
    await expect(uploadSignedReturnDocument(user, "source", "batch", { data: Buffer.from("not pdf"), filename: "x.pdf" })).rejects.toMatchObject({ code: "INVALID_SIGNED_PDF" });
    await expect(uploadSignedReturnDocument(user, "source", "batch", { data: new Uint8Array(10 * 1024 * 1024 + 1), filename: "x.pdf" })).rejects.toMatchObject({ code: "INVALID_SIGNED_PDF" });
    expect(mocks.batch).not.toHaveBeenCalled();
  });
});
