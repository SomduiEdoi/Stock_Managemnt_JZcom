import { describe, expect, it } from "vitest";
import { calculateSaleGrandTotal, calculateSaleGroupTotal, clampSaleGroupQuantity, normalizeSaleMoney, validateSalePriceGroups } from "./sale-price-groups";

describe("sale price groups", () => {
  const groups = [{ quantity: 4, unitPrice: "300", total: "1100" }, { quantity: 6, unitPrice: "350", total: "2000" }];
  it("locks a single serial to one", () => expect(clampSaleGroupQuantity(groups, 0, 1, 15, true)).toBe(1));
  it("caps quantity against other groups", () => expect(clampSaleGroupQuantity(groups, 0, 10, 20, false)).toBe(4));
  it("rejects fractional and negative quantities in the input", () => {
    expect(clampSaleGroupQuantity(groups, 0, 10, 2.8, false)).toBe(2);
    expect(clampSaleGroupQuantity(groups, 0, 10, -5, false)).toBe(1);
  });
  it("calculates totals from quantity and unit price instead of trusting submitted totals", () => expect(validateSalePriceGroups(groups, 10, false, false)).toEqual([
    { quantity: 4, unitPrice: "300.00", total: "1200.00" },
    { quantity: 6, unitPrice: "350.00", total: "2100.00" },
  ]));
  it("allows incomplete draft prices", () => expect(validateSalePriceGroups([{ quantity: 3, unitPrice: "", total: "" }], 10, false, true)).toHaveLength(1));
  it("requires all quantities at approval", () => expect(() => validateSalePriceGroups(groups, 11, false, false)).toThrow());
  it("rejects excessive quantity", () => expect(() => validateSalePriceGroups(groups, 9, false, true)).toThrow());
  it("rejects splitting serials", () => expect(() => validateSalePriceGroups(groups, 10, true, false)).toThrow());
  it("rejects negative prices", () => expect(() => validateSalePriceGroups([{ quantity: 1, unitPrice: "-1", total: "0" }], 1, true, false)).toThrow());
});

describe("two-decimal sale arithmetic", () => {
  it.each([
    [3, "0.10", "0.30"],
    [3, "19.99", "59.97"],
    [7, "12.35", "86.45"],
    [1, "9999999999.99", "9999999999.99"],
    [20, "0", "0.00"],
  ])("calculates %s x %s exactly", (quantity, price, expected) => {
    expect(calculateSaleGroupTotal(quantity, price)).toBe(expected);
  });

  it("sums groups across items without floating point drift", () => {
    expect(calculateSaleGrandTotal([{ quantity: 3, unitPrice: "0.10" }, { quantity: 1, unitPrice: "0.20" }])).toBe("0.50");
  });

  it("recalculates after quantities change, groups split, or groups are removed", () => {
    const split = [{ quantity: 7, unitPrice: "0.10" }, { quantity: 1, unitPrice: "0.20" }];
    expect(calculateSaleGrandTotal(split)).toBe("0.90");
    expect(calculateSaleGrandTotal([{ ...split[0], quantity: 6 }, split[1]])).toBe("0.80");
    expect(calculateSaleGrandTotal(split.slice(1))).toBe("0.20");
  });

  it("allows blank draft prices without inventing a unit price", () => {
    expect(calculateSaleGroupTotal(3, "")).toBe("");
    expect(calculateSaleGrandTotal([{ quantity: 3, unitPrice: "" }])).toBe("0.00");
    expect(calculateSaleGrandTotal([])).toBe("0.00");
  });

  it.each(["-1", "1.005", "1e2", "NaN", "Infinity"])("rejects invalid unit price %s", (price) => {
    expect(() => calculateSaleGroupTotal(1, price)).toThrow();
  });

  it("rejects group and grand totals outside the database currency range", () => {
    expect(() => calculateSaleGroupTotal(2, "9999999999.99")).toThrow("exceed");
    expect(() => calculateSaleGrandTotal([{ quantity: 1, unitPrice: "9999999999.99" }, { quantity: 1, unitPrice: "0.01" }])).toThrow("exceed");
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid quantity %s", (quantity) => {
    expect(() => calculateSaleGroupTotal(quantity, "1.00")).toThrow();
  });

  it("normalizes entered money to exactly two decimal places", () => {
    expect(normalizeSaleMoney(" 0012.3 ")).toBe("12.30");
    expect(normalizeSaleMoney("12.")).toBe("12.00");
    expect(normalizeSaleMoney(".5")).toBe("0.50");
  });
});
