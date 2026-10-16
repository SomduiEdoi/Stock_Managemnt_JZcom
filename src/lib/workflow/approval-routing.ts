import {
  ApprovalStatus,
  OrganizationTag,
  Prisma,
  ProjectTag,
  TransactionType,
} from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import {
  requiresRequesterSupervisorApproval,
  supervisorTagsForOrganizationTags,
  warehouseStockControllerRequiredTag,
} from "@/lib/approval-flow";
import { WorkflowError, requireWorkflowUserById } from "./shared";
import type {
  SubmitTransactionInput,
  TransactionDetail,
  WorkflowRequestItem,
} from "./shared";

type ApprovalCandidate = {
  requiredTag: string;
  stepSequence: number;
  userId: string | null;
  approverNameSnapshot: string | null;
  approverTagSnapshot: string | null;
};

type ApprovalUser = {
  id: string;
  organizationAssignments: Array<{
    organizationTag: OrganizationTag;
  }>;
  name: string;
  organizationTag: OrganizationTag | null;
  projectTag: ProjectTag | null;
  warehousePermissions: Array<{
    canManage: boolean;
    canView?: boolean;
    warehouse: { code: string };
  }>;
};

function candidateForUser(
  user: ApprovalUser | null | undefined,
  requiredTag: string,
  stepSequence: number,
): ApprovalCandidate {
  return {
    approverNameSnapshot: user?.name ?? null,
    approverTagSnapshot: requiredTag,
    requiredTag,
    stepSequence,
    userId: user?.id ?? null,
  };
}

export async function findOrganizationApprover(
  tx: Prisma.TransactionClient,
  tag: OrganizationTag | null,
  requesterId: string,
) {
  if (!tag) {
    return null;
  }

  if (tag === OrganizationTag.BSD_STAFF) {
    return tx.user.findFirst({
      select: {
        warehousePermissions: {
          select: { canManage: true, warehouse: { select: { code: true } } },
        },
        id: true,
        name: true,
        organizationAssignments: {
          select: { organizationTag: true },
          where: { isActive: true },
        },
        organizationTag: true,
        projectTag: true,
      },
      where: {
        isActive: true,
        id: { not: requesterId },
        OR: [
          { organizationTag: OrganizationTag.BSD_STAFF },
          {
            organizationAssignments: {
              some: {
                isActive: true,
                organizationTag: OrganizationTag.BSD_STAFF,
              },
            },
          },
        ],
      },
    });
  }

  if (tag === OrganizationTag.BSD_MANAGER) {
    return tx.user.findFirst({
      select: {
        warehousePermissions: {
          select: { canManage: true, warehouse: { select: { code: true } } },
        },
        id: true,
        name: true,
        organizationAssignments: {
          select: { organizationTag: true },
          where: { isActive: true },
        },
        organizationTag: true,
        projectTag: true,
      },
      where: {
        isActive: true,
        id: { not: requesterId },
        OR: [
          { organizationTag: OrganizationTag.BSD_MANAGER },
          {
            organizationAssignments: {
              some: {
                isActive: true,
                organizationTag: OrganizationTag.BSD_MANAGER,
              },
            },
          },
        ],
      },
    });
  }

  return tx.user.findFirst({
    orderBy: { name: "asc" },
    select: {
      warehousePermissions: {
        select: { canManage: true, warehouse: { select: { code: true } } },
      },
      id: true,
      name: true,
      organizationAssignments: {
        select: { organizationTag: true },
        where: { isActive: true },
      },
      organizationTag: true,
      projectTag: true,
    },
    where: {
      id: { not: requesterId },
      isActive: true,
      OR: [
        { organizationTag: tag },
        {
          organizationAssignments: {
            some: { organizationTag: tag, isActive: true },
          },
        },
      ],
    },
  });
}

function supervisorTagsForUser(user: CurrentUser) {
  return supervisorTagsForOrganizationTags([
    user.organizationTag,
    ...user.organizationAssignments.map(
      (assignment) => assignment.organizationTag,
    ),
  ]) as OrganizationTag[];
}

