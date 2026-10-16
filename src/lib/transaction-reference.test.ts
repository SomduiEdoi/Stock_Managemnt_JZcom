import { describe, expect, it } from "vitest";
import { formatTransactionReference } from "./transaction-reference";

describe("transaction references", () => {
  it("uses the original request number for a derived sale without allocating another number", () => {
    expect(formatTransactionReference({ type: "SOLD", transactionNo: null, sourceTransactionId: "internal-uuid", sourceTransaction: { transactionNo: "REQ-20261014-28" } })).toBe("From REQ-20261014-28");
  });
  it("retains ordinary request numbers", () => {
    expect(formatTransactionReference({ type: "BORROW", transactionNo: "REQ-20261014-28" })).toBe("REQ-20261014-28");
  });
  it("uses document references for legacy source requests", () => {
    expect(formatTransactionReference({ type: "SOLD", sourceTransactionId: "uuid", sourceTransaction: { documentRef: "LEGACY-01" } })).toBe("From LEGACY-01");
  });
  it("does not expose internal IDs when document numbers are absent", () => {
    expect(formatTransactionReference({ type: "SOLD", sourceTransactionId: "uuid" })).toBe("-");
  });
});
