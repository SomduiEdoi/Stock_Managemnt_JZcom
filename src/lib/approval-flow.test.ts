import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import {
  approvalMatchesUser,
  approvalMatchesWarehouse,
  requiresRequesterSupervisorApproval,
  supervisorTagsForOrganizationTags,
  warehouseHeadStockControllerRequiredTag,
  warehouseStockControllerRequiredTag,
} from "./approval-flow";

describe("requester supervisor approval policy", () => {
  it.each([
    ["USING", false, true],
    ["SOLD", false, true],
    ["BORROW", true, true],
    ["BORROW", false, true],
  ])("routes %s (service=%s) through supervisor: %s", (type, serviceRequest, expected) => {
    expect(requiresRequesterSupervisorApproval(type, serviceRequest)).toBe(expected);
  });

  it("maps staff organization tags to their supervisor tags without duplicates", () => {
    expect(supervisorTagsForOrganizationTags(["CLOUD_HELP_DESK", "CLOUD_HELP_DESK", "BSD_HELP_DESK", "CLOUD_ENGINEER", null]))
      .toEqual(["CLOUD_ENGINEER", "SOLUTION_ASST_MANAGER"]);
  });
});

function user(overrides: Partial<CurrentUser>): CurrentUser {
  return {
    azureAdObjectId: null,
    email: "user@example.com",
    id: "user-id",
    lastLoginAt: null,
    name: "User",
    organizationAssignments: [],
    organizationLevel: null,
    organizationTag: null,
    permissions: [],
    position: null,
    projectTag: null,
    roles: [],
    signatureDataUrl: null,
    signatureUploadedAt: null,
    signatureUploadedBy: null,
    ...overrides,
  };
}

describe("warehouse approval matching", () => {
  it("keeps warehouse-scoped approval labels on their own warehouse", () => {
    expect(approvalMatchesWarehouse("STOREMAN:BSD", "BSD")).toBe(true);
    expect(approvalMatchesWarehouse("STOREMAN:BSD", "SALE_STOCK")).toBe(false);
    expect(approvalMatchesWarehouse("WAREHOUSE_MANAGER:NETWORK", "NETWORK")).toBe(true);
    expect(approvalMatchesWarehouse("LEAD_PROJECT", "NETWORK")).toBe(true);
  });

  it("matches stock controllers by stock tag and managed warehouse", () => {
    const approver = user({
      roles: ["STOREMAN"],
      permissions: [{ canManage: true, canView: true, warehouseCode: "SERVER" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseStockControllerRequiredTag("SERVER"),
        userId: null,
      }),
    ).toBe(true);
  });



  it("does not let warehouse approval user id bypass current warehouse permission", () => {
    const approver = user({
      id: "old-controller",
      roles: ["STOREMAN"],
      permissions: [{ canManage: false, canView: true, warehouseCode: "SERVER" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseStockControllerRequiredTag("SERVER"),
        userId: "old-controller",
      }),
    ).toBe(false);
  });

  it("does not allow a storeman from another warehouse to approve this warehouse", () => {
    const approver = user({
      roles: ["STOREMAN"],
      permissions: [{ canManage: true, canView: true, warehouseCode: "SALE_STOCK" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseStockControllerRequiredTag("BSD"),
        userId: null,
      }),
    ).toBe(false);
  });

  it("does not allow an assigned storeman to approve an approval tagged for another warehouse", () => {
    const approver = user({
      id: "assigned-storeman",
      roles: ["STOREMAN"],
      permissions: [{ canManage: true, canView: true, warehouseCode: "SALE_STOCK" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseStockControllerRequiredTag("BSD"),
        userId: "assigned-storeman",
      }),
    ).toBe(false);
  });

  it("fails closed for malformed warehouse approval tags", () => {
    const approver = user({
      organizationTag: "STOREMAN:BSD:EXTRA",
      roles: ["STOREMAN"],
      permissions: [{ canManage: true, canView: true, warehouseCode: "BSD" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: "STOREMAN:BSD:EXTRA",
        userId: null,
      }),
    ).toBe(false);
  });

  it("does not let a regular stock controller match head controller approval", () => {
    const approver = user({
      roles: ["STOREMAN"],
      permissions: [{ canManage: true, canView: true, warehouseCode: "SERVER" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseHeadStockControllerRequiredTag("SERVER"),
        userId: null,
      }),
    ).toBe(false);
  });



  it("does not match stock controller approval with read-only warehouse permission", () => {
    const approver = user({
      roles: ["STOREMAN"],
      permissions: [{ canManage: false, canView: true, warehouseCode: "SERVER" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseStockControllerRequiredTag("SERVER"),
        userId: null,
      }),
    ).toBe(false);
  });

  it("does not match head stock controller approval without warehouse visibility", () => {
    const approver = user({
      roles: ["STOREMAN"],
      permissions: [{ canManage: false, canView: false, warehouseCode: "NETWORK" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseHeadStockControllerRequiredTag("NETWORK"),
        userId: null,
      }),
    ).toBe(false);
  });

  it("does not match head stock controllers without being assigned to the approval", () => {
    const approver = user({
      roles: ["STOREMAN"],
      permissions: [{ canManage: false, canView: true, warehouseCode: "NETWORK" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseHeadStockControllerRequiredTag("NETWORK"),
        userId: null,
      }),
    ).toBe(false);
  });

  it("matches a controller with both positions for both approval paths", () => {
    const approver = user({
      id: "dual-controller",
      roles: ["STOREMAN"],
      permissions: [{ canManage: true, canView: true, warehouseCode: "SERVER" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseStockControllerRequiredTag("SERVER"),
        userId: null,
      }),
    ).toBe(true);
    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseHeadStockControllerRequiredTag("SERVER"),
        userId: "dual-controller",
      }),
    ).toBe(true);
  });

  it("scopes manual return verification to the assigned warehouse and user", () => {
    const approver = user({ id: "storeman-a", permissions: [{ warehouseCode: "INSTALLATION", canManage: true, canView: true }] });
    expect(approvalMatchesUser(approver, { requiredTag: "RETURN_CHECK:INSTALLATION", userId: "storeman-a" })).toBe(true);
    expect(approvalMatchesUser(approver, { requiredTag: "RETURN_CHECK:NETWORK", userId: "storeman-a" })).toBe(false);
    expect(approvalMatchesUser(approver, { requiredTag: "RETURN_CHECK:INSTALLATION", userId: "storeman-b" })).toBe(false);
    expect(approvalMatchesUser(approver, { requiredTag: "RETURN_CHECK:INSTALLATION:EXTRA", userId: "storeman-a" })).toBe(false);
  });

  it("matches assigned head stock controllers by user id and visible warehouse", () => {
    const approver = user({
      id: "assigned-head",
      roles: ["STOREMAN"],
      permissions: [{ canManage: false, canView: true, warehouseCode: "NETWORK" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseHeadStockControllerRequiredTag("NETWORK"),
        userId: "assigned-head",
      }),
    ).toBe(true);
  });
});
