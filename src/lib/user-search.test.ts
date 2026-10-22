import { describe, expect, it } from "vitest";
import type { UserManagementRow } from "./user-management-shared";
import { buildUserManagementHref } from "./user-management-shared";
import { userMatchesSearch, userMatchesTeam } from "./user-search";

const user = {
  id: "person-id", name: "Example Person", email: null, provider: "LOCAL", localUsername: "local.person",
  organizationTag: "SERVICE_DESK_2_HELP_DESK", organizationLevel: "STAFF", projectTag: null,
  position: null, isActive: true, lastLoginAt: null, roleCodes: ["USER"], systemRole: "USER",
  organizationAssignments: [
    { id: "secondary", team: "WAREHOUSE", organizationTag: "WAREHOUSE_MANAGER", organizationLevel: "MANAGER", isPrimary: false },
    { id: "primary", team: "SD2", organizationTag: "SERVICE_DESK_2_HELP_DESK", organizationLevel: "STAFF", isPrimary: true },
  ],
  warehousePermissions: [{ canManage: false, canView: true, warehouse: { id: "warehouse", name: "Installation", code: "IN" } }],
} satisfies UserManagementRow;

describe("user search and primary team filter", () => {
  it.each(["local", "local.person", "example", "Service Desk 2", "help desk", "SERVICE_DESK_2_HELP_DESK", "warehouse manager", "installation", "Active", "user", "person-id", "local help desk"])("finds %s", (query) => {
    expect(userMatchesSearch(user, query)).toBe(true);
  });
  it("does not return an unrelated user", () => expect(userMatchesSearch(user, "unknown-account")).toBe(false));
  it("filters by the primary team, not the secondary warehouse assignment", () => {
    expect(userMatchesTeam(user, "SD2")).toBe(true);
    expect(userMatchesTeam(user, "WAREHOUSE")).toBe(false);
    expect(userMatchesTeam(user, "ALL")).toBe(true);
  });
  it("preserves the team and search during pagination", () => {
    expect(buildUserManagementHref({ page: 1, pageSize: 10, role: "ALL", status: "ALL", team: "SD2", search: "help desk" }, { page: 2 })).toBe("/user?q=help+desk&team=SD2&page=2");
  });
});
