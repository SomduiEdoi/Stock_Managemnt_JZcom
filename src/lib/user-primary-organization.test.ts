import { describe, expect, it } from "vitest";
import { primaryOrganizationDisplay } from "./user-primary-organization";

describe("primary organization table columns", () => {
  it("shows the primary team and job title, not a secondary warehouse assignment", () => {
    expect(primaryOrganizationDisplay({ organizationTag: "WAREHOUSE_MANAGER", organizationAssignments: [
      { team: "WAREHOUSE", organizationTag: "WAREHOUSE_MANAGER", isPrimary: false },
      { team: "SD2", organizationTag: "SERVICE_DESK_2_HELP_DESK", isPrimary: true },
    ] })).toEqual({ team: "Service Desk 2", organization: "Help Desk" });
  });
  it("shows assistant titles accurately", () => {
    expect(primaryOrganizationDisplay({ organizationTag: null, organizationAssignments: [
      { organizationTag: "CMS_ASST_ENGINEER", isPrimary: true },
    ] })).toEqual({ team: "CMS", organization: "Asst. Engineer" });
  });
  it("supports the legacy primary field when assignments are absent", () => {
    expect(primaryOrganizationDisplay({ organizationTag: "SOLUTION_ASST_MANAGER", organizationAssignments: [] })).toEqual({ team: "Solution Consult", organization: "Asst. Manager" });
  });
  it("does not silently choose a secondary assignment", () => {
    expect(primaryOrganizationDisplay({ organizationTag: "WAREHOUSE_MANAGER", organizationAssignments: [
      { organizationTag: "WAREHOUSE_MANAGER", isPrimary: false },
    ] })).toEqual({ team: "-", organization: "-" });
  });
  it("shows dashes for an account without an organization", () => {
    expect(primaryOrganizationDisplay({ organizationTag: null, organizationAssignments: [] })).toEqual({ team: "-", organization: "-" });
  });
});
