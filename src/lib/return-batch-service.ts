import { ApprovalStatus, AssetCondition, AssetStatus, Prisma } from "@prisma/client";
import { formatProjectLabel } from "@/lib/project-label";
import { isQuantityTrackedAsset } from "@/lib/asset-tracking";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { approvalMatchesUser } from "@/lib/approval-flow";
import { WorkflowError } from "@/lib/workflow";
import { buildDamagePdf, type DamagePdfSignature } from "@/lib/return-damage-pdf";

const include = {
  transaction: { include: { requestedBy: true, project: true } },
} satisfies Prisma.ReturnBatchInclude;

async function loadBatch(tx: Prisma.TransactionClient, transactionId: string, batchId: string) {
  const batch = await tx.returnBatch.findFirst({ where: { id: batchId, transactionId }, include });
  if (!batch) throw new WorkflowError("Return batch not found.", 404, "RETURN_BATCH_NOT_FOUND");
  const [outcomes, approvals] = await Promise.all([
    tx.transactionItemOutcome.findMany({ where: { transactionId, resolutionBatchId: batchId, ...(["SUBMITTED", "REJECTED"].includes(batch.state) ? { approvedAt: null } : {}) }, include: {
      checks: true, transactionItem: { include: { asset: { include: { assetModel: true, warehouse: true } } } },
    } }),
    tx.transactionApproval.findMany({ where: { transactionId, resolutionBatchId: batchId, isCurrent: true }, orderBy: { stepSequence: "asc" } }),
  ]);
  return { batch, outcomes, approvals };
}

function requiresDocument(outcomes: Array<{ outcomeStatus: AssetStatus; returnCondition: AssetCondition | null }>) {
  return outcomes.some((o) => o.outcomeStatus === AssetStatus.FAIL || o.outcomeStatus === AssetStatus.LOST || o.returnCondition === AssetCondition.USED);
}

function allChecked(approvals: Array<{ requiredTag: string; status: ApprovalStatus }>) {
  const checks = approvals.filter((a) => a.requiredTag.startsWith("RETURN_CHECK:"));
  return checks.length > 0 && checks.every((a) => a.status === ApprovalStatus.APPROVED);
}

function isCurrent(approval: { stepSequence: number }, approvals: Array<{ stepSequence: number; status: ApprovalStatus; requiredTag: string }>) {
  const pending = approvals.filter((a) => a.status === ApprovalStatus.PENDING && !a.requiredTag.startsWith("ACK_"));
  return pending.length > 0 && approval.stepSequence === Math.min(...pending.map((a) => a.stepSequence));
}

