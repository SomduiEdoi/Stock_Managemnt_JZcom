import { describe, expect, it } from "vitest";
import { readStoredSalePriceGroups } from "./sale-price-groups-schema";

describe("stored sale price JSON", () => {
  it("keeps legacy absent values distinct from an empty array", () => {
    expect(readStoredSalePriceGroups(null)).toBeUndefined();
    expect(readStoredSalePriceGroups(undefined)).toBeUndefined();
    expect(readStoredSalePriceGroups([])).toEqual([]);
  });

  it("preserves historical totals and unfinished draft prices without coercion", () => {
    const groups = [
      { quantity: 2, unitPrice: "10.25", total: "20.50" },
      { quantity: 1, unitPrice: "", total: "" },
    ];
    expect(readStoredSalePriceGroups(groups)).toEqual(groups);
    expect(
      readStoredSalePriceGroups([
        { quantity: 1, unitPrice: "0.00", total: "0.00" },
      ]),
    ).toEqual([{ quantity: 1, unitPrice: "0.00", total: "0.00" }]);
  });

  it.each([
    {},
    "[]",
    [null],
    [{ quantity: 1 }],
    [{ quantity: "1", unitPrice: "10.00", total: "10.00" }],
    [{ quantity: 1.5, unitPrice: "10.00", total: "15.00" }],
    [{ quantity: 0, unitPrice: "10.00", total: "0.00" }],
    [{ quantity: 1, unitPrice: 10, total: "10.00" }],
    [{ quantity: 1, unitPrice: "10.001", total: "10.00" }],
    [{ quantity: 1, unitPrice: "-1.00", total: "-1.00" }],
    [{ quantity: Number.MAX_SAFE_INTEGER + 1, unitPrice: "1", total: "1" }],
  ])(
    "rejects malformed groups instead of inventing a zero price: %j",
    (value) => {
      expect(() => readStoredSalePriceGroups(value)).toThrow(
        "Stored sale price groups are invalid",
      );
    },
  );
});