async function findUsingSupervisorApprover(
  tx: Prisma.TransactionClient,
  user: CurrentUser,
) {
  const supervisorTags = supervisorTagsForUser(user);

  for (const supervisorTag of supervisorTags) {
    const approvers = await tx.user.findMany({
      orderBy: { name: "asc" },
      select: {
        warehousePermissions: {
          select: { canManage: true, warehouse: { select: { code: true } } },
        },
        id: true,
        name: true,
        organizationAssignments: {
          select: { organizationTag: true },
          where: { isActive: true },
        },
        organizationTag: true,
        projectTag: true,
      },
      where: {
        id: { not: user.id },
        isActive: true,
        OR: [
          { organizationTag: supervisorTag },
          {
            organizationAssignments: {
              some: { isActive: true, organizationTag: supervisorTag },
            },
          },
        ],
      },
    });

    if (approvers.length > 0) {
      return { approvers, requiredTag: supervisorTag };
    }
  }

  return null;
}

async function findProjectApprovers(
  tx: Prisma.TransactionClient,
  requesterId: string,
  projectId: string | null | undefined,
) {
  const select = {
    warehousePermissions: {
      select: { canManage: true, warehouse: { select: { code: true } } },
    },
    id: true,
    name: true,
    organizationAssignments: {
      select: { organizationTag: true },
      where: { isActive: true },
    },
    organizationTag: true,
    projectTag: true,
  } satisfies Prisma.UserSelect;

  if (projectId) {
    const project = await tx.project.findFirst({
      where: { id: projectId, status: "ACTIVE" },
      select: {
        leadUser: { select },
        members: {
          orderBy: { createdAt: "asc" },
          select: { user: { select } },
          where: { projectTag: "LEAD_PROJECT", userId: { not: requesterId } },
        },
      },
    });

    const projectLeads = [
      ...(project?.leadUser ? [project.leadUser] : []),
      ...(project?.members ?? []).map((member) => member.user),
    ].filter(
      (lead, index, leads) =>
        lead.id !== requesterId &&
        leads.findIndex((item) => item.id === lead.id) === index,
    );
    if (projectLeads.length > 0) {
      return projectLeads;
    }
  }

  return tx.user.findMany({
    orderBy: { name: "asc" },
    select,
    where: {
      id: { not: requesterId },
      isActive: true,
      projectTag: ProjectTag.LEAD_PROJECT,
    },
  });
}

async function findStockControllerApprovers(
  tx: Prisma.TransactionClient,
  warehouseCode: string,
  stockControllerTag: "WAREHOUSE_MANAGER" | "STOREMAN",
) {
  if (stockControllerTag === "WAREHOUSE_MANAGER") {
    const warehouse = await tx.assetWarehouse.findFirst({
      select: { managerAssignments: { select: { userId: true } } },
      where: { code: warehouseCode, isActive: true },
    });

    if (!warehouse || warehouse.managerAssignments.length === 0) {
      return [];
    }

    return tx.user.findMany({
      orderBy: { name: "asc" },
      select: {
        warehousePermissions: {
          select: {
            canManage: true,
            canView: true,
            warehouse: { select: { code: true } },
          },
        },
        id: true,
        name: true,
        organizationAssignments: {
          select: { organizationTag: true },
          where: { isActive: true },
        },
        organizationTag: true,
        projectTag: true,
      },
      where: {
        id: {
          in: warehouse.managerAssignments.map(
            (assignment) => assignment.userId,
          ),
        },
        isActive: true,
      },
    });
  }

  const warehousePermissionWhere = {
    canManage: true,
    warehouse: { code: warehouseCode },
  };

  return tx.user.findMany({
    orderBy: { name: "asc" },
    select: {
      warehousePermissions: {
        select: {
          canManage: true,
          canView: true,
          warehouse: { select: { code: true } },
        },
      },
      id: true,
      name: true,
      organizationAssignments: {
        select: { organizationTag: true },
        where: { isActive: true },
      },
      organizationTag: true,
      projectTag: true,
    },
    where: {
      warehousePermissions: {
        some: warehousePermissionWhere,
      },
      isActive: true,
      roles: { some: { role: { code: "STOREMAN" } } },
    },
  });
}

