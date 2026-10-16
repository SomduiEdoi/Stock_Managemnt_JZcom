import { describe, expect, it } from "vitest";
import { isLegacyUsedModelAlias } from "@/lib/return-stock";

const source = {
  id: "canonical",
  name: "AMC-3662",
  brand: "Commscope",
  partNo: "1859247-7",
  description: "Patch Cord CAT6, (AM-3662)",
};

describe("isLegacyUsedModelAlias", () => {
  it("matches a legacy Used model by part number and brand", () => {
    expect(isLegacyUsedModelAlias(source, {
      ...source,
      id: "legacy-used",
      name: "AMC-3682",
      description: "Patch Cord CAT6, (AM-3662) (Used)",
    })).toBe(true);
  });

  it("rejects a different product or a non-Used model", () => {
    expect(isLegacyUsedModelAlias(source, {
      ...source,
      id: "other-part",
      partNo: "DIFFERENT",
      description: "Different model (Used)",
    })).toBe(false);
    expect(isLegacyUsedModelAlias(source, {
      ...source,
      id: "same-product-new",
    })).toBe(false);
  });

  it("falls back to matching name and normalized description when part number is absent", () => {
    const sourceWithoutPartNo = { ...source, partNo: null };
    expect(isLegacyUsedModelAlias(sourceWithoutPartNo, {
      ...sourceWithoutPartNo,
      id: "legacy-used",
      description: "Patch Cord CAT6, (AM-3662) (Used)",
    })).toBe(true);
  });
});
