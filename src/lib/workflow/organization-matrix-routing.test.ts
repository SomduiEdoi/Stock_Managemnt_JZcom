import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { buildApprovalCandidates } from "./approval-routing";
import type { SubmitTransactionInput, WorkflowRequestItem } from "./shared";

const findUnique = vi.fn(); const findMany = vi.fn(); const findProject = vi.fn();
const tx = { user: { findUnique, findMany }, project: { findFirst: findProject } } as unknown as Prisma.TransactionClient;
const requester = { id: "requester" } as CurrentUser;
const input = { type: "BORROW", internalRequest: true } as SubmitTransactionInput;
const items = [{ asset: { warehouse: { code: "SERVER" } }, quantity: 1 }] as WorkflowRequestItem[];
beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockImplementation(async ({ where }) => where.roles ? [{ id: "store", name: "Storeman" }] : [{ id: "head", name: "Head" }]);
});
describe("organization approval candidates", () => {
  it.each(["SERVICE_MANAGER", "DELIVERY_CLIENT_MANAGER", "BSD_HELP_DESK"])("sends %s directly to Storeman even for a project request", async (tag) => {
    findUnique.mockResolvedValue({ organizationTag: tag, organizationAssignments: [] });
    const rows = await buildApprovalCandidates(tx, requester, { ...input, projectRequest: true, projectId: "project" }, items);
    expect(rows).toEqual([expect.objectContaining({ userId: "store", requiredTag: "STOREMAN:SERVER", stepSequence: 2 })]);
    expect(findProject).not.toHaveBeenCalled();
  });
  it("adds one direct manager before Storeman", async () => {
    findUnique.mockResolvedValue({ organizationTag: "SYSTEM_HELP_DESK", organizationAssignments: [] });
    const rows = await buildApprovalCandidates(tx, requester, input, items);
    expect(rows.map((row) => [row.requiredTag, row.stepSequence, row.userId])).toEqual([
      ["DIRECT_MANAGER", 2, "head"], ["STOREMAN:SERVER", 3, "store"],
    ]);
  });
  it("does not issue a Storeman-only request when the required head is missing", async () => {
    findUnique.mockResolvedValue({ organizationTag: "CMS_HELP_DESK", organizationAssignments: [] });
    findMany.mockResolvedValue([]);
    await expect(buildApprovalCandidates(tx, requester, input, items)).rejects.toMatchObject({ code: "SUPERVISOR_NOT_CONFIGURED" });
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});
