import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findDirectApprover, reportingPath } from "./direct-reporting";
import { organizationPositions } from "./organization-matrix";
const findUnique = vi.fn(); const findMany = vi.fn();
const tx = { user: { findUnique, findMany } } as unknown as Prisma.TransactionClient;
beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue({ organizationTag: "SYSTEM_HELP_DESK", organizationAssignments: [] });
  findMany.mockResolvedValue([{ id: "head" }]);
});
describe("direct reporting matrix", () => {
  it.each(organizationPositions)("routes $tag to only its direct manager", async (position) => {
    findUnique.mockResolvedValue({ organizationTag: position.tag, organizationAssignments: [] });
    const result = await findDirectApprover(tx, "requester");
    if (position.nextApproverRole === null) {
      expect(result).toBeNull(); expect(findMany).not.toHaveBeenCalled();
    } else {
      expect(result?.approvers).toEqual([{ id: "head" }]);
      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ organizationTag: position.nextApproverRole }]) }) }));
    }
  });
  it("does not climb past an unoccupied direct manager", async () => {
    findMany.mockResolvedValue([]);
    await expect(findDirectApprover(tx, "requester")).rejects.toMatchObject({ code: "SUPERVISOR_NOT_CONFIGURED" });
    expect(findMany).toHaveBeenCalledTimes(1);
  });
  it("rejects an ambiguous direct manager", async () => {
    findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    await expect(findDirectApprover(tx, "requester")).rejects.toMatchObject({ code: "AMBIGUOUS_SUPERVISOR" });
  });
  it("does not treat an unknown role as top-level", async () => {
    findUnique.mockResolvedValue({ organizationTag: null, organizationAssignments: [] });
    await expect(findDirectApprover(tx, "requester")).rejects.toMatchObject({ code: "ORGANIZATION_NOT_CONFIGURED" });
  });
  it("uses the primary assignment rather than a secondary warehouse bypass", async () => {
    findUnique.mockResolvedValue({ organizationTag: "WAREHOUSE_MANAGER", organizationAssignments: [
      { organizationTag: "WAREHOUSE_MANAGER", isPrimary: false },
      { organizationTag: "SYSTEM_HELP_DESK", isPrimary: true },
    ] });
    expect((await findDirectApprover(tx, "requester"))?.approvers).toHaveLength(1);
  });
  it("exposes exactly one reporting level", () => expect(reportingPath("SYSTEM", "SUPERVISOR")).toEqual([{ team: "SOLUTION", level: "MANAGER" }]));
});