export async function checkReturnOutcomes(user: CurrentUser, transactionId: string, batchId: string, outcomeIds: string[], stockTargets: Record<string, string>, inspectionNotes: Record<string, string> = {}) {
  return db.$transaction(async (tx) => {
    const { batch, outcomes, approvals } = await loadBatch(tx, transactionId, batchId);
    if (batch.state !== "SUBMITTED") throw new WorkflowError("This return round is not editable.", 409, "RETURN_ROUND_LOCKED");
    const mine = approvals.filter((a) => a.requiredTag.startsWith("RETURN_CHECK:") && a.status === ApprovalStatus.PENDING && approvalMatchesUser(user, a) && isCurrent(a, approvals));
    if (!mine.length) throw new WorkflowError("Only the current warehouse Storeman can verify these items.", 403, "RETURN_CHECK_FORBIDDEN");
    const codes = new Set(mine.map((a) => a.requiredTag.slice("RETURN_CHECK:".length)));
    const uniqueIds = [...new Set(outcomeIds)];
    if (!uniqueIds.length) throw new WorkflowError("Select at least one outcome.", 400, "EMPTY_CHECK");
    for (const id of uniqueIds) {
      const outcome = outcomes.find((o) => o.id === id);
      const asset = outcome?.transactionItem.asset;
      if (!outcome || !asset || outcome.approvedAt || !codes.has(asset.warehouse.code)) throw new WorkflowError("Outcome belongs to another warehouse or is already posted.", 403, "RETURN_CHECK_SCOPE");
      if (outcome.checks.some((c) => c.userId === user.id)) continue;
      if (isQuantityTrackedAsset(asset) && outcome.outcomeStatus === AssetStatus.READY) {
        if (!outcome.returnCondition) throw new WorkflowError("Requester must classify the return.", 409, "RETURN_CONDITION_REQUIRED");
        const targetId = outcome.returnCondition === AssetCondition.NEW ? asset.id : stockTargets[id];
        const target = targetId ? await tx.asset.findFirst({ where: { id: targetId, isActive: true, warehouseId: asset.warehouseId, assetModelId: asset.assetModelId, serialNo: null, ...(outcome.returnCondition === AssetCondition.USED ? { condition: AssetCondition.USED, status: AssetStatus.READY } : {}) } }) : null;
        if (!target?.stockCode) throw new WorkflowError("Select an existing stock code for the same model and warehouse.", 409, "INVALID_RETURN_STOCK_TARGET");
        if (outcome.checks.length && outcome.assetId !== target.id) throw new WorkflowError("Another Storeman already verified a different target.", 409, "RETURN_TARGET_LOCKED");
        await tx.transactionItemOutcome.update({ where: { id }, data: { assetId: target.id } });
      }
      const note = inspectionNotes[id]?.trim() || null;
      if (note && note.length > 2000) throw new WorkflowError("Inspection note must not exceed 2000 characters.", 400, "INVALID_INSPECTION_NOTE");
      await tx.returnOutcomeCheck.create({ data: { outcomeId: id, userId: user.id, note } });
    }
    if (!user.signatureDataUrl) throw new WorkflowError("Upload your signature before confirming.", 409, "SIGNATURE_REQUIRED");
    for (const approval of mine) {
      const code = approval.requiredTag.slice("RETURN_CHECK:".length);
      const own = outcomes.filter((o) => o.transactionItem.asset?.warehouse.code === code);
      const count = await tx.returnOutcomeCheck.count({ where: { userId: user.id, outcomeId: { in: own.map((o) => o.id) } } });
      if (own.length && count === own.length) await tx.transactionApproval.update({ where: { id: approval.id }, data: { status: ApprovalStatus.APPROVED, actedAt: new Date(), approverNameSnapshot: user.name, approverSignatureSnapshot: user.signatureDataUrl } });
    }
    return { checked: uniqueIds.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function saveReturnInspectionNotes(user: CurrentUser, transactionId: string, batchId: string, notes: Record<string, string>) {
  return db.$transaction(async (tx) => {
    const { batch, outcomes, approvals } = await loadBatch(tx, transactionId, batchId);
    if (batch.state !== "SUBMITTED" || batch.signedPdf || approvals.some((a) => a.requiredTag.startsWith("STOREMAN:") && a.status === ApprovalStatus.APPROVED)) {
      throw new WorkflowError("Inspection notes are locked after signed evidence or final approval.", 409, "INSPECTION_NOTES_LOCKED");
    }
    if (!Object.keys(notes).length) throw new WorkflowError("No inspection notes supplied.", 400, "EMPTY_INSPECTION_NOTES");
    for (const [id, value] of Object.entries(notes)) {
      const outcome = outcomes.find((o) => o.id === id);
      const check = outcome?.checks.find((c) => c.userId === user.id);
      const code = outcome?.transactionItem.asset?.warehouse.code;
      if (!outcome || outcome.approvedAt || !check || !approvals.some((a) => a.requiredTag === `RETURN_CHECK:${code}` && approvalMatchesUser(user, a))) {
        throw new WorkflowError("Only the verifying Storeman can edit notes for their warehouse.", 403, "INSPECTION_NOTE_SCOPE");
      }
      if (typeof value !== "string" || value.length > 2000) throw new WorkflowError("Inspection note must not exceed 2000 characters.", 400, "INVALID_INSPECTION_NOTE");
      await tx.returnOutcomeCheck.update({ where: { id: check.id }, data: { note: value.trim() || null } });
    }
    // Invalidate the generated document so it cannot be signed with stale notes.
    await tx.returnBatch.update({ where: { id: batchId }, data: { damagePdf: null, revision: { increment: 1 } } });
    return { saved: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getDamageDocument(user: CurrentUser, transactionId: string, batchId: string) {
  const { batch, outcomes, approvals } = await loadBatch(db, transactionId, batchId);
  const allowed = approvals.some((a) => (a.requiredTag.startsWith("STOREMAN:") || a.requiredTag.startsWith("RETURN_CHECK:")) && approvalMatchesUser(user, a));
  if (!allowed) throw new WorkflowError("Only an assigned Storeman can export this document.", 403, "RETURN_DOCUMENT_FORBIDDEN");
  if (!allChecked(approvals) || !requiresDocument(outcomes)) throw new WorkflowError("All warehouses must complete verification before document export.", 409, "RETURN_DOCUMENT_NOT_READY");
  if (batch.state === "REJECTED" || batch.state === "CANCELLED") throw new WorkflowError("This return round is not active.", 409, "RETURN_ROUND_LOCKED");
  if (batch.damagePdf) return { pdf: Buffer.from(batch.damagePdf), filename: `${batch.requestNo}-damage.pdf` };
  const signatures = (prefix: string): DamagePdfSignature[] => approvals.filter((a) => a.status === ApprovalStatus.APPROVED && a.requiredTag.startsWith(prefix)).map((a) => ({ name: a.approverNameSnapshot ?? "", signatureDataUrl: a.approverSignatureSnapshot, date: a.actedAt }));
  const pdf = await buildDamagePdf({ requestNo: batch.requestNo, sourceRequestNo: batch.transaction.transactionNo ?? "", projectName: batch.transaction.project ? formatProjectLabel(batch.transaction.project) : batch.transaction.purpose, requesterName: batch.transaction.requestedBy.name, internalRequest: batch.transaction.internalRequest, serviceRequest: batch.transaction.serviceRequest, projectRequest: batch.transaction.projectRequest, items: outcomes.flatMap((o) => {
    const asset = o.transactionItem.asset;
    const outcome = o.returnCondition === AssetCondition.USED ? "USED" : o.outcomeStatus;
    if (!asset || (outcome !== "FAIL" && outcome !== "LOST" && outcome !== "USED")) return [];
    return [{ model: asset.assetModel.name, description: asset.assetModel.description, stockCode: asset.stockCode, serialNo: asset.serialNo, quantity: o.quantity, outcome, note: o.checks.map((check) => check.note?.trim()).filter(Boolean).join("\n") || null }];
  }), signatures: { requester: signatures("REQUESTER"), lead: approvals.filter((a) => a.status === ApprovalStatus.APPROVED && a.stepSequence > 1 && !a.requiredTag.includes(":" ) && !a.requiredTag.startsWith("ACK_")).map((a) => ({ name: a.approverNameSnapshot ?? "", signatureDataUrl: a.approverSignatureSnapshot, date: a.actedAt })), storeman: signatures("RETURN_CHECK:") } });
  const saved = await db.returnBatch.updateMany({ where: { id: batchId, revision: batch.revision, state: batch.state, signedPdf: null }, data: { damagePdf: new Uint8Array(pdf) } });
  if (saved.count !== 1) throw new WorkflowError("The return round changed. Refresh before exporting.", 409, "RETURN_DOCUMENT_REVISION_CONFLICT");
  return { pdf, filename: `${batch.requestNo}-damage.pdf` };
}

export async function uploadSignedReturnDocument(user: CurrentUser, transactionId: string, batchId: string, input: { data: Uint8Array; filename: string }) {
  if (input.data.byteLength > 10 * 1024 * 1024 || input.data.byteLength < 5 || Buffer.from(input.data.subarray(0, 5)).toString("ascii") !== "%PDF-") throw new WorkflowError("Upload a PDF no larger than 10 MiB.", 400, "INVALID_SIGNED_PDF");
  return db.$transaction(async (tx) => {
    const { batch, outcomes, approvals } = await loadBatch(tx, transactionId, batchId);
    if (!approvals.some((a) => a.requiredTag.startsWith("STOREMAN:") && approvalMatchesUser(user, a))) throw new WorkflowError("Only an assigned warehouse Storeman may upload.", 403, "RETURN_UPLOAD_FORBIDDEN");
    if (!allChecked(approvals) || !requiresDocument(outcomes) || !batch.damagePdf || batch.state !== "SUBMITTED") throw new WorkflowError("Generate the verified document first.", 409, "SIGNED_DOCUMENT_NOT_READY");
    if (approvals.some((a) => a.requiredTag.startsWith("STOREMAN:") && a.status === ApprovalStatus.APPROVED)) throw new WorkflowError("Cannot replace evidence after final approval has started.", 409, "SIGNED_DOCUMENT_LOCKED");
    await tx.returnBatch.update({ where: { id: batchId }, data: { signedPdf: new Uint8Array(input.data), signedFilename: input.filename.slice(0, 255), signedById: user.id, signedAt: new Date() } });
    return { uploaded: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getSignedReturnDocument(transactionId: string, batchId: string) {
  const batch = await db.returnBatch.findFirst({
    where: { id: batchId, transactionId },
    select: { signedPdf: true, signedFilename: true },
  });
  if (!batch) throw new WorkflowError("Return batch not found.", 404, "RETURN_BATCH_NOT_FOUND");
  if (!batch.signedPdf) throw new WorkflowError("No uploaded PDF exists for this return round.", 404, "SIGNED_DOCUMENT_NOT_FOUND");
  return { pdf: Buffer.from(batch.signedPdf), filename: batch.signedFilename ?? "signed-return.pdf" };
}

export async function getReturnBatchReviews(user: CurrentUser, transactionId: string) {
  const batches = await db.returnBatch.findMany({ where: { transactionId, OR: [{ state: { notIn: ["COMPLETED", "CANCELLED"] } }, { state: "COMPLETED", signedPdf: { not: null } }] }, orderBy: { createdAt: "asc" } });
  return Promise.all(batches.map(async ({ id }) => {
    const { batch, outcomes, approvals } = await loadBatch(db, transactionId, id);
    const checked = allChecked(approvals);
    const active = batch.state === "SUBMITTED";
    const documentRequired = requiresDocument(outcomes);
    const canCheck = active && approvals.some((a) => a.requiredTag.startsWith("RETURN_CHECK:") && a.status === ApprovalStatus.PENDING && approvalMatchesUser(user, a) && isCurrent(a, approvals));
    const assigned = approvals.filter((a) => a.requiredTag.startsWith("RETURN_CHECK:") && approvalMatchesUser(user, a));
    const canDownload = active && checked && documentRequired && assigned.length > 0;
    const canUpload = canDownload && Boolean(batch.damagePdf) && !batch.signedPdf &&
      approvals.some((a) => a.requiredTag.startsWith("STOREMAN:") && approvalMatchesUser(user, a)) &&
      !approvals.some((a) => a.requiredTag.startsWith("STOREMAN:") && a.status === ApprovalStatus.APPROVED);
    return { id, requestNo: batch.requestNo, phase: batch.state, requiresDocument: documentRequired, allChecked: checked, hasSignedDocument: Boolean(batch.signedPdf), canCheck, canDownload, canUpload, outcomes: await Promise.all(outcomes.map(async (o) => {
      const asset = o.transactionItem.asset;
      const owns = asset && assigned.some((a) => a.requiredTag === `RETURN_CHECK:${asset.warehouse.code}`);
      const inspectionNote = o.checks.find((check) => check.userId === user.id)?.note ?? "";
      const canEditInspectionNote = Boolean(owns && active && !o.approvedAt && !batch.signedPdf && !approvals.some((a) => a.requiredTag.startsWith("STOREMAN:") && a.status === ApprovalStatus.APPROVED) && (canCheck || o.checks.some((check) => check.userId === user.id)));
      const options = asset && isQuantityTrackedAsset(asset) && o.outcomeStatus === AssetStatus.READY ? await db.asset.findMany({ where: { assetModelId: asset.assetModelId, warehouseId: asset.warehouseId, isActive: true, serialNo: null, stockCode: { not: null }, ...(o.returnCondition === AssetCondition.USED ? { condition: AssetCondition.USED, status: AssetStatus.READY } : {}) }, orderBy: { stockCode: "asc" }, select: { id: true, stockCode: true } }) : [];
      return { id: o.id, sourceAssetId: asset?.id, inspectionNote, canEditInspectionNote, label: `${asset?.assetModel.name ?? "Unknown"} / ${o.returnCondition === AssetCondition.USED ? "USED" : o.outcomeStatus}`, qty: o.quantity, checked: o.checks.some((c) => c.userId === user.id), canCheck: Boolean(owns && !o.approvedAt), stockOptions: options.map((a) => ({ id: a.id, stockCode: a.stockCode! })), stockAssetId: o.assetId, requiresStockTarget: Boolean(asset && isQuantityTrackedAsset(asset) && o.outcomeStatus === AssetStatus.READY && o.returnCondition === AssetCondition.USED) };
    })) };
  }));
}
