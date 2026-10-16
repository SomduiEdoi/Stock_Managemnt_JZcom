import { createElement } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
import {
  TransactionReturnClient,
  type TransactionReturnRecord,
} from "./transaction-return-client";

function fixture(): TransactionReturnRecord {
  return {
    approvalStep: null,
    approvalTag: null,
    canApprove: false,
    approvalBlockedReason: null,
    canExportAnytime: true,
    isAcknowledgement: false,
    canEditPendingRequest: false,
    canReturn: true,
    editableReturnBatches: [],
    hasSignature: true,
    returnBlockedReason: null,
    id: "request-fixture",
    internalRequest: false,
    sourceTransactionId: null,
    kindLabel: "Borrow / Project",
    requestDate: "2026-10-16T03:00:00Z",
    requisitionerName: "Test Requester",
    requisitionerPosition: null,
    customerName: "Test Customer",
    projectName: "Test Project",
    projectCode: "0001",
    returnDate: null,
    originWarehouse: "Test Warehouse",
    leadSupervisorName: "Test Lead",
    currentApprovalStep: "Ready for return",
    statusLabel: "Borrow",
    note: "Test request note",
    projectId: "project-fixture",
    projectRequest: true,
    purpose: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectReason: null,
    rejectBlockedReason: null,
    requestedBy: "Test Requester",
    requiresSoldPriceApproval: false,
    serviceRequest: false,
    transactionNo: "REQ-20261016-01",
    type: "BORROW",
    workflowStatus: "IN_PROGRESS",
    outcomes: [],
    items: [
      {
        assetId: "asset-fixture",
        brand: "Test Brand",
        category: "Test Category",
        partNo: "PART-01",
        hasPendingOutcome: false,
        pendingBatchIds: [],
        isDispatched: true,
        canConfirmSerial: false,
        currentStep: "Ready for return",
        currentStatus: "READY",
        isQuantityAsset: true,
        itemId: "item-fixture",
        kindLabel: "Quantity",
        model: "Test Model",
        note: null,
        requestedQuantity: 5,
        availableQuantity: 5,
        resolvedAt: null,
        resolvedQuantity: 0,
        resolvedStatus: null,
        resolutionNote: null,
        soldPrice: null,
        serialNo: null,
        soldTotal: null,
        stockCode: "TEST-STOCK",
        typeName: "Test Type",
        warehouseName: "Test Warehouse",
      },
    ],
  };
}

function normalize(html: string) {
  // Component boundaries change React-generated IDs, not their UI semantics.
  return html.replace(/_R_[A-Za-z0-9]+_|:R[A-Za-z0-9]+:/g, "GENERATED_ID");
}

describe("return page markup compatibility", () => {
  for (const mode of [
    "return",
    "pending-edit",
    "sale-pricing",
    "outcome-summary",
  ] as const) {
    it(`preserves the ${mode} markup`, () => {
      const transaction = fixture();
      if (mode === "pending-edit") {
        transaction.canReturn = false;
        transaction.canEditPendingRequest = true;
        transaction.workflowStatus = "PENDING";
      }
      if (mode === "sale-pricing") {
        transaction.canReturn = false;
        transaction.canApprove = true;
        transaction.requiresSoldPriceApproval = true;
        transaction.type = "SOLD";
        transaction.workflowStatus = "PENDING";
        transaction.items[0].salePriceGroups = [
          { quantity: 3, unitPrice: "10.25", total: "30.75" },
          { quantity: 2, unitPrice: "20.00", total: "40.00" },
        ];
      }
      if (mode === "outcome-summary") {
        transaction.outcomes = [
          {
            id: "outcome-fixture",
            itemId: "item-fixture",
            model: "Test Model",
            resolutionBatchId: "batch-fixture",
            partNo: "PART-01",
            stockCode: "TEST-STOCK",
            typeName: "Test Type",
            warehouseName: "Test Warehouse",
            serialNo: null,
            outcomeStatus: "READY",
            quantity: 2,
            returnCondition: "USED",
            returnStockAssetId: null,
            returnStockOptions: [],
            note: "Returned used",
            soldPrice: null,
            approvedAt: null,
            canChooseCondition: true,
            canDelete: true,
          },
        ];
      }
      const props = {
        canExportAnytime: true,
        transaction,
        projects: [
          {
            id: "project-fixture",
            name: "Test Project",
            customerName: "Test Customer",
            projectId: "0001",
          },
        ],
      };
      const current = normalize(
        renderToStaticMarkup(createElement(TransactionReturnClient, props)),
      );
      // Golden markup was captured from the pre-refactor component after exact comparison.
      expect(current).toMatchSnapshot();
    });
  }
});
