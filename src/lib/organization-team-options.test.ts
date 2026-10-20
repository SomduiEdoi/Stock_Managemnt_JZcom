import { describe, expect, it } from "vitest";
import { organizationTeams, organizationTagForTeam, organizationTeamDropdownOptions, teamForOrganizationTag } from "./organization-team-options";
describe("clean organization team selection", () => {
  it("shows teams once including Warehouse without position tags", () => {
    expect(organizationTeams.map((team) => team.label)).toEqual(["System", "Network", "Cloud", "CMS", "Service Desk", "PRT", "Delivery & Client", "BSD", "Service", "Solution", "Warehouse"]);
    expect(new Set(organizationTeams.map((team) => team.value)).size).toBe(11);
  });
  it.each([["S1_STAFF", "SYSTEM", "STAFF"], ["N1_SUPERVISOR", "NETWORK", "SUPERVISOR"], ["C1_STAFF", "CLOUD", "STAFF"], ["CMS_STAFF", "CMS", "STAFF"], ["SD_SUPERVISOR", "SD", "SUPERVISOR"], ["PRT_STAFF", "PRT", "STAFF"], ["DL_MANAGER", "DL", "MANAGER"], ["BSD_STAFF", "BSD", "STAFF"]])("round trips %s without moving the stored tag", (tag, team, level) => {
    expect(teamForOrganizationTag(tag)).toBe(team);
    expect(organizationTagForTeam(team, level)).toBe(tag);
  });
  it("maps the existing warehouse-manager assignment in both directions", () => {
    expect(teamForOrganizationTag("WAREHOUSE_MANAGER")).toBe("WAREHOUSE");
    expect(organizationTagForTeam("WAREHOUSE", "MANAGER")).toBe("WAREHOUSE_MANAGER");
  });
  it.each(["SCN_MANAGER", "EN_MANAGER", "LOCAL_STAFF", "CONSULTANT"])("leaves uncertain %s unmapped", (tag) => expect(teamForOrganizationTag(tag)).toBe(""));
  it("supports all levels independently of legacy position tags", () => {
    expect(organizationTagForTeam("SYSTEM", "MANAGER")).toBe("MANAGER");
    expect(organizationTagForTeam("SERVICE", "MANAGER")).toBe("CS_MANAGER");
    expect(organizationTagForTeam("BSD", "CONSULTANT")).toBe("CONSULTANT");
    expect(organizationTeamDropdownOptions("CONSULTANT")).toHaveLength(11);
  });
  it("supports all team/level pairs", () => {
    for (const team of organizationTeams) for (const level of ["STAFF", "SUPERVISOR", "MANAGER", "CONSULTANT", "EXECUTIVE"]) expect(organizationTagForTeam(team.value, level)).not.toBe("");
  });
});
