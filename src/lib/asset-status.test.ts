import { describe, expect, it } from "vitest";
import {
  ASSET_STATUSES,
  isAssetStatus,
  NOTE_REQUIRED_STATUSES,
} from "./asset-status";

describe("asset status rules", () => {
  it("keeps borrow as the only rent/borrow workflow status", () => {
    expect(ASSET_STATUSES).toContain("BORROW");
    expect(ASSET_STATUSES).not.toContain("RENT");
  });

  it("uses request as the temporary asset lock status", () => {
    expect(ASSET_STATUSES).toContain("REQUEST");
    expect(ASSET_STATUSES).not.toContain("WAIT");
  });

  it("requires notes for operational status changes", () => {
    expect(NOTE_REQUIRED_STATUSES.has("BORROW")).toBe(true);
    expect(NOTE_REQUIRED_STATUSES.has("SOLD")).toBe(true);
    expect(NOTE_REQUIRED_STATUSES.has("NEED_CHECK")).toBe(true);
    expect(NOTE_REQUIRED_STATUSES.has("READY")).toBe(false);
  });

  it("validates supported asset status values", () => {
    expect(isAssetStatus("READY")).toBe(true);
    expect(isAssetStatus("NEED_CHECK")).toBe(true);
    expect(isAssetStatus("RENT")).toBe(false);
  });
});
