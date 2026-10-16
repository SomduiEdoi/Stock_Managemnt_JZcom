import { expect, it } from "vitest";
import { availableReturnQuantity } from "./return-quantity";
const item = { itemId: "item", requestedQuantity: 10, resolvedQuantity: 0 };
const pending = { itemId: "item", quantity: 9, approvedAt: null, resolutionBatchId: "batch" };
it("keeps the unsubmitted quantity available while another outcome is pending", () => {
  expect(availableReturnQuantity(item, [pending])).toBe(1);
});
it("releases only the edited round from the pending total", () => {
  expect(availableReturnQuantity(item, [pending], "batch")).toBe(10);
  expect(availableReturnQuantity(item, [pending], "other")).toBe(1);
});
it("does not subtract approved quantities twice", () => {
  expect(availableReturnQuantity({ ...item, resolvedQuantity: 4 },
    [{ ...pending, quantity: 4, approvedAt: "2026-10-06" }, { ...pending, quantity: 5 }])).toBe(1);
});
it("does not include outcomes belonging to another item", () => {
  expect(availableReturnQuantity(item, [{ ...pending, itemId: "other" }])).toBe(10);
});
it("clamps exhausted or overallocated items to zero", () => {
  expect(availableReturnQuantity(item, [{ ...pending, quantity: 11 }])).toBe(0);
});
