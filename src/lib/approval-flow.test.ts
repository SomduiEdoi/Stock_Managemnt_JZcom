import { describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth";
import {
  approvalMatchesUser,
  domainHeadStockControllerRequiredTag,
  domainStockControllerRequiredTag,
} from "./approval-flow";

function user(overrides: Partial<CurrentUser>): CurrentUser {
  return {
    azureAdObjectId: null,
    email: "user@example.com",
    id: "user-id",
    lastLoginAt: null,
    name: "User",
    organizationLevel: null,
    organizationTag: null,
    permissions: [],
    position: null,
    projectTag: null,
    roles: [],
    signatureDataUrl: null,
    signatureUploadedAt: null,
    signatureUploadedBy: null,
    stockControllerTag: null,
    ...overrides,
  };
}

describe("domain approval matching", () => {
  it("matches stock controllers by stock tag and managed domain", () => {
    const approver = user({
      roles: ["STOCK_CONTROLLER"],
      stockControllerTag: "STOCK_CONTROLLER",
      permissions: [{ canManage: true, canView: true, domainCode: "SERVER" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: domainStockControllerRequiredTag("SERVER"),
        userId: null,
      }),
    ).toBe(true);
  });



  it("does not let domain approval user id bypass current domain permission", () => {
    const approver = user({
      id: "old-controller",
      roles: ["STOCK_CONTROLLER"],
      stockControllerTag: "STOCK_CONTROLLER",
      permissions: [{ canManage: false, canView: true, domainCode: "SERVER" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: domainStockControllerRequiredTag("SERVER"),
        userId: "old-controller",
      }),
    ).toBe(false);
  });

  it("does not let a regular stock controller match head controller approval", () => {
    const approver = user({
      roles: ["STOCK_CONTROLLER"],
      stockControllerTag: "STOCK_CONTROLLER",
      permissions: [{ canManage: true, canView: true, domainCode: "SERVER" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: domainHeadStockControllerRequiredTag("SERVER"),
        userId: null,
      }),
    ).toBe(false);
  });



  it("does not match stock controller approval with read-only domain permission", () => {
    const approver = user({
      roles: ["STOCK_CONTROLLER"],
      stockControllerTag: "STOCK_CONTROLLER",
      permissions: [{ canManage: false, canView: true, domainCode: "SERVER" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: domainStockControllerRequiredTag("SERVER"),
        userId: null,
      }),
    ).toBe(false);
  });

  it("does not match head stock controller approval without domain visibility", () => {
    const approver = user({
      roles: ["STOCK_CONTROLLER"],
      stockControllerTag: "HEAD_STOCK_CONTROLLER",
      permissions: [{ canManage: false, canView: false, domainCode: "NETWORK" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: domainHeadStockControllerRequiredTag("NETWORK"),
        userId: null,
      }),
    ).toBe(false);
  });

  it("does not match head stock controllers without being assigned to the approval", () => {
    const approver = user({
      roles: ["STOCK_CONTROLLER"],
      stockControllerTag: "HEAD_STOCK_CONTROLLER",
      permissions: [{ canManage: false, canView: true, domainCode: "NETWORK" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: domainHeadStockControllerRequiredTag("NETWORK"),
        userId: null,
      }),
    ).toBe(false);
  });

  it("matches assigned head stock controllers by user id and visible domain", () => {
    const approver = user({
      id: "assigned-head",
      roles: ["STOCK_CONTROLLER"],
      stockControllerTag: "HEAD_STOCK_CONTROLLER",
      permissions: [{ canManage: false, canView: true, domainCode: "NETWORK" }],
    });

    expect(
      approvalMatchesUser(approver, {
        requiredTag: domainHeadStockControllerRequiredTag("NETWORK"),
        userId: "assigned-head",
      }),
    ).toBe(true);
  });
});
