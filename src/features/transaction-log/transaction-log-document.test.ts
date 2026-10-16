import { describe, expect, it, vi } from "vitest";
import { TransactionWorkflowStatus } from "@prisma/client";
import type {
  TransactionApprovalQueueRow,
  TransactionLogRow,
} from "@/lib/transaction-log";
import {
  approvalAssetSummary,
  formatReturnDate,
  getLogDisplayStatus,
  hasFullyPostedItems,
  type LogOutcomeQuantity,
} from "./transaction-log-page";
import { buildTransactionLogSearchSuggestions } from "./transaction-log-controls";

vi.mock("@/lib/auth", () => ({ requireCurrentUser: vi.fn() }));
vi.mock("@/lib/transaction-log", () => ({}));
vi.mock("@/lib/request-cart", () => ({}));
vi.mock("@/lib/permissions", () => ({ hasRole: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));

const postedAt = new Date("2026-10-05T03:00:00Z");
function row(quantityOutcomes: LogOutcomeQuantity[] = []) {
  return {
    id: "source",
    transactionNo: "REQ-SOURCE",
    type: "USING",
    workflowStatus: TransactionWorkflowStatus.IN_PROGRESS,
    returnedAt: null,
    requestedBy: { name: "Requester", email: "requester@example.com" },
    items: [
      {
        id: "item",
        requestedQuantity: 10,
        returnedAt: null,
        asset: null,
        returnedBy: null,
      },
    ],
    outcomeRecords: [],
    quantityOutcomes,
  } as unknown as TransactionLogRow & {
    quantityOutcomes: LogOutcomeQuantity[];
  };
}

describe("transaction log document state", () => {
  it("does not resolve a quantity line from pending quantities or a premature item timestamp", () => {
    const data = row([
      { transactionItemId: "item", quantity: 2, approvedAt: postedAt },
      { transactionItemId: "item", quantity: 8, approvedAt: null },
    ]);
    data.items[0].returnedAt = postedAt;
    data.returnedAt = postedAt;
    data.workflowStatus = TransactionWorkflowStatus.COMPLETED;
    expect(hasFullyPostedItems(data)).toBe(false);
    expect(formatReturnDate(data)).toBe("Continues");
    expect(getLogDisplayStatus(data)).toBe("USING");
  });

  it("resolves only after all requested quantity is posted across cycles", () => {
    const data = row([
      {
        transactionItemId: "item",
        quantity: 2,
        approvedAt: new Date("2026-10-04T03:00:00Z"),
      },
      { transactionItemId: "item", quantity: 8, approvedAt: postedAt },
    ]);
    data.workflowStatus = TransactionWorkflowStatus.COMPLETED;
    expect(hasFullyPostedItems(data)).toBe(true);
    expect(formatReturnDate(data)).toBe("5 Oct 2026");
    expect(getLogDisplayStatus(data)).toBe("COMPLETED");
  });

  it("keeps open issued requests at Continues even before the first return", () => {
    expect(formatReturnDate(row())).toBe("Continues");
    const pending = row([
      { transactionItemId: "item", quantity: 10, approvedAt: null },
    ]);
    expect(hasFullyPostedItems(pending)).toBe(false);
    expect(formatReturnDate(pending)).toBe("Continues");
  });

  it("does not use another item's posted quantities to close an unresolved line", () => {
    const data = row([
      { transactionItemId: "another-item", quantity: 10, approvedAt: postedAt },
    ]);
    expect(hasFullyPostedItems(data)).toBe(false);
    expect(formatReturnDate(data)).toBe("Continues");
  });

  it("retains legacy final timestamps when a line has no structured outcomes", () => {
    const data = row();
    data.items[0].returnedAt = postedAt;
    expect(hasFullyPostedItems(data)).toBe(true);
    expect(formatReturnDate(data)).toBe("5 Oct 2026");
  });

  it("handles unallocated assets without inventing searchable asset metadata", () => {
    const suggestions = buildTransactionLogSearchSuggestions([row()]);
    expect(suggestions.map((suggestion) => suggestion.category)).toEqual([
      "REQ",
      "BORROWER",
    ]);
    expect(
      approvalAssetSummary({
        transaction: { items: [{ asset: null }] },
      } as unknown as TransactionApprovalQueueRow),
    ).toBe("Unallocated item (-)");
  });
});
