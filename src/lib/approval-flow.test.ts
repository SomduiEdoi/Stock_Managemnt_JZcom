import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import {
  approvalMatchesUser,
  warehouseHeadStockControllerRequiredTag,
  warehouseStockControllerRequiredTag,
} from "./approval-flow";

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
  it("matches stock controllers by stock tag and managed warehouse", () => {
    const approver = user({
      roles: ["STOCK_CONTROLLER"],
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
      roles: ["STOCK_CONTROLLER"],
      permissions: [{ canManage: false, canView: true, warehouseCode: "SERVER" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: warehouseStockControllerRequiredTag("SERVER"),
        userId: "old-controller",
      }),
    ).toBe(false);
  });

  it("does not let a regular stock controller match head controller approval", () => {
    const approver = user({
      roles: ["STOCK_CONTROLLER"],
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
      roles: ["STOCK_CONTROLLER"],
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
      roles: ["STOCK_CONTROLLER"],
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
      roles: ["STOCK_CONTROLLER"],
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
      roles: ["STOCK_CONTROLLER"],
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

  it("matches assigned head stock controllers by user id and visible warehouse", () => {
    const approver = user({
      id: "assigned-head",
      roles: ["STOCK_CONTROLLER"],
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
