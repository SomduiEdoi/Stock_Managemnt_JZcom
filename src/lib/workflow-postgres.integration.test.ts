import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";

const context = vi.hoisted(() => ({ tx: null as Prisma.TransactionClient | null }));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get(_target, property) {
      if (!context.tx) throw new Error("Integration database access outside rollback transaction");
      if (property === "$transaction") return (callback: (tx: Prisma.TransactionClient) => unknown) => callback(context.tx!);
      return Reflect.get(context.tx, property);
    },
  }),
}));

import { addItemsToPendingTransaction, approveTransaction, getEditablePendingRequestsForUser, rejectTransaction, resolveTransactionItems, saveSalePriceDraft } from "@/lib/workflow";
import { checkReturnOutcomes, uploadSignedReturnDocument } from "@/lib/return-batch-service";
import { createAssetForUser, getAssetEditForUser, updateAssetForUser } from "@/lib/asset-edit";
import { getPendingApprovalsForUser } from "@/lib/transaction-log";

const enabled = process.env.RUN_POSTGRES_WORKFLOW_TESTS === "1";
const client = enabled ? new PrismaClient() : null;
const rollback = new Error("EXPECTED_TEST_ROLLBACK");
afterAll(async () => { await client?.$disconnect(); });

describe.skipIf(!enabled)("PostgreSQL workflow with mandatory rollback", () => {
  it("adds assets to a rejected project request under the same number and preserves approval history", async () => {
    const marker = `QA-REJECT-${randomUUID()}`;
    let completed = false;
    try {
      await client!.$transaction(async (tx) => {
        context.tx = tx;
        const requester = await tx.user.create({ data: { name: marker, organizationLevel: "MANAGER", organizationTag: "SERVICE_MANAGER", signatureDataUrl: "test-signature", roles: { create: { role: { connect: { code: "USER" } } } } } });
        const lead = await tx.user.create({ data: { name: `${marker}-lead` } });
        const store = await tx.user.create({ data: { name: `${marker}-store`, roles: { create: { role: { connect: { code: "STOREMAN" } } } } } });
        const warehouse = await tx.assetWarehouse.create({ data: { code: marker, prefix: "QA", name: marker } });
        await tx.userWarehousePermission.createMany({ data: [
          { userId: requester.id, warehouseId: warehouse.id, canView: true, canManage: false },
          { userId: store.id, warehouseId: warehouse.id, canView: true, canManage: true },
        ] });
        const project = await tx.project.create({ data: { projectId: marker, name: marker, customerName: "QA Customer", leadUserId: lead.id, members: { create: { userId: requester.id, projectTag: "TEAM_MEMBER" } } } });
        const model = await tx.assetModel.create({ data: { warehouseId: warehouse.id, name: marker, isSerialized: false } });
        const stock = await tx.asset.create({ data: { warehouseId: warehouse.id, assetModelId: model.id, assetQuantity: 10, status: "READY" } });
        const serialModel = await tx.assetModel.create({ data: { warehouseId: warehouse.id, name: `${marker}-serial`, isSerialized: true } });
        const serial = await tx.asset.create({ data: { warehouseId: warehouse.id, assetModelId: serialModel.id, serialNo: marker, status: "READY" } });
        const request = await tx.transaction.create({ data: { transactionNo: marker, type: "BORROW", status: "BORROWED", workflowStatus: "REJECTED", projectRequest: true, projectId: project.id, purpose: marker, requestedById: requester.id, createdById: requester.id, items: { create: { assetId: stock.id, requestedQuantity: 2, toStatus: "BORROW" } } } });
        const oldLead = await tx.transactionApproval.create({ data: { transactionId: request.id, userId: lead.id, requiredTag: "LEAD_PROJECT", stepSequence: 2, status: "APPROVED" } });
        const oldReject = await tx.transactionApproval.create({ data: { transactionId: request.id, userId: store.id, requiredTag: `STOREMAN:${warehouse.code}`, stepSequence: 3, status: "REJECTED", comment: "Add a server" } });
        const locked = await tx.transaction.create({ data: { type: "BORROW", status: "BORROWED", workflowStatus: "PENDING", purpose: marker, requestedById: requester.id, createdById: requester.id, approvals: { create: { userId: lead.id, requiredTag: "LEAD_PROJECT", stepSequence: 2, status: "APPROVED" } } } });
        const derived = await tx.transaction.create({ data: { sourceTransactionId: request.id, type: "SOLD", status: "COMPLETED", workflowStatus: "REJECTED", purpose: marker, requestedById: requester.id, createdById: requester.id } });
        const actor = { id: requester.id, name: marker, roles: ["USER"], permissions: [{ warehouseCode: warehouse.code, canView: true, canManage: false }], organizationAssignments: [], signatureDataUrl: "test-signature" } as unknown as CurrentUser;
        const destinations = await getEditablePendingRequestsForUser(actor);
        expect(destinations).toEqual([expect.objectContaining({ id: request.id, workflowStatus: "REJECTED" })]);
        expect(destinations.some((row) => row.id === locked.id || row.id === derived.id)).toBe(false);
        await addItemsToPendingTransaction(actor, request.id, { items: [{ assetId: serial.id, quantity: 1 }] });
        expect(await tx.transaction.findUniqueOrThrow({ where: { id: request.id }, select: { transactionNo: true, workflowStatus: true, projectId: true } })).toEqual({ transactionNo: marker, workflowStatus: "PENDING", projectId: project.id });
        expect(await tx.transactionItem.count({ where: { transactionId: request.id } })).toBe(2);
        expect(await tx.asset.findUniqueOrThrow({ where: { id: serial.id }, select: { status: true, requestLockedById: true } })).toEqual({ status: "REQUEST", requestLockedById: requester.id });
        expect(await tx.transactionApproval.findUniqueOrThrow({ where: { id: oldLead.id }, select: { isCurrent: true, status: true } })).toEqual({ isCurrent: false, status: "APPROVED" });
        expect(await tx.transactionApproval.findUniqueOrThrow({ where: { id: oldReject.id }, select: { isCurrent: true, status: true, comment: true } })).toEqual({ isCurrent: false, status: "REJECTED", comment: "Add a server" });
        expect(await tx.transactionApproval.count({ where: { transactionId: request.id, isCurrent: true, status: "PENDING" } })).toBe(2);
        await addItemsToPendingTransaction(actor, request.id, { items: [{ assetId: stock.id, quantity: 1 }] });
        expect((await tx.transactionItem.findFirstOrThrow({ where: { transactionId: request.id, assetId: stock.id } })).requestedQuantity).toBe(3);
        await approveTransaction({ ...actor, id: lead.id }, request.id);
        expect((await getEditablePendingRequestsForUser(actor)).some((row) => row.id === request.id)).toBe(false);
        await expect(addItemsToPendingTransaction(actor, request.id, { items: [{ assetId: stock.id, quantity: 1 }] })).rejects.toThrow("locked");
        completed = true;
        throw rollback;
      }, { timeout: 30000 });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      context.tx = null;
    }
    expect(completed).toBe(true);
    expect(await client!.transaction.count({ where: { purpose: marker } })).toBe(0);
    expect(await client!.assetWarehouse.count({ where: { code: marker } })).toBe(0);
  }, 40000);

  it("creates quantity without a serial and allows a serial to be added or cleared on edit", async () => {
    const marker = `QA-TRACK-${randomUUID()}`;
    let completed = false;
    try {
      await client!.$transaction(async (tx) => {
        context.tx = tx;
        const admin = await tx.user.create({ data: { name: marker } });
        const warehouse = await tx.assetWarehouse.create({ data: { code: marker, prefix: "QA", name: marker } });
        const category = await tx.assetCategory.create({ data: { warehouseId: warehouse.id, name: "Tracking", code: "QA" } });
        await tx.assetType.create({ data: { categoryId: category.id, name: "Test Item", code: "TST" } });
        const actor = { id: admin.id, name: marker, roles: ["ADMIN"], permissions: [], organizationAssignments: [] } as unknown as CurrentUser;
        const input = { warehouseCode: warehouse.code, categoryName: category.name, typeName: "Test Item", modelName: "Tracking QA", brand: "QA Brand", locationText: "QA Room", status: "READY" as const, modelTrackMethod: "SERIAL" as const, serialNo: null, quantity: 5 };
        const created = await createAssetForUser(actor, input);
        expect(await tx.asset.findUniqueOrThrow({ where: { id: created.id }, select: { serialNo: true, assetQuantity: true, assetModel: { select: { isSerialized: true } } } })).toEqual({ serialNo: null, assetQuantity: 5, assetModel: { isSerialized: true } });
        const edit = await getAssetEditForUser(actor, created.id);
        expect(edit.kind).toBe("ok");
        await updateAssetForUser(actor, created.id, { ...input, serialNo: marker, quantity: null });
        expect(await tx.asset.findUniqueOrThrow({ where: { id: created.id }, select: { serialNo: true, assetQuantity: true } })).toEqual({ serialNo: marker, assetQuantity: 1 });
        await updateAssetForUser(actor, created.id, { ...input, quantity: 4, note: "Correct imported quantity" });
        expect(await tx.asset.findUniqueOrThrow({ where: { id: created.id }, select: { serialNo: true, assetQuantity: true, assetModel: { select: { isSerialized: true } } } })).toEqual({ serialNo: null, assetQuantity: 4, assetModel: { isSerialized: true } });
        const emptyStock = await createAssetForUser(actor, { ...input, modelName: "Empty stock QA", modelTrackMethod: "QUANTITY", quantity: 0 });
        expect((await tx.asset.findUniqueOrThrow({ where: { id: emptyStock.id } })).assetQuantity).toBe(0);
        await expect(createAssetForUser(actor, { ...input, modelName: "Invalid negative QA", modelTrackMethod: "QUANTITY", quantity: -1 })).rejects.toThrow("greater than or equal to 0");
        await updateAssetForUser(actor, created.id, { ...input, quantity: 0, note: "Prepare empty stock" });
        expect((await tx.asset.findUniqueOrThrow({ where: { id: created.id } })).assetQuantity).toBe(0);
        completed = true;
        throw rollback;
      }, { timeout: 30000 });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      context.tx = null;
    }
    expect(completed).toBe(true);
    expect(await client!.assetWarehouse.count({ where: { code: marker } })).toBe(0);
    expect(await client!.user.count({ where: { name: marker } })).toBe(0);
  }, 40000);

  it("enforces lead and warehouse gates, posts partial returns atomically, and never posts twice", async () => {
    const sourceId = randomUUID();
    const batchId = randomUUID();
    const marker = `QA-${randomUUID()}`;
    const actor = (id: string, code?: string): CurrentUser => ({
      id, name: "Rollback QA", email: "", azureAdObjectId: null, lastLoginAt: null,
      organizationLevel: null, organizationTag: null, organizationAssignments: [],
      projectTag: null, position: null, signatureDataUrl: "test-signature",
      signatureUploadedAt: null, signatureUploadedBy: null, roles: [],
      permissions: code ? [{ warehouseCode: code, canView: true, canManage: true }] : [],
    });
    let completed = false;
    try {
      await client!.$transaction(async (tx) => {
        context.tx = tx;
        const requester = await tx.user.create({ data: { name: marker } });
        const lead = await tx.user.create({ data: { name: `${marker}-lead` } });
        const stores = await Promise.all(["A", "B"].map((code) => tx.user.create({ data: { name: `${marker}-${code}` } })));
        const warehouses = await Promise.all(["A", "B"].map((code) => tx.assetWarehouse.create({ data: { code: `${marker}-${code}`, prefix: `${marker}-${code}`, name: marker } })));
        const assets = [];
        for (const warehouse of warehouses) {
          const model = await tx.assetModel.create({ data: { warehouseId: warehouse.id, name: marker, isSerialized: warehouse.id === warehouses[0].id } });
          assets.push(await tx.asset.create({ data: { warehouseId: warehouse.id, assetModelId: model.id, stockCode: `${marker}-stock`, status: "READY", assetQuantity: 10 } }));
        }
        await tx.transaction.create({ data: { id: sourceId, transactionNo: `${marker}-request`, type: "BORROW", status: "BORROWED", workflowStatus: "IN_PROGRESS", purpose: marker, internalRequest: true, requestedById: requester.id, createdById: requester.id } });
        const items = [];
        for (const asset of assets) {
          items.push(await tx.transactionItem.create({ data: { transactionId: sourceId, assetId: asset.id, assetModelId: asset.assetModelId, requestedQuantity: 2, toStatus: "BORROW", dispatchedAt: new Date(), dispatchedById: requester.id } }));
        }
        await tx.returnBatch.create({ data: { id: batchId, transactionId: sourceId, requestNo: `${marker}-return` } });
        const outcomes = [];
        for (const item of items) {
          outcomes.push(await tx.transactionItemOutcome.create({ data: { transactionId: sourceId, transactionItemId: item.id, resolutionBatchId: batchId, assetId: item.assetId, outcomeStatus: "READY", returnCondition: "NEW", quantity: 1 } }));
        }
        await tx.transactionApproval.createMany({ data: [
          { transactionId: sourceId, resolutionBatchId: batchId, userId: requester.id, requiredTag: "REQUESTER", stepSequence: 1, status: "APPROVED" },
          { transactionId: sourceId, resolutionBatchId: batchId, userId: lead.id, requiredTag: "SUPERVISOR", stepSequence: 2 },
          ...warehouses.flatMap((warehouse, index) => [
            { transactionId: sourceId, resolutionBatchId: batchId, userId: stores[index].id, requiredTag: `RETURN_CHECK:${warehouse.code}`, stepSequence: 3 },
            { transactionId: sourceId, resolutionBatchId: batchId, userId: stores[index].id, requiredTag: `STOREMAN:${warehouse.code}`, stepSequence: 4 },
          ]),
        ] });
        const storeA = actor(stores[0].id, warehouses[0].code);
        const storeB = actor(stores[1].id, warehouses[1].code);
        await expect(checkReturnOutcomes(storeA, sourceId, batchId, [outcomes[0].id], {})).rejects.toMatchObject({ code: "RETURN_CHECK_FORBIDDEN" });
        await approveTransaction(actor(lead.id), sourceId);
        await expect(checkReturnOutcomes(storeA, sourceId, batchId, [outcomes[1].id], {})).rejects.toMatchObject({ code: "RETURN_CHECK_SCOPE" });
        await checkReturnOutcomes(storeA, sourceId, batchId, [outcomes[0].id], {});
        await expect(approveTransaction(storeA, sourceId)).rejects.toMatchObject({ statusCode: 403 });
        await checkReturnOutcomes(storeB, sourceId, batchId, [outcomes[1].id], {});
        await approveTransaction(storeA, sourceId);
        expect((await tx.asset.findMany({ where: { id: { in: assets.map((asset) => asset.id) } }, orderBy: { id: "asc" } })).map((asset) => asset.assetQuantity)).toEqual([10, 10]);
        expect(await tx.transactionItemOutcome.count({ where: { resolutionBatchId: batchId, approvedAt: { not: null } } })).toBe(0);
        await approveTransaction(storeB, sourceId);
        expect((await tx.asset.findMany({ where: { id: { in: assets.map((asset) => asset.id) } } })).map((asset) => asset.assetQuantity)).toEqual([11, 11]);
        expect(await tx.transactionItemOutcome.count({ where: { resolutionBatchId: batchId, approvedAt: { not: null } } })).toBe(2);
        expect(await tx.transactionItem.count({ where: { transactionId: sourceId, returnedAt: null } })).toBe(2);
        expect(await tx.transaction.findUnique({ where: { id: sourceId }, select: { workflowStatus: true, returnedAt: true } })).toEqual({ workflowStatus: "IN_PROGRESS", returnedAt: null });
        await expect(approveTransaction(storeB, sourceId)).rejects.toBeDefined();
        expect((await tx.asset.findMany({ where: { id: { in: assets.map((asset) => asset.id) } } })).map((asset) => asset.assetQuantity)).toEqual([11, 11]);
        const histories = await tx.assetStatusHistory.findMany({ where: { transactionId: sourceId, actionType: "RETURN" } });
        expect(histories).toHaveLength(2);
        expect(histories.every((history) => history.quantityBefore === 10 && history.quantityAfter === 11 && history.quantityChanged === 1 && history.condition === "NEW")).toBe(true);

        const used = await tx.asset.create({ data: { warehouseId: warehouses[0].id, assetModelId: assets[0].assetModelId, stockCode: `${marker}-reuse`, condition: "USED", status: "NEED_CHECK", assetQuantity: 0 } });
        const nextBatchId = randomUUID();
        await tx.returnBatch.create({ data: { id: nextBatchId, transactionId: sourceId, requestNo: `${marker}-return-2` } });
        const nextOutcomes = [];
        for (const [index, item] of items.entries()) {
          nextOutcomes.push(await tx.transactionItemOutcome.create({ data: { transactionId: sourceId, transactionItemId: item.id, resolutionBatchId: nextBatchId, assetId: item.assetId, outcomeStatus: index === 0 ? "READY" : "FAIL", returnCondition: index === 0 ? "USED" : null, quantity: 1 } }));
        }
        await tx.transactionApproval.createMany({ data: [
          { transactionId: sourceId, resolutionBatchId: nextBatchId, userId: requester.id, requiredTag: "REQUESTER", stepSequence: 1, status: "APPROVED" },
          { transactionId: sourceId, resolutionBatchId: nextBatchId, userId: lead.id, requiredTag: "SUPERVISOR", stepSequence: 2 },
          ...warehouses.flatMap((warehouse, index) => [
            { transactionId: sourceId, resolutionBatchId: nextBatchId, userId: stores[index].id, requiredTag: `RETURN_CHECK:${warehouse.code}`, stepSequence: 3 },
            { transactionId: sourceId, resolutionBatchId: nextBatchId, userId: stores[index].id, requiredTag: `STOREMAN:${warehouse.code}`, stepSequence: 4 },
          ]),
        ] });
        await approveTransaction(actor(lead.id), sourceId);
        await expect(checkReturnOutcomes(storeA, sourceId, nextBatchId, [nextOutcomes[0].id], { [nextOutcomes[0].id]: assets[0].id })).rejects.toMatchObject({ code: "INVALID_RETURN_STOCK_TARGET" });
        await expect(checkReturnOutcomes(storeA, sourceId, nextBatchId, [nextOutcomes[0].id], { [nextOutcomes[0].id]: used.id })).rejects.toMatchObject({ code: "INVALID_RETURN_STOCK_TARGET" });
        await tx.asset.update({ where: { id: used.id }, data: { status: "READY" } });
        await checkReturnOutcomes(storeA, sourceId, nextBatchId, [nextOutcomes[0].id], { [nextOutcomes[0].id]: used.id });
        await checkReturnOutcomes(storeB, sourceId, nextBatchId, [nextOutcomes[1].id], {});
        await expect(approveTransaction(storeA, sourceId)).rejects.toMatchObject({ code: "SIGNED_RETURN_PDF_REQUIRED" });
        await expect(uploadSignedReturnDocument(storeA, sourceId, nextBatchId, { data: Buffer.from("%PDF-fixture"), filename: "fixture.pdf" })).rejects.toMatchObject({ code: "SIGNED_DOCUMENT_NOT_READY" });
        // Fixture bytes exercise evidence gates, not the PDF renderer or wet-signature authenticity.
        await tx.returnBatch.update({ where: { id: nextBatchId }, data: { damagePdf: Buffer.from("%PDF-fixture") } });
        await uploadSignedReturnDocument(storeA, sourceId, nextBatchId, { data: Buffer.from("%PDF-fixture"), filename: "fixture.pdf" });
        await approveTransaction(storeA, sourceId);
        expect((await tx.asset.findUniqueOrThrow({ where: { id: used.id } })).assetQuantity).toBe(0);
        await approveTransaction(storeB, sourceId);
        expect(await tx.asset.findUniqueOrThrow({ where: { id: used.id }, select: { assetQuantity: true, status: true } })).toEqual({ assetQuantity: 1, status: "READY" });
        expect(await tx.asset.count({ where: { assetModelId: used.assetModelId, stockCode: used.stockCode, condition: "USED" } })).toBe(1);
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[1].id } })).assetQuantity).toBe(11);
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[1].id } })).note).toContain("FAIL 1");
        expect((await tx.transaction.findUniqueOrThrow({ where: { id: sourceId } })).workflowStatus).toBe("COMPLETED");
        expect(await tx.transactionItem.count({ where: { transactionId: sourceId, returnedAt: null } })).toBe(0);

        const bsd = await tx.user.create({ data: { name: `${marker}-bsd` } });
        const directSale = await tx.transaction.create({ data: { transactionNo: `${marker}-sale`, type: "SOLD", status: "COMPLETED", workflowStatus: "PENDING", purpose: marker, requestedById: requester.id, createdById: requester.id } });
        const saleItem = await tx.transactionItem.create({ data: { transactionId: directSale.id, assetId: assets[0].id, assetModelId: assets[0].assetModelId, requestedQuantity: 2, toStatus: "SOLD" } });
        await tx.transactionApproval.createMany({ data: [
          { transactionId: directSale.id, userId: stores[0].id, requiredTag: `STOREMAN:${warehouses[0].code}`, stepSequence: 3 },
          { transactionId: directSale.id, userId: bsd.id, requiredTag: "BSD_HELP_DESK", stepSequence: 4 },
        ] });
        await approveTransaction(storeA, directSale.id);
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).assetQuantity).toBe(11);
        await saveSalePriceDraft(actor(bsd.id), directSale.id, { priceGroups: { [saleItem.id]: [{ quantity: 1, unitPrice: "20", total: "22" }, { quantity: 1, unitPrice: "30", total: "33" }] }, soldPrice: "60" });
        expect((await tx.transactionItem.findUniqueOrThrow({ where: { id: saleItem.id } })).salePriceGroups).toEqual([{ quantity: 1, unitPrice: "20.00", total: "20.00" }, { quantity: 1, unitPrice: "30.00", total: "30.00" }]);
        expect((await tx.transaction.findUniqueOrThrow({ where: { id: directSale.id } })).soldPrice?.toFixed(2)).toBe("50.00");
        await expect(approveTransaction(actor(bsd.id), directSale.id)).rejects.toMatchObject({ code: "SOLD_PRICE_REQUIRED" });
        await expect(saveSalePriceDraft(storeA, directSale.id, { soldPrice: "50" })).rejects.toMatchObject({ statusCode: 403 });
        await saveSalePriceDraft(actor(bsd.id), directSale.id, { prices: { [saleItem.id]: "20" }, totals: { [saleItem.id]: "45" }, soldPrice: "50" });
        expect((await tx.transaction.findUniqueOrThrow({ where: { id: directSale.id } })).workflowStatus).toBe("PENDING");
        expect((await tx.transactionItem.findUniqueOrThrow({ where: { id: saleItem.id } })).soldTotal?.toFixed(2)).toBe("40.00");
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).assetQuantity).toBe(11);
        await approveTransaction(actor(bsd.id), directSale.id, { priceGroups: { [saleItem.id]: [{ quantity: 1, unitPrice: "25.50", total: "20" }, { quantity: 1, unitPrice: "35", total: "35" }] }, soldPrice: "60" });
        expect((await tx.transactionItem.findUniqueOrThrow({ where: { id: saleItem.id } })).salePriceGroups).toEqual([{ quantity: 1, unitPrice: "25.50", total: "25.50" }, { quantity: 1, unitPrice: "35.00", total: "35.00" }]);
        expect((await tx.transactionItem.findUniqueOrThrow({ where: { id: saleItem.id } })).soldTotal?.toFixed(2)).toBe("60.50");
        expect((await tx.transaction.findUniqueOrThrow({ where: { id: directSale.id } })).soldPrice?.toFixed(2)).toBe("60.50");
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).assetQuantity).toBe(9);
        expect((await tx.transactionItem.findUniqueOrThrow({ where: { id: saleItem.id } })).soldPrice).toBeNull();
        expect((await tx.transaction.findUniqueOrThrow({ where: { id: directSale.id } })).workflowStatus).toBe("COMPLETED");

        const soldSource = await tx.transaction.create({ data: { transactionNo: `${marker}-sold-source`, type: "BORROW", status: "BORROWED", workflowStatus: "IN_PROGRESS", purpose: marker, requestedById: requester.id, createdById: requester.id } });
        const soldSourceItem = await tx.transactionItem.create({ data: { transactionId: soldSource.id, assetId: assets[0].id, requestedQuantity: 1, toStatus: "BORROW", dispatchedAt: new Date(), dispatchedById: requester.id } });
        const soldBatchId = randomUUID();
        await tx.returnBatch.create({ data: { id: soldBatchId, transactionId: soldSource.id, requestNo: `${marker}-sold-round`, state: "COMPLETED" } });
        const derivedSale = await tx.transaction.create({ data: { sourceTransactionId: soldSource.id, type: "SOLD", status: "COMPLETED", workflowStatus: "PENDING", purpose: marker, requestedById: requester.id, createdById: requester.id } });
        const derivedItem = await tx.transactionItem.create({ data: { transactionId: derivedSale.id, assetId: assets[0].id, requestedQuantity: 1, fromStatus: "BORROW", toStatus: "SOLD" } });
        const soldOutcome = await tx.transactionItemOutcome.create({ data: { transactionId: soldSource.id, transactionItemId: soldSourceItem.id, resolutionBatchId: soldBatchId, soldTransactionId: derivedSale.id, outcomeStatus: "SOLD", quantity: 1 } });
        await tx.returnOutcomeCheck.create({ data: { outcomeId: soldOutcome.id, userId: stores[0].id } });
        await tx.transactionApproval.createMany({ data: [
          { transactionId: soldSource.id, resolutionBatchId: soldBatchId, userId: stores[0].id, requiredTag: `RETURN_CHECK:${warehouses[0].code}`, stepSequence: 3, status: "APPROVED" },
          { transactionId: soldSource.id, resolutionBatchId: soldBatchId, userId: stores[0].id, requiredTag: `STOREMAN:${warehouses[0].code}`, stepSequence: 4, status: "APPROVED" },
          { transactionId: derivedSale.id, resolutionBatchId: soldBatchId, userId: bsd.id, requiredTag: "BSD_HELP_DESK", stepSequence: 5 },
        ] });
        const pricingQueue = await getPendingApprovalsForUser(actor(bsd.id));
        expect(pricingQueue.some((entry) => entry.transaction.id === derivedSale.id && entry.requiredTag === "BSD_HELP_DESK")).toBe(true);
        await approveTransaction(actor(bsd.id), derivedSale.id, { prices: { [derivedItem.id]: "0.10" }, totals: { [derivedItem.id]: "999" }, soldPrice: "999" });
        expect((await tx.transaction.findUniqueOrThrow({ where: { id: derivedSale.id } })).soldPrice?.toFixed(2)).toBe("0.10");
        expect((await tx.transactionItem.findUniqueOrThrow({ where: { id: derivedItem.id } })).soldTotal?.toFixed(2)).toBe("0.10");
        expect((await getPendingApprovalsForUser(actor(bsd.id))).some((entry) => entry.transaction.id === derivedSale.id && entry.requiredTag === "BSD_HELP_DESK")).toBe(false);
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).assetQuantity).toBe(9);
        expect(await tx.transaction.findUniqueOrThrow({ where: { id: derivedSale.id }, select: { transactionNo: true, workflowStatus: true } })).toEqual({ transactionNo: null, workflowStatus: "COMPLETED" });
        expect((await tx.transaction.findUniqueOrThrow({ where: { id: soldSource.id } })).workflowStatus).toBe("COMPLETED");
        expect((await tx.transactionItemOutcome.findUniqueOrThrow({ where: { id: soldOutcome.id } })).approvedAt).not.toBeNull();

        const storeRole = await tx.role.findUniqueOrThrow({ where: { code: "STOREMAN" } });
        await tx.userRole.create({ data: { userId: stores[0].id, roleId: storeRole.id } });
        await tx.userWarehousePermission.create({ data: { userId: stores[0].id, warehouseId: warehouses[0].id, canView: true, canManage: true } });
        const project = await tx.project.create({ data: { projectId: marker, name: marker, customerName: marker, leadUserId: lead.id } });
        const revisedSource = await tx.transaction.create({ data: { transactionNo: `${marker}-revision-source`, type: "BORROW", status: "BORROWED", workflowStatus: "IN_PROGRESS", purpose: marker, projectRequest: true, projectId: project.id, requestedById: requester.id, createdById: requester.id } });
        const revisedItem = await tx.transactionItem.create({ data: { transactionId: revisedSource.id, assetId: assets[0].id, requestedQuantity: 2, toStatus: "BORROW", dispatchedAt: new Date(), dispatchedById: requester.id } });
        const revisedBatchId = randomUUID();
        await tx.returnBatch.create({ data: { id: revisedBatchId, transactionId: revisedSource.id, requestNo: `${marker}-revision` } });
        await tx.transactionItemOutcome.create({ data: { transactionId: revisedSource.id, transactionItemId: revisedItem.id, resolutionBatchId: revisedBatchId, outcomeStatus: "READY", returnCondition: "NEW", quantity: 1 } });
        const previousLead = await tx.transactionApproval.create({ data: { transactionId: revisedSource.id, resolutionBatchId: revisedBatchId, userId: lead.id, requiredTag: "LEAD_PROJECT", stepSequence: 2 } });
        await rejectTransaction(actor(lead.id), revisedSource.id, { reason: "Correct quantity" });
        expect((await tx.returnBatch.findUniqueOrThrow({ where: { id: revisedBatchId } })).state).toBe("REJECTED");
        const requesterActor = { ...actor(requester.id, warehouses[0].code), permissions: [{ warehouseCode: warehouses[0].code, canView: true, canManage: false }] };
        await resolveTransactionItems(requesterActor, { transactionId: revisedSource.id, resolutionBatchId: revisedBatchId, items: [{ itemId: revisedItem.id, toStatus: "READY", quantity: 2, returnCondition: "NEW" }] });
        expect(await tx.returnBatch.findUniqueOrThrow({ where: { id: revisedBatchId }, select: { requestNo: true, revision: true, state: true } })).toEqual({ requestNo: `${marker}-revision`, revision: 2, state: "SUBMITTED" });
        expect(await tx.transactionApproval.findUniqueOrThrow({ where: { id: previousLead.id }, select: { status: true, isCurrent: true, comment: true } })).toEqual({ status: "REJECTED", isCurrent: false, comment: "Correct quantity" });
        expect(await tx.transactionApproval.count({ where: { transactionId: revisedSource.id, resolutionBatchId: revisedBatchId, isCurrent: true, requiredTag: "LEAD_PROJECT", status: "PENDING" } })).toBe(1);
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).assetQuantity).toBe(9);
        const issue = await tx.transaction.create({ data: { transactionNo: `${marker}-issue`, type: "BORROW", status: "BORROWED", workflowStatus: "PENDING", purpose: marker, requestedById: requester.id, createdById: requester.id } });
        for (const asset of assets) {
          await tx.transactionItem.create({ data: { transactionId: issue.id, assetId: asset.id, assetModelId: asset.assetModelId, requestedQuantity: 2, fromStatus: "READY", toStatus: "BORROW" } });
        }
        await tx.transactionApproval.createMany({ data: warehouses.map((warehouse, index) => ({ transactionId: issue.id, userId: stores[index].id, requiredTag: `STOREMAN:${warehouse.code}`, stepSequence: 3 })) });
        await approveTransaction(storeA, issue.id);
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).assetQuantity).toBe(9);
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[1].id } })).assetQuantity).toBe(11);
        await approveTransaction(storeB, issue.id);
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).assetQuantity).toBe(7);
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[1].id } })).assetQuantity).toBe(9);
        expect(await tx.transactionItem.count({ where: { transactionId: issue.id, dispatchedAt: { not: null } } })).toBe(2);
        expect((await tx.transaction.findUniqueOrThrow({ where: { id: issue.id } })).workflowStatus).toBe("IN_PROGRESS");

        const rejectedIssue = await tx.transaction.create({ data: { transactionNo: `${marker}-rejected-issue`, type: "BORROW", status: "BORROWED", workflowStatus: "PENDING", purpose: marker, requestedById: requester.id, createdById: requester.id } });
        for (const asset of assets) {
          await tx.transactionItem.create({ data: { transactionId: rejectedIssue.id, assetId: asset.id, assetModelId: asset.assetModelId, requestedQuantity: 1, fromStatus: "READY", toStatus: "BORROW" } });
        }
        await tx.transactionApproval.createMany({ data: warehouses.map((warehouse, index) => ({ transactionId: rejectedIssue.id, userId: stores[index].id, requiredTag: `STOREMAN:${warehouse.code}`, stepSequence: 3 })) });
        await approveTransaction(storeA, rejectedIssue.id);
        await rejectTransaction(storeB, rejectedIssue.id, { reason: "Warehouse B not ready" });
        expect(await tx.transaction.findUniqueOrThrow({ where: { id: rejectedIssue.id }, select: { transactionNo: true, workflowStatus: true, completedAt: true } })).toEqual({ transactionNo: `${marker}-rejected-issue`, workflowStatus: "REJECTED", completedAt: null });
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[0].id } })).assetQuantity).toBe(7);
        expect((await tx.asset.findUniqueOrThrow({ where: { id: assets[1].id } })).assetQuantity).toBe(9);
        const serialModel = await tx.assetModel.create({ data: { warehouseId: warehouses[0].id, name: marker, isSerialized: true } });
        const serialAsset = await tx.asset.create({ data: { warehouseId: warehouses[0].id, assetModelId: serialModel.id, serialNo: marker, stockCode: `${marker}-serial`, status: "BORROW" } });
        const serialSource = await tx.transaction.create({ data: { transactionNo: `${marker}-serial-source`, type: "BORROW", status: "BORROWED", workflowStatus: "IN_PROGRESS", purpose: marker, requestedById: requester.id, createdById: requester.id } });
        const serialItem = await tx.transactionItem.create({ data: { transactionId: serialSource.id, assetId: serialAsset.id, requestedQuantity: 1, toStatus: "BORROW", dispatchedAt: new Date() } });
        const serialBatchId = randomUUID();
        await tx.returnBatch.create({ data: { id: serialBatchId, transactionId: serialSource.id, requestNo: `${marker}-serial-return` } });
        const serialOutcome = await tx.transactionItemOutcome.create({ data: { transactionId: serialSource.id, transactionItemId: serialItem.id, resolutionBatchId: serialBatchId, outcomeStatus: "READY", quantity: 1 } });
        await tx.transactionApproval.createMany({ data: [
          { transactionId: serialSource.id, resolutionBatchId: serialBatchId, userId: stores[0].id, requiredTag: `RETURN_CHECK:${warehouses[0].code}`, stepSequence: 3 },
          { transactionId: serialSource.id, resolutionBatchId: serialBatchId, userId: stores[0].id, requiredTag: `STOREMAN:${warehouses[0].code}`, stepSequence: 4 },
        ] });
        await checkReturnOutcomes(storeA, serialSource.id, serialBatchId, [serialOutcome.id], {});
        await approveTransaction(storeA, serialSource.id);
        expect(await tx.asset.findUniqueOrThrow({ where: { id: serialAsset.id }, select: { status: true, serialNo: true, assetQuantity: true } })).toEqual({ status: "READY", serialNo: marker, assetQuantity: 1 });
        completed = true;
        throw rollback;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      context.tx = null;
    }
    expect(completed).toBe(true);
    expect(await client!.transaction.count({ where: { id: sourceId } })).toBe(0);
    expect(await client!.returnBatch.count({ where: { id: batchId } })).toBe(0);
    expect(await client!.user.count({ where: { name: { startsWith: marker } } })).toBe(0);
    expect(await client!.assetWarehouse.count({ where: { name: marker } })).toBe(0);
    expect(await client!.assetModel.count({ where: { name: marker } })).toBe(0);
    expect(await client!.transaction.count({ where: { purpose: marker } })).toBe(0);
  }, 40000);
});
