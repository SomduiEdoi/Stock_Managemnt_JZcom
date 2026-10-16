import { describe, expect, it } from "vitest";
import { filterFormHref } from "./instant-filter-form";

function values(entries: Array<[string, string]>) {
  const data = new FormData();
  entries.forEach(([key, value]) => data.append(key, value));
  return data;
}

describe("instant filter navigation", () => {
  it("clears only the query and retains selected filters", () => {
    const url = filterFormHref("/dashboard/server", values([
      ["q", ""], ["category", "Spare Part"], ["brand", "HPE"], ["status", "READY"], ["page", "4"],
    ]));
    expect(url).toBe("/dashboard/server?category=Spare+Part&brand=HPE&status=READY");
  });
  it("retains all child types and multiple selected values", () => {
    const url = filterFormHref("/dashboard/server", values([
      ["category", "Spare Part"], ["type", "Battery"], ["type", "Fan"], ["brand", "HPE"], ["brand", "DELL"],
    ]));
    expect(new URL(url, "http://localhost").searchParams.getAll("type")).toEqual(["Battery", "Fan"]);
    expect(new URL(url, "http://localhost").searchParams.getAll("brand")).toEqual(["HPE", "DELL"]);
  });
  it("resets pagination on each filter change", () => {
    expect(filterFormHref("/logs", values([["status", "COMPLETED"], ["page", "8"]]))).toBe("/logs?status=COMPLETED");
  });
  it("encodes free text safely", () => {
    expect(filterFormHref("/user", values([["q", "A&B / ไทย"]]))).toBe("/user?q=A%26B+%2F+%E0%B9%84%E0%B8%97%E0%B8%A2");
  });
  it("returns the default route for empty filters", () => {
    expect(filterFormHref("/dashboard/server", values([["q", ""], ["page", "1"]]))).toBe("/dashboard/server");
  });
});
