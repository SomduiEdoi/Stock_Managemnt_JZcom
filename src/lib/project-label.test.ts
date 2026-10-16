import { describe, expect, it } from "vitest";
import { formatProjectLabel } from "./project-label";

describe("formatProjectLabel", () => {
  it("formats customer, name and business ID", () => {
    expect(formatProjectLabel({ customerName: "Tokumi", name: "Server", projectId: "0003" })).toBe("Tokumi-Server (0003)");
  });
  it("handles missing fields", () => {
    expect(formatProjectLabel({ name: "Server" })).toBe("Server");
    expect(formatProjectLabel(null)).toBe("-");
  });
});
