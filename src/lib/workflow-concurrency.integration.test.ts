import { randomUUID } from "node:crypto";
import { ApprovalStatus, AssetCondition, AssetStatus, PrismaClient, TransactionStatus, TransactionType, TransactionWorkflowStatus } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import { approveTransaction, resolveTransactionItems } from "@/lib/workflow";

const enabled = process.env.RUN_POSTGRES_CONCURRENCY_TESTS === "1";
const db = enabled ? new PrismaClient() : null;

afterAll(async () => {
  await db?.$disconnect();
});

async function cleanup(marker: string) {
  if (!db) return;
  const transactions = await db.transaction.findMany({
    where: { OR: [{ purpose: marker }, { transactionNo: { startsWith: marker } }] },
    select: { id: true },
  });
  const transactionIds = transactions.map((transaction) => transaction.id);
  const batches = await db.returnBatch.findMany({
    where: { OR: [{ requestNo: { startsWith: marker } }, { transactionId: { in: transactionIds } }] },
    select: { id: true },
  });
  const batchIds = batches.map((batch) => batch.id);
  const users = await db.user.findMany({ where: { name: { startsWith: marker } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  const warehouses = await db.assetWarehouse.findMany({ where: { name: marker }, select: { id: true } });
  const warehouseIds = warehouses.map((warehouse) => warehouse.id);
  const assets = await db.asset.findMany({
    where: { OR: [{ stockCode: { startsWith: marker } }, { assetModel: { name: marker } }] },
    select: { id: true },
  });
  const assetIds = assets.map((asset) => asset.id);

  await db.returnOutcomeCheck.deleteMany({ where: { outcome: { OR: [{ resolutionBatchId: { in: batchIds } }, { transactionId: { in: transactionIds } }] } } });
  await db.returnBatchEvidence.deleteMany({ where: { batchId: { in: batchIds } } });
  await db.transactionApproval.deleteMany({ where: { OR: [{ transactionId: { in: transactionIds } }, { resolutionBatchId: { in: batchIds } }] } });
  await db.transactionItemOutcome.deleteMany({ where: { OR: [{ transactionId: { in: transactionIds } }, { resolutionBatchId: { in: batchIds } }] } });
  await db.returnBatch.deleteMany({ where: { id: { in: batchIds } } });
  await db.assetStatusHistory.deleteMany({ where: { OR: [{ transactionId: { in: transactionIds } }, { assetId: { in: assetIds } }, { changedById: { in: userIds } }] } });
  await db.transactionItem.deleteMany({ where: { transactionId: { in: transactionIds } } });
  await db.transaction.deleteMany({ where: { id: { in: transactionIds } } });
  await db.projectMember.deleteMany({ where: { userId: { in: userIds } } });
  await db.project.deleteMany({ where: { projectId: { startsWith: marker } } });
  await db.assetReservation.deleteMany({ where: { OR: [{ assetId: { in: assetIds } }, { userId: { in: userIds } }] } });
  await db.userWarehousePermission.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { warehouseId: { in: warehouseIds } }] } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.asset.deleteMany({ where: { id: { in: assetIds } } });
  await db.assetModel.deleteMany({ where: { OR: [{ name: marker }, { warehouseId: { in: warehouseIds } }] } });
  await db.assetWarehouse.deleteMany({ where: { id: { in: warehouseIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}

function currentUser(
  id: string,
  name: string,
  marker: string,
  permissions: CurrentUser["permissions"] = [],
): CurrentUser {
  return {
    id,
    name,
    email: `${marker}-${id}@test.local`,
    azureAdObjectId: null,
    lastLoginAt: null,
    organizationLevel: null,
    organizationTag: null,
    organizationAssignments: [],
    projectTag: null,
    position: null,
    signatureDataUrl: "test-signature",
    signatureUploadedAt: null,
    signatureUploadedBy: null,
    roles: [],
    permissions,
  };
}

describe.skipIf(!enabled)("PostgreSQL workflow concurrency", () => {
  it("allows only one concurrent return submission for the same open quantity", async () => {
    const marker = `QA-CONC-${randomUUID()}`;
    await cleanup(marker);

    try {
      const storeRole = await db!.role.findUniqueOrThrow({ where: { code: "STOREMAN" } });
      const requester = await db!.user.create({ data: { name: `${marker}-requester`, signatureDataUrl: "requester-signature" } });
      const lead = await db!.user.create({ data: { name: `${marker}-lead`, signatureDataUrl: "lead-signature" } });
      const storeman = await db!.user.create({ data: { name: `${marker}-storeman`, signatureDataUrl: "store-signature" } });
      const warehouse = await db!.assetWarehouse.create({ data: { code: `${marker}-WH`, prefix: `${marker}-WH`, name: marker } });
      await db!.userRole.create({ data: { userId: storeman.id, roleId: storeRole.id } });
      await db!.userWarehousePermission.createMany({
        data: [
          { userId: requester.id, warehouseId: warehouse.id, canView: true, canManage: false },
          { userId: storeman.id, warehouseId: warehouse.id, canView: true, canManage: true },
        ],
      });
      const project = await db!.project.create({ data: { projectId: `${marker}-PROJECT`, name: marker, customerName: marker, leadUserId: lead.id } });
      const model = await db!.assetModel.create({ data: { warehouseId: warehouse.id, name: marker, isSerialized: false } });
      const asset = await db!.asset.create({ data: { warehouseId: warehouse.id, assetModelId: model.id, stockCode: `${marker}-STOCK`, status: "READY", assetQuantity: 10 } });
      const transaction = await db!.transaction.create({
        data: {
          transactionNo: `${marker}-SOURCE`,
          type: TransactionType.BORROW,
          status: TransactionStatus.BORROWED,
          workflowStatus: TransactionWorkflowStatus.IN_PROGRESS,
          purpose: marker,
          projectRequest: true,
          projectId: project.id,
          requestedById: requester.id,
          createdById: requester.id,
        },
      });
      const item = await db!.transactionItem.create({
        data: {
          transactionId: transaction.id,
          assetId: asset.id,
          assetModelId: model.id,
          requestedQuantity: 1,
          toStatus: "BORROW",
          dispatchedAt: new Date(),
          dispatchedById: requester.id,
        },
      });
      const actor = currentUser(
        requester.id,
        requester.name,
        marker,
        [{ warehouseCode: warehouse.code, canView: true, canManage: false }],
      );

      const submit = () => resolveTransactionItems(actor, {
        transactionId: transaction.id,
        items: [{ itemId: item.id, toStatus: AssetStatus.READY, quantity: 1, returnCondition: AssetCondition.NEW }],
      });
      const results = await Promise.allSettled([submit(), submit()]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(await db!.transactionItemOutcome.count({ where: { transactionId: transaction.id, approvedAt: null } })).toBe(1);
      expect(await db!.returnBatch.count({ where: { transactionId: transaction.id, state: { notIn: ["REJECTED", "CANCELLED"] } } })).toBe(1);
    } finally {
      await cleanup(marker);
    }
  }, 30000);

  it("posts stock only once when the final storeman approval is submitted twice concurrently", async () => {
    const marker = `QA-FINAL-${randomUUID()}`;
    await cleanup(marker);

    try {
      const storeRole = await db!.role.findUniqueOrThrow({ where: { code: "STOREMAN" } });
      const requester = await db!.user.create({ data: { name: `${marker}-requester`, signatureDataUrl: "requester-signature" } });
      const lead = await db!.user.create({ data: { name: `${marker}-lead`, signatureDataUrl: "lead-signature" } });
      const storeman = await db!.user.create({ data: { name: `${marker}-storeman`, signatureDataUrl: "store-signature" } });
      const warehouse = await db!.assetWarehouse.create({ data: { code: `${marker}-WH`, prefix: `${marker}-WH`, name: marker } });
      await db!.userRole.create({ data: { userId: storeman.id, roleId: storeRole.id } });
      await db!.userWarehousePermission.create({ data: { userId: storeman.id, warehouseId: warehouse.id, canView: true, canManage: true } });
      const model = await db!.assetModel.create({ data: { warehouseId: warehouse.id, name: marker, isSerialized: false } });
      const asset = await db!.asset.create({ data: { warehouseId: warehouse.id, assetModelId: model.id, stockCode: `${marker}-STOCK`, status: "READY", assetQuantity: 10 } });
      const transaction = await db!.transaction.create({
        data: {
          transactionNo: `${marker}-SOURCE`,
          type: TransactionType.BORROW,
          status: TransactionStatus.BORROWED,
          workflowStatus: TransactionWorkflowStatus.IN_PROGRESS,
          purpose: marker,
          internalRequest: true,
          requestedById: requester.id,
          createdById: requester.id,
        },
      });
      const item = await db!.transactionItem.create({
        data: {
          transactionId: transaction.id,
          assetId: asset.id,
          assetModelId: model.id,
          requestedQuantity: 1,
          toStatus: "BORROW",
          dispatchedAt: new Date(),
          dispatchedById: requester.id,
        },
      });
      const batch = await db!.returnBatch.create({ data: { id: randomUUID(), transactionId: transaction.id, requestNo: `${marker}-RETURN` } });
      const outcome = await db!.transactionItemOutcome.create({
        data: {
          transactionId: transaction.id,
          transactionItemId: item.id,
          resolutionBatchId: batch.id,
          assetId: asset.id,
          outcomeStatus: AssetStatus.READY,
          returnCondition: AssetCondition.NEW,
          quantity: 1,
        },
      });
      await db!.returnOutcomeCheck.create({ data: { outcomeId: outcome.id, userId: storeman.id } });
      await db!.transactionApproval.createMany({
        data: [
          { transactionId: transaction.id, resolutionBatchId: batch.id, userId: requester.id, requiredTag: "REQUESTER", stepSequence: 1, status: ApprovalStatus.APPROVED },
          { transactionId: transaction.id, resolutionBatchId: batch.id, userId: lead.id, requiredTag: "SUPERVISOR", stepSequence: 2, status: ApprovalStatus.APPROVED },
          { transactionId: transaction.id, resolutionBatchId: batch.id, userId: storeman.id, requiredTag: `RETURN_CHECK:${warehouse.code}`, stepSequence: 3, status: ApprovalStatus.APPROVED },
          { transactionId: transaction.id, resolutionBatchId: batch.id, userId: storeman.id, requiredTag: `STOREMAN:${warehouse.code}`, stepSequence: 4 },
        ],
      });
      const actor = currentUser(
        storeman.id,
        storeman.name,
        marker,
        [{ warehouseCode: warehouse.code, canView: true, canManage: true }],
      );

      const results = await Promise.allSettled([
        approveTransaction(actor, transaction.id),
        approveTransaction(actor, transaction.id),
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(await db!.asset.findUniqueOrThrow({ where: { id: asset.id }, select: { assetQuantity: true } })).toEqual({ assetQuantity: 11 });
      expect(await db!.transactionItemOutcome.count({ where: { id: outcome.id, approvedAt: { not: null } } })).toBe(1);
      expect(await db!.assetStatusHistory.count({ where: { transactionId: transaction.id, actionType: "RETURN" } })).toBe(1);
    } finally {
      await cleanup(marker);
    }
  }, 30000);
});
