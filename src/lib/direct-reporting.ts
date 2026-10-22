import type { Prisma } from "@prisma/client";
import { WorkflowError } from "@/lib/workflow";
import { organizationPosition, organizationPositions } from "./organization-matrix";

export type ReportingPosition = { team: string; level: string };
export function reportingPath(team: string, level: string): ReportingPosition[] {
  const position = organizationPositions.find((entry) => entry.team === team && entry.level === level);
  const next = position?.nextApproverRole ? organizationPosition(position.nextApproverRole) : null;
  return next ? [{ team: next.team, level: next.level }] : [];
}

export async function findDirectApprover(tx: Prisma.TransactionClient, requesterId: string) {
  const requester = await tx.user.findUnique({ where: { id: requesterId }, select: {
    organizationTag: true,
    organizationAssignments: { where: { isActive: true }, orderBy: { isPrimary: "desc" }, select: { organizationTag: true, isPrimary: true } },
  } });
  if (!requester) throw new WorkflowError("Requester not found.", 404);
  const primary = requester.organizationAssignments.find((assignment) => assignment.isPrimary) ?? requester.organizationAssignments[0];
  const position = organizationPosition(primary?.organizationTag ?? requester.organizationTag ?? "");
  if (!position) throw new WorkflowError("Configure a valid primary organization position before submitting a request.", 409, "ORGANIZATION_NOT_CONFIGURED");
  if (position.nextApproverRole === null) return null;
  const candidates = await tx.user.findMany({ where: {
    id: { not: requesterId }, isActive: true,
    OR: [
      { organizationTag: position.nextApproverRole },
      { organizationAssignments: { some: { isActive: true, organizationTag: position.nextApproverRole } } },
    ],
  }, select: {
    id: true, name: true, organizationTag: true, projectTag: true,
    organizationAssignments: { where: { isActive: true }, select: { organizationTag: true } },
    warehousePermissions: { select: { canManage: true, warehouse: { select: { code: true } } } },
  }, take: 2 });
  if (candidates.length > 1) throw new WorkflowError(`Multiple active users occupy ${position.nextApproverRole}. Review organization assignments.`, 409, "AMBIGUOUS_SUPERVISOR");
  if (candidates.length === 0) throw new WorkflowError(`No active direct approver is configured for ${position.nextApproverRole}. Contact your administrator.`, 409, "SUPERVISOR_NOT_CONFIGURED");
  return { approvers: candidates, requiredTag: "DIRECT_MANAGER" };
}
