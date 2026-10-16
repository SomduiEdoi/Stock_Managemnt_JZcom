import { describe, expect, it } from "vitest";
import { readInventoryPreferences } from "./inventory-preferences";

describe("stored inventory preferences", () => {
  it("accepts absent settings and preserves valid dynamic column names", () => {
    expect(readInventoryPreferences(null)).toBeNull();
    expect(
      readInventoryPreferences(
        '{"columns":["model","custom:length"],"widths":{"model":180}}',
      ),
    ).toEqual({ columns: ["model", "custom:length"], widths: { model: 180 } });
  });
  it.each([
    "{",
    "[]",
    '{"columns":"model"}',
    '{"columns":[null]}',
    '{"widths":{"model":"180"}}',
    '{"widths":{"model":-1}}',
  ])("rejects malformed or untrusted settings: %s", (value) => {
    expect(() => readInventoryPreferences(value)).toThrow();
  });
});
