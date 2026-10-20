import type { OrganizationLevel, Prisma } from "@prisma/client";
import { WorkflowError } from "@/lib/workflow";
import { teamForOrganizationTag } from "@/lib/organization-team-options";

export type ReportingPosition = { team: string; level: string };
export function reportingPath(team: string, level: string): ReportingPosition[] {
  const executive = { team: team === "BSD" ? "BSD" : "SOLUTION", level: "EXECUTIVE" };
  if (level === "EXECUTIVE") return [];
  if (level === "CONSULTANT") return [executive];
  const levels = ["STAFF", "SUPERVISOR", "MANAGER"];
  const index = levels.indexOf(level);
  if (index < 0 || !team) return [];
  const next = levels.slice(index + 1).map((position) => ({ team, level: position }));
  if (["SYSTEM", "NETWORK", "CLOUD"].includes(team)) next.push({ team: "SOLUTION", level: "MANAGER" }, { team: "SERVICE", level: "MANAGER" });
  if (["CMS", "SD", "PRT"].includes(team)) next.push({ team: "SERVICE", level: "SUPERVISOR" }, { team: "SERVICE", level: "MANAGER" });
  if (team === "SOLUTION") next.push({ team: "SERVICE", level: "MANAGER" });
  return [...next, executive];
}

export async function findDirectApprover(tx: Prisma.TransactionClient, requesterId: string) {
  const requester = await tx.user.findUnique({ where: { id: requesterId }, select: {
    organizationLevel: true, organizationTag: true,
    organizationAssignments: { where: { isActive: true }, orderBy: { isPrimary: "desc" }, select: { team: true, organizationLevel: true, organizationTag: true } },
  } });
  if (!requester) throw new WorkflowError("Requester not found.", 404);
  const assignment = requester.organizationAssignments[0];
  const team = assignment?.team ?? teamForOrganizationTag(assignment?.organizationTag ?? requester.organizationTag ?? "");
  const level = assignment?.organizationLevel ?? requester.organizationLevel ?? "";
  if (level === "EXECUTIVE") return null;
  for (const position of reportingPath(team, level)) {
    const candidates = await tx.user.findMany({ where: {
      id: { not: requesterId }, isActive: true,
      organizationAssignments: { some: { isActive: true, team: position.team, organizationLevel: position.level as OrganizationLevel } },
    }, select: {
      id: true, name: true, organizationTag: true, projectTag: true,
      organizationAssignments: { where: { isActive: true }, select: { organizationTag: true } },
      warehousePermissions: { select: { canManage: true, warehouse: { select: { code: true } } } },
    }, take: 2 });
    if (candidates.length > 1) throw new WorkflowError(`Multiple active managers occupy ${position.team} ${position.level}. Review organization assignments.`, 409, "AMBIGUOUS_SUPERVISOR");
    if (candidates.length === 1) return { approvers: candidates, requiredTag: "DIRECT_MANAGER" };
  }
  throw new WorkflowError("No active approver exists anywhere above your position in the organization chart.", 409, "SUPERVISOR_NOT_CONFIGURED");
}
