import { describe, expect, it } from "vitest";
import { organizationPositions } from "./organization-matrix";
import { organizationTeams, organizationTagForTeam, organizationTeamDropdownOptions, teamForOrganizationTag } from "./organization-team-options";
describe("organization team selector", () => {
  it.each(organizationPositions)("maps $tag without generic role fallbacks", (position) => {
    expect(teamForOrganizationTag(position.tag)).toBe(position.team);
    expect(organizationTagForTeam(position.team, position.level)).toBe(position.tag);
  });
  it("does not invent a position for an unsupported team/level", () => expect(organizationTagForTeam("SYSTEM", "MANAGER")).toBe(""));
  it("has unique team-only labels", () => {
    expect(new Set(organizationTeams.map((team) => team.value)).size).toBe(organizationTeams.length);
    expect(organizationTeams.every((team) => !/MANAGER|STAFF/.test(team.label))).toBe(true);
  });
  it("only offers teams with a position at the selected level", () => {
    for (const team of organizationTeamDropdownOptions("MANAGER")) expect(organizationTagForTeam(team.value, "MANAGER")).not.toBe("");
  });
});
