import { describe, expect, it } from "vitest";
import { readableNote } from "./readable-note";

const id = "ce514b5f-99d3-420e-b406-ffc9bf72a8f5";
describe("readable asset notes", () => {
  it("removes technical markers but retains request, outcome and quantity", () => {
    expect(readableNote(`[return-outcome:${id}] FAIL 1 from REQ-20261014-26; return batch ${id}`)).toBe("FAIL 1 from REQ-20261014-26");
  });
  it("preserves user remarks", () => {
    expect(readableNote(`LOST 1 from REQ-20261014-26; return batch ${id}; outcome ${id}; หาไม่เจอ`)).toBe("LOST 1 from REQ-20261014-26; หาไม่เจอ");
  });
  it("keeps separate lines and ordinary notes", () => {
    expect(readableNote(`เสียหาย\n[return-outcome:${id}] FAIL 2`)).toBe("เสียหาย\nFAIL 2");
    expect(readableNote("Approved quantity-pool return")).toBe("Approved quantity-pool return");
  });
  it("handles blank and UUID-only notes", () => {
    expect(readableNote(id)).toBe("-");
    expect(readableNote(null)).toBe("-");
  });
});
