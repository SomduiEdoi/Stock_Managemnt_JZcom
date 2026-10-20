import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { findDirectApprover, reportingPath } from "./direct-reporting";
const findUnique = vi.fn(); const findMany = vi.fn();
const tx = { user: { findUnique, findMany } } as unknown as Prisma.TransactionClient;
beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue({ organizationLevel: "STAFF", organizationTag: "S1_STAFF", organizationAssignments: [{ team: "SYSTEM", organizationLevel: "STAFF", organizationTag: "S1_STAFF" }] });
});
describe("automatic next-head routing", () => {
  it("follows the Solution and Service branch above technical teams", () => expect(reportingPath("SYSTEM", "SUPERVISOR")).toEqual([{ team: "SYSTEM", level: "MANAGER" }, { team: "SOLUTION", level: "MANAGER" }, { team: "SERVICE", level: "MANAGER" }, { team: "SOLUTION", level: "EXECUTIVE" }]));
  it("sends Consultant directly to Executive", () => expect(reportingPath("SD", "CONSULTANT")).toEqual([{ team: "SOLUTION", level: "EXECUTIVE" }]));
  it("keeps the BSD executive branch separate", () => expect(reportingPath("BSD", "MANAGER")).toEqual([{ team: "BSD", level: "EXECUTIVE" }]));
  it("chooses only the next occupied position", async () => { findMany.mockResolvedValueOnce([{ id: "head" }]); expect(await findDirectApprover(tx, "requester")).toEqual({ approvers: [{ id: "head" }], requiredTag: "DIRECT_MANAGER" }); expect(findMany).toHaveBeenCalledTimes(1); });
  it("skips empty positions upward rather than requiring manual Reports To", async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "solution-manager" }]);
    expect((await findDirectApprover(tx, "requester"))?.approvers[0].id).toBe("solution-manager");
    expect(findMany).toHaveBeenNthCalledWith(3, expect.objectContaining({ where: expect.objectContaining({ id: { not: "requester" }, isActive: true, organizationAssignments: { some: { isActive: true, team: "SOLUTION", organizationLevel: "MANAGER" } } }) }));
  });
  it("does not randomly select between duplicate managers", async () => { findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]); await expect(findDirectApprover(tx, "requester")).rejects.toMatchObject({ statusCode: 409, code: "AMBIGUOUS_SUPERVISOR" }); });
  it("does not silently bypass approval when the entire branch is empty", async () => { findMany.mockResolvedValue([]); await expect(findDirectApprover(tx, "requester")).rejects.toMatchObject({ statusCode: 409, code: "SUPERVISOR_NOT_CONFIGURED" }); });
  it("does not add a supervisor step for an Executive", async () => { findUnique.mockResolvedValue({ organizationLevel: "EXECUTIVE", organizationAssignments: [] }); expect(await findDirectApprover(tx, "executive")).toBeNull(); expect(findMany).not.toHaveBeenCalled(); });
});
