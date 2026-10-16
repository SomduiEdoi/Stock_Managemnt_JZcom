import { describe, expect, it } from "vitest";
import { AssetStatus } from "@prisma/client";
import { buildReturnBatchRevision, canOpenReturnApproval, classifyReturnOutcome, formatReturnDate, getReturnResolutionOptions, removeResolutionAllocation } from "./transaction-return-client";

import { hasOpenReturnQuantity } from "./transaction-return-client";

describe("open return counters", () => {
  it("excludes completed direct and derived sales even without return outcomes", () => {
    expect(hasOpenReturnQuantity("COMPLETED", 2)).toBe(false);
    expect(hasOpenReturnQuantity("CANCELLED", 2)).toBe(false);
  });
  it("preserves outstanding quantities on active partial returns", () => {
    expect(hasOpenReturnQuantity("IN_PROGRESS", 1)).toBe(true);
    expect(hasOpenReturnQuantity("IN_PROGRESS", 0)).toBe(false);
    expect(hasOpenReturnQuantity("PENDING", 2)).toBe(true);
  });
});

describe("warehouse return check rejection", () => {
  it("allows rejection but not final approval during manual check", () => {
    expect(canOpenReturnApproval(true, "RETURN_CHECK:SALE_STOCK", "REJECT")).toBe(true);
    expect(canOpenReturnApproval(true, "RETURN_CHECK:SALE_STOCK", "APPROVE")).toBe(false);
  });

  it("does not grant an action without a matching current approval", () => {
    expect(canOpenReturnApproval(false, "RETURN_CHECK:INSTALLATION", "REJECT")).toBe(false);
    expect(canOpenReturnApproval(true, "STOREMAN:SALE_STOCK", "APPROVE")).toBe(true);
  });
});

describe("requester return classification", () => {
  it("maps RETURN to READY / NEW", () => {
    expect(classifyReturnOutcome("READY", false)).toEqual({ toStatus: AssetStatus.READY, returnCondition: "NEW" });
  });

  it("maps quantity USED to READY / USED", () => {
    expect(classifyReturnOutcome("USED", true)).toEqual({ toStatus: AssetStatus.READY, returnCondition: "USED" });
  });

  it("does not permit USED for serialized assets or NEED_CHECK", () => {
    expect(() => classifyReturnOutcome("USED", false)).toThrow();
    expect(() => classifyReturnOutcome("NEED_CHECK", true)).toThrow();
    expect(getReturnResolutionOptions(false).map((option) => option.value)).not.toContain("USED");
    expect(getReturnResolutionOptions(true).map((option) => option.value)).not.toContain("NEED_CHECK");
  });

  it("does not assign a return condition to damage or sale", () => {
    for (const status of ["FAIL", "LOST", "SOLD"]) {
      expect(classifyReturnOutcome(status, true).returnCondition).toBeNull();
    }
  });
});

describe("return dates", () => {
  it("uses Gregorian Bangkok dates across the UTC date boundary", () => {
    expect(formatReturnDate("2026-10-04T18:30:00.000Z")).toBe("05 Oct 2026, 01:30");
  });
});

describe("same-round revision", () => {
  it("rehydrates only unposted outcomes in the chosen batch", () => {
    const item = { itemId: "item", requestedQuantity: 5, resolvedAt: null };
    const outcome = { itemId: "item", resolutionBatchId: "batch", approvedAt: null, quantity: 2, outcomeStatus: AssetStatus.READY, returnCondition: "USED" as const, note: "original", soldPrice: null };
    const state = buildReturnBatchRevision([item], [outcome, { ...outcome, resolutionBatchId: "other" }, { ...outcome, approvedAt: "2026-10-05" }], "batch");
    expect(state.item.selected).toBe(true);
    expect(state.item.allocations).toEqual([{ quantity: 2, toStatus: AssetStatus.READY, returnCondition: "USED", note: "original", soldPrice: "" }]);
    expect(buildReturnBatchRevision([item], [outcome], "").item.selected).toBe(false);
    expect(buildReturnBatchRevision([{ ...item, resolvedAt: "2026-10-05", resolvedQuantity: 3 }], [outcome], "batch").item.allocations).toHaveLength(1);
  });
});

describe("removing draft split outcomes", () => {
  const allocations = [
    { quantity: 5, toStatus: AssetStatus.READY, returnCondition: "NEW" as const, note: "Return five", soldPrice: "" },
    { quantity: 17, toStatus: AssetStatus.SOLD, returnCondition: null, note: "Sell seventeen", soldPrice: "100" },
  ];
  const state = { selected: true, quantity: 5, toStatus: AssetStatus.READY, allocations };

  it("removes one split without moving its quantity into the remaining outcome", () => {
    const next = removeResolutionAllocation(state, 1);
    expect(next.allocations).toEqual([allocations[0]]);
    expect(next.quantity).toBe(5);
    expect(next.selected).toBe(true);
    expect(state.allocations).toHaveLength(2);
  });

  it("synchronizes the selected outcome when removing the first split", () => {
    const next = removeResolutionAllocation(state, 0);
    expect(next.allocations).toEqual([allocations[1]]);
    expect(next.quantity).toBe(17);
    expect(next.toStatus).toBe(AssetStatus.SOLD);
  });

  it("keeps at least one outcome and ignores invalid indexes", () => {
    const single = { ...state, allocations: [allocations[0]] };
    expect(removeResolutionAllocation(single, 0)).toBe(single);
    expect(removeResolutionAllocation(state, -1)).toBe(state);
    expect(removeResolutionAllocation(state, 2)).toBe(state);
  });
});
