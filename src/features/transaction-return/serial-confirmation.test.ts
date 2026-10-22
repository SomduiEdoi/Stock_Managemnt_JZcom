import { describe, expect, it } from "vitest";
import { canConfirmIssueSerial } from "./serial-confirmation";

const eligible = {
  workflowStatus: "PENDING", type: "BORROW", sourceTransactionId: null,
  hasOutcomes: false, approvalTag: "STOREMAN:INSTALLATION",
  warehouseCode: "INSTALLATION", isSerialized: true, assetStatus: "REQUEST",
  serialNo: "QA-SN001", isDispatched: false,
};

describe("issue serial confirmation visibility", () => {
  it("allows the current own-warehouse Storeman on issue", () => {
    expect(canConfirmIssueSerial(eligible)).toBe(true);
    expect(canConfirmIssueSerial({ ...eligible, type: "USING" })).toBe(true);
    expect(canConfirmIssueSerial({ ...eligible, type: "SOLD" })).toBe(true);
  });
  it.each([
    { approvalTag: "STOREMAN:SALE_STOCK" }, { approvalTag: "CLOUD_ENGINEER" },
    { approvalTag: null }, { workflowStatus: "IN_PROGRESS" },
    { hasOutcomes: true }, { sourceTransactionId: "source" },
    { type: "RETURN" }, { type: "SOLD", sourceTransactionId: "source" }, { isSerialized: false },
    { serialNo: null }, { assetStatus: "READY" }, { isDispatched: true },
  ])("does not expose confirmation for %j", (changes) => {
    expect(canConfirmIssueSerial({ ...eligible, ...changes })).toBe(false);
  });
});