function candidatesForUsers(
  users: ApprovalUser[],
  requiredTag: string,
  stepSequence: number,
) {
  if (users.length === 0) {
    return [candidateForUser(null, requiredTag, stepSequence)];
  }

  // Every eligible user in the step must approve before the workflow advances.
  return users.map((user) => candidateForUser(user, requiredTag, stepSequence));
}

export async function buildApprovalCandidates(
  tx: Prisma.TransactionClient,
  user: CurrentUser,
  input: SubmitTransactionInput,
  items: WorkflowRequestItem[],
) {
  const approvals: ApprovalCandidate[] = [];
  // Step 1 is the request record itself. Approval sequences start at Step 2.
  let stepSequence = 2;

  // Project approval is determined by the selected project, not by the
  // requester's global project tag. A requester may have a different
  // organizational role while still submitting a project request.
  if (input.projectRequest && input.projectId) {
    approvals.push(
      ...candidatesForUsers(
        await findProjectApprovers(tx, user.id, input.projectId),
        ProjectTag.LEAD_PROJECT,
        stepSequence,
      ),
    );
    stepSequence++;
  }

  // Internal Using and Sold requests, plus service requests, pass through the
  // requester's supervisor before warehouse approval. Only staff-tagged users
  // have a supervisor step; fail closed if that configured approver is missing.
  if (requiresRequesterSupervisorApproval(input.type, input.serviceRequest)) {
    const supervisorTags = supervisorTagsForUser(user);
    const supervisor = await findUsingSupervisorApprover(tx, user);
    if (supervisorTags.length > 0) {
      if (!supervisor || supervisor.approvers.length === 0) {
        throw new WorkflowError(
          "No active supervisor is configured for your organization.",
          409,
          "SUPERVISOR_NOT_CONFIGURED",
        );
      }
      approvals.push(
        ...candidatesForUsers(
          supervisor.approvers,
          supervisor.requiredTag,
          stepSequence,
        ),
      );
      stepSequence++;
    }
  }

  // Storeman is the final warehouse step. Every eligible Storeman for each
  // warehouse must approve before a Sold request can move to BSD.
  const warehouseCodes = Array.from(
    new Set(items.map((item) => item.asset.warehouse.code)),
  ).sort();
  for (const warehouseCode of warehouseCodes) {
    approvals.push(
      ...candidatesForUsers(
        await findStockControllerApprovers(tx, warehouseCode, "STOREMAN"),
        warehouseStockControllerRequiredTag(warehouseCode),
        stepSequence,
      ),
    );
  }

  stepSequence++;

  // Sold requests are reviewed by Joy (BSD_STAFF) after all Storeman
  // approvals. This is a real approval step, not the later acknowledgement.
  if (input.type === TransactionType.SOLD) {
    const bsd = await findOrganizationApprover(
      tx,
      OrganizationTag.BSD_STAFF,
      user.id,
    );
    if (!bsd)
      throw new WorkflowError(
        "No active BSD Staff approver is configured.",
        409,
        "BSD_APPROVER_NOT_CONFIGURED",
      );
    approvals.push(
      ...candidatesForUsers([bsd], OrganizationTag.BSD_STAFF, stepSequence),
    );
  }

  return approvals;
}

