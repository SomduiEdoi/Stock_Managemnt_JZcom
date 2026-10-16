import { describe, expect, it } from "vitest";
import { appendUsedReturnRemarks } from "./used-return-remark";
import { readableNote } from "./readable-note";

describe("used return remarks", () => {
  const origin = { id: "ce514b5f-99d3-420e-b406-ffc9bf72a8f5", quantity: 2, requestNo: "REQ-20261014-26" };
  it("generates a readable source request for used returned stock", () => {
    expect(readableNote(appendUsedReturnRemarks(null, [origin]))).toBe("USED 2 from REQ-20261014-26");
  });
  it("preserves existing remarks and does not duplicate the same outcome", () => {
    const note = appendUsedReturnRemarks("User remark", [origin]);
    expect(appendUsedReturnRemarks(note, [origin])).toBe(note);
    expect(note).toContain("User remark");
  });
  it("retains multiple return origins and does not invent missing references", () => {
    expect(appendUsedReturnRemarks(null, [{ ...origin, requestNo: null }])).toBeNull();
    expect(readableNote(appendUsedReturnRemarks(null, [origin, { ...origin, id: "other", requestNo: "REQ-20261015-29" }]))).toContain("REQ-20261015-29");
  });
});
