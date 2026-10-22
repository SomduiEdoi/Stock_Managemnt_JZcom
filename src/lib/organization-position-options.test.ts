import { describe, expect, it } from "vitest";
import { organizationPositions } from "./organization-matrix";
import { organizationLevelForPosition, organizationPositionOptions, organizationTagForPosition, positionForOrganizationTag, teamsForPosition } from "./organization-position-options";

describe("organization position labels", () => {
  it("shows actual job titles instead of Supervisor and Staff", () => {
    expect(organizationPositionOptions.map((option) => option.label)).toEqual(["Manager", "Asst. Manager", "Engineer", "Asst. Engineer", "Help Desk"]);
  });
  it.each(organizationPositions)("round-trips $tag without changing routing levels", (entry) => {
    const position = positionForOrganizationTag(entry.tag);
    expect(organizationTagForPosition(entry.team, position)).toBe(entry.tag);
    expect(organizationLevelForPosition(position)).toBe(entry.level);
    expect(teamsForPosition(position).some((team) => team.value === entry.team)).toBe(true);
  });
  it("keeps assistant titles separate", () => {
    expect(positionForOrganizationTag("SOLUTION_ASST_MANAGER")).toBe("ASST_MANAGER");
    expect(positionForOrganizationTag("CMS_ASST_ENGINEER")).toBe("ASST_ENGINEER");
    expect(organizationTagForPosition("CMS", "ENGINEER")).toBe("");
  });
  it("does not show team names with position suffixes", () => {
    expect(teamsForPosition("").every((team) => !/MANAGER|SUPERVISOR|STAFF|HELP DESK/i.test(team.label))).toBe(true);
  });
});