export async function buildReturnApprovalCandidates(
  tx: Prisma.TransactionClient,
  sourceTransaction: TransactionDetail,
  items: WorkflowRequestItem[],
  isSaleOutcome = false,
) {
  const approvals: ApprovalCandidate[] = [];
  let stepSequence = 2;

  if (isSaleOutcome) {
    const approver = await findOrganizationApprover(
      tx,
      OrganizationTag.BSD_STAFF,
      sourceTransaction.requestedBy.id,
    );
    if (!approver)
      throw new WorkflowError(
        "No active BSD Staff approver is configured.",
        409,
        "BSD_APPROVER_NOT_CONFIGURED",
      );
    return candidatesForUsers(
      [approver],
      OrganizationTag.BSD_STAFF,
      stepSequence,
    );
  }

  if (sourceTransaction.projectRequest && sourceTransaction.projectId) {
    approvals.push(
      ...candidatesForUsers(
        await findProjectApprovers(
          tx,
          sourceTransaction.requestedBy.id,
          sourceTransaction.projectId,
        ),
        ProjectTag.LEAD_PROJECT,
        stepSequence,
      ),
    );
    stepSequence++;
  } else {
    const requester = await requireWorkflowUserById(
      tx,
      sourceTransaction.requestedBy.id,
    );
    const supervisorTags = supervisorTagsForUser(requester);
    const supervisor = await findUsingSupervisorApprover(tx, requester);
    if (
      supervisorTags.length === 0 ||
      !supervisor ||
      supervisor.approvers.length === 0
    ) {
      throw new WorkflowError(
        "No active supervisor is configured for the requester's organization.",
        409,
        "SUPERVISOR_NOT_CONFIGURED",
      );
    }
    approvals.push(
      ...candidatesForUsers(
        supervisor.approvers,
        supervisor.requiredTag,
        stepSequence,
      ),
    );
    stepSequence++;
  }

  const warehouseCodes = Array.from(
    new Set(items.map((item) => item.asset.warehouse.code)),
  ).sort();

  for (const warehouseCode of warehouseCodes) {
    approvals.push(
      ...candidatesForUsers(
        await findStockControllerApprovers(tx, warehouseCode, "STOREMAN"),
        `RETURN_CHECK:${warehouseCode}`,
        stepSequence,
      ),
    );
  }
  stepSequence++;

  for (const warehouseCode of warehouseCodes) {
    approvals.push(
      ...candidatesForUsers(
        await findStockControllerApprovers(tx, warehouseCode, "STOREMAN"),
        warehouseStockControllerRequiredTag(warehouseCode),
        stepSequence,
      ),
    );
  }

  if (sourceTransaction.type === TransactionType.SOLD) {
    approvals.push(
      ...candidatesForUsers(
        [
          await findOrganizationApprover(
            tx,
            OrganizationTag.BSD_STAFF,
            sourceTransaction.requestedBy.id,
          ),
        ].filter((approver): approver is ApprovalUser => Boolean(approver)),
        OrganizationTag.BSD_STAFF,
        stepSequence + 1,
      ),
    );
  }

  return approvals;
}

export async function replaceTransactionApprovals(
  tx: Prisma.TransactionClient,
  transactionId: string,
  approvals: ApprovalCandidate[],
  resolutionBatchId?: string,
  requester?: CurrentUser,
) {
  await tx.transactionApproval.updateMany({
    where: {
      transactionId,
      resolutionBatchId: resolutionBatchId ?? null,
      isCurrent: true,
    },
    data: { isCurrent: false },
  });

  if (approvals.length === 0) {
    return;
  }

  await tx.transactionApproval.createMany({
    data: approvals.map((approval) => ({
      approverNameSnapshot: approval.approverNameSnapshot,
      approverTagSnapshot: approval.approverTagSnapshot,
      requiredTag: approval.requiredTag,
      resolutionBatchId,
      stepSequence: approval.stepSequence,
      transactionId,
      userId: approval.userId,
    })),
  });
  if (requester)
    await recordRequesterConfirmation(
      tx,
      transactionId,
      requester,
      new Date(),
      resolutionBatchId,
    );
}

export async function recordRequesterConfirmation(
  tx: Prisma.TransactionClient,
  transactionId: string,
  requester: CurrentUser,
  now: Date,
  resolutionBatchId?: string,
) {
  await tx.transactionApproval.create({
    data: {
      transactionId,
      resolutionBatchId,
      userId: requester.id,
      stepSequence: 1,
      requiredTag: "REQUESTER",
      status: ApprovalStatus.APPROVED,
      actedAt: now,
      approverNameSnapshot: requester.name,
      approverTagSnapshot: "REQUESTER",
      approverSignatureSnapshot: requester.signatureDataUrl,
    },
  });
}
