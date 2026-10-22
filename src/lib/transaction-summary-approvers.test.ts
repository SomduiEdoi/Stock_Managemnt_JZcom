import { describe, expect, it } from "vitest";
import { transactionSummaryApprovers } from "./transaction-summary-approvers";
const row = (requiredTag: string, name: string, stepSequence = 2) => ({ requiredTag, stepSequence, user: { id: name, name, email: null } });
describe("summary approvers", () => {
  it("uses assigned approvers in workflow order and deduplicates users", () => {
    expect(transactionSummaryApprovers([row("STOREMAN:A", "Store", 3), row("DIRECT_MANAGER", "Manager"), row("STOREMAN:B", "Store", 3)])).toBe("Manager, Store");
  });
  it("excludes requester, acknowledgement, return rounds and archived approvals", () => {
    expect(transactionSummaryApprovers([row("REQUESTER", "Requester", 1), row("ACK_BSD", "Ack"), { ...row("DIRECT_MANAGER", "Old"), isCurrent: false }, { ...row("DIRECT_MANAGER", "Return"), resolutionBatchId: "round" }, row("LEAD_PROJECT", "Lead")])).toBe("Lead");
  });
  it("shows Storeman for top-level requests", () => expect(transactionSummaryApprovers([row("STOREMAN:A", "Store")])).toBe("Store"));
  it("handles unassigned requests", () => expect(transactionSummaryApprovers([])).toBe("-"));
});
