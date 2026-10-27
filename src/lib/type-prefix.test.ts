import { describe, expect, it } from "vitest";
import { duplicateTypePrefix } from "./type-prefix";
describe("category-scoped type prefixes", () => {
  it("allows the same prefix in separate categories", () => {
    for (const types of [[{ code: "SAS" }, { code: "SAT" }], [{ code: "SAS" }, { code: "SAT" }]]) expect(duplicateTypePrefix(types)).toBeNull();
  });
  it("rejects duplicate codes within one category ignoring case and whitespace", () => expect(duplicateTypePrefix([{ code: "SAS" }, { code: " sas " }])).toBe("SAS"));
  it("ignores deleted rows and empty prefixes", () => expect(duplicateTypePrefix([{ code: "SAS" }, { code: "SAS", delete: true }, { code: "" }, { code: null }])).toBeNull());
});
