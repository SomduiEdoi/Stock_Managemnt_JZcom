import { Prisma, ProjectMemberTag, ProjectStatus } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { ApprovalStatus, ProjectApprovalStatus, TransactionWorkflowStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";
import { formatTransactionReference } from "@/lib/transaction-reference";

export type ProjectUserOption = {
  email: string;
  id: string;
  name: string;
  position: string | null;
};

export type ProjectRow = {
  canDelete: boolean;
  canManage: boolean;
  canApprove: boolean;
  id: string;
  lead: ProjectUserOption | null;
  leads: ProjectUserOption[];
  members: ProjectUserOption[];
  name: string;
  customerName: string;
  projectId: string | null;
  status: ProjectStatus;
};

export type ProjectManagementData = {
  canCreate: boolean;
  projects: ProjectRow[];
  users: ProjectUserOption[];
};

export type ProjectTransactionHistoryRow = {
  id: string;
  requestDate: string;
  requestedBy: string;
  status: TransactionWorkflowStatus;
  transactionNo: string | null;
  transactionReference: string;
  type: "BORROW" | "USING" | "SOLD";
};

export async function getPendingProjectApprovalCount(userId: string) {
  return db.projectApproval.count({ where: { approverId: userId, status: ProjectApprovalStatus.PENDING, project: { status: ProjectStatus.PENDING_APPROVAL } } });
}

export type UpsertProjectInput = {
  leadUserId?: string;
  leadUserIds?: string[];
  memberUserIds: string[];
  name?: string;
  customerName?: string;
  projectId?: string;
  status?: ProjectStatus;
};

const projectSelect = Prisma.validator<Prisma.ProjectSelect>()({
  id: true,
  leadUser: { select: { email: true, id: true, name: true, position: true } },
  members: {
    orderBy: [{ projectTag: "asc" }, { user: { name: "asc" } }],
    select: {
      projectTag: true,
      user: { select: { email: true, id: true, name: true, position: true } },
    },
  },
  name: true,
  customerName: true,
  projectId: true,
  status: true,
  approvals: { select: { approverId: true, status: true } },
});

type ProjectRecord = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requireText(value: string | null | undefined, label: string) {
  const text = cleanText(value);

  if (!text) {
    throw new WorkflowError(`${label} is required.`);
  }

  if (/[^\x00-\x7F]/.test(text)) {
    throw new WorkflowError(`${label} must use English text only.`);
  }

  if (text.length > 80) {
    throw new WorkflowError(`${label} must be 80 characters or fewer.`);
  }

  return text;
}

function hasProjectLeadPermission(user: CurrentUser, project: Pick<ProjectRecord, "leadUser" | "members">) {
  return (
    project.leadUser?.id === user.id ||
    project.members.some(
      (member) => member.projectTag === ProjectMemberTag.LEAD_PROJECT && member.user.id === user.id,
    )
  );
}

function canManageProject(user: CurrentUser, project: Pick<ProjectRecord, "leadUser" | "members">) {
  return hasRole(user, "ADMIN") || (hasRole(user, "USER") && (hasProjectLeadPermission(user, project) || project.members.some((member) => member.user.id === user.id)));
}

function toUniqueUsers(users: ProjectUserOption[]) {
  const seen = new Set<string>();
  return users.filter((user) => {
    if (seen.has(user.id)) return false;
    seen.add(user.id);
    return true;
  });
}

function toProjectUserOption(user: { email: string | null; id: string; name: string; position: string | null }): ProjectUserOption {
  return { email: user.email ?? "Not Linked", id: user.id, name: user.name, position: user.position };
}

function toProjectRow(project: ProjectRecord, user: CurrentUser): ProjectRow {
  const leadMembers = project.members
    .filter((member) => member.projectTag === ProjectMemberTag.LEAD_PROJECT)
    .map((member) => toProjectUserOption(member.user));
  const leads = toUniqueUsers(
    project.leadUser
      ? [toProjectUserOption(project.leadUser), ...leadMembers]
      : leadMembers,
  );
  const canManage = canManageProject(user, project);
  const canApprove = project.approvals.some((approval) => approval.approverId === user.id && approval.status === ProjectApprovalStatus.PENDING);

  return {
    canDelete: canManage,
    canManage,
    canApprove,
    id: project.id,
    lead: leads[0] ?? null,
    leads,
    members: project.members
      .filter((member) => member.projectTag === ProjectMemberTag.TEAM_MEMBER)
      .map((member) => toProjectUserOption(member.user)),
    name: project.name,
    customerName: project.customerName,
    projectId: project.projectId,
    status: project.status,
  };
}

async function getUserOptions() {
  const users = await db.user.findMany({
    orderBy: { name: "asc" },
    select: { email: true, id: true, name: true, position: true },
    where: {
      isActive: true,
      roles: { some: { role: { code: "USER" } } },
    },
  });

  return users.map(toProjectUserOption);
}

async function assertUserOptions(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Set<string>();
  }

  const users = await db.user.findMany({
    select: { id: true },
    where: {
      id: { in: uniqueIds },
      isActive: true,
      roles: { some: { role: { code: "USER" } } },
    },
  });
  const foundIds = new Set(users.map((entry) => entry.id));

  if (foundIds.size !== uniqueIds.length) {
    throw new WorkflowError("Lead Team and Team Member must be active User accounts.");
  }

  return foundIds;
}

function normalizeCreateProjectInput(input: UpsertProjectInput) {
  const name = requireText(input.name, "Project name");
  const customerName = requireText(input.customerName, "Customer name");
  const projectId = requireText(input.projectId, "Project ID").toUpperCase();
  const leadUserIds = [...new Set([...(input.leadUserIds ?? []), input.leadUserId].filter(Boolean) as string[])];

  if (leadUserIds.length === 0) {
    throw new WorkflowError("Lead Team is required.");
  }

  const status = input.status ?? ProjectStatus.ACTIVE;
  if (status !== ProjectStatus.ACTIVE && status !== ProjectStatus.CLOSED) {
    throw new WorkflowError("Project status must be Active or Closed.");
  }

  const memberUserIds = [...new Set(input.memberUserIds.filter((id) => id && !leadUserIds.includes(id)))];

  return { leadUserIds, memberUserIds, name, customerName, projectId, status };
}

function normalizeUpdateProjectInput(input: UpsertProjectInput) {
  const customerName = requireText(input.customerName, "Customer name");
  const leadUserIds = [...new Set([...(input.leadUserIds ?? []), input.leadUserId].filter(Boolean) as string[])];

  if (leadUserIds.length === 0) {
    throw new WorkflowError("Lead Team is required.");
  }

  if (!input.status) {
    throw new WorkflowError("Project status is required.");
  }

  if (input.status !== ProjectStatus.ACTIVE && input.status !== ProjectStatus.CLOSED) {
    throw new WorkflowError("Project status must be Active or Closed.");
  }

  const memberUserIds = [...new Set(input.memberUserIds.filter((id) => id && !leadUserIds.includes(id)))];

  return { customerName, leadUserIds, memberUserIds, status: input.status };
}

export async function getProjectManagementData(user: CurrentUser): Promise<ProjectManagementData> {
  const [projects, users] = await Promise.all([
    db.project.findMany({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { name: "asc" }],
      select: projectSelect,
    }),
    getUserOptions(),
  ]);

  return {
    canCreate: hasRole(user, "ADMIN") || hasRole(user, "USER"),
    projects: projects.map((project) => toProjectRow(project, user)),
    users,
  };
}

export const getProjectManagementForAdmin = getProjectManagementData;

export async function createProjectForAdmin(user: CurrentUser, input: UpsertProjectInput) {
  if (!hasRole(user, "ADMIN") && !hasRole(user, "USER")) {
    throw new WorkflowError("Only User or Admin accounts can create projects.", 403, "FORBIDDEN");
  }

  const clean = normalizeCreateProjectInput(input);
  await assertUserOptions([...clean.leadUserIds, ...clean.memberUserIds]);

  const duplicate = await db.project.findFirst({
    select: { id: true },
    where: { projectId: clean.projectId },
  });

  if (duplicate) {
    throw new WorkflowError("Project ID already exists.", 409, "DUPLICATE_PROJECT");
  }

  const project = await db.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        leadUserId: clean.leadUserIds[0],
        name: clean.name,
        customerName: clean.customerName,
        projectId: clean.projectId,
        status: hasRole(user, "ADMIN") || clean.leadUserIds.includes(user.id) ? clean.status : ProjectStatus.PENDING_APPROVAL,
      },
      select: { id: true },
    });

    await tx.projectMember.createMany({
      data: [
        ...clean.leadUserIds.map((leadId) => ({
          projectId: created.id,
          projectTag: ProjectMemberTag.LEAD_PROJECT,
          userId: leadId,
        })),
        ...clean.memberUserIds.map((memberId) => ({
          projectId: created.id,
          projectTag: ProjectMemberTag.TEAM_MEMBER,
          userId: memberId,
        })),
      ],
      skipDuplicates: true,
    });

    if (!hasRole(user, "ADMIN") && !clean.leadUserIds.includes(user.id)) {
      await tx.projectApproval.createMany({
        data: [...new Set(clean.leadUserIds)].filter((id) => id !== user.id).map((approverId) => ({ projectId: created.id, approverId, action: "CREATE" as const, payload: clean })),
        skipDuplicates: true,
      });
    }

    return tx.project.findUniqueOrThrow({
      select: projectSelect,
      where: { id: created.id },
    });
  });

  return toProjectRow(project, user);
}

export async function updateProjectForAdmin(
  user: CurrentUser,
  projectId: string,
  input: UpsertProjectInput,
) {
  const clean = normalizeUpdateProjectInput(input);
  await assertUserOptions([...clean.leadUserIds, ...clean.memberUserIds]);

  const existing = await db.project.findUnique({
    select: projectSelect,
    where: { id: projectId },
  });

  if (!existing) {
    throw new WorkflowError("Project not found.", 404);
  }

  if (!canManageProject(user, existing)) {
    throw new WorkflowError("Only admin users or project leads can manage this project.", 403, "FORBIDDEN");
  }

  const project = await db.$transaction(async (tx) => {
    const previousLeadIds = toUniqueUsers([
      ...(existing.leadUser ? [toProjectUserOption(existing.leadUser)] : []),
      ...existing.members
        .filter((member) => member.projectTag === ProjectMemberTag.LEAD_PROJECT)
        .map((member) => toProjectUserOption(member.user)),
    ]).map((lead) => lead.id);

    await tx.project.update({
      data: {
        customerName: clean.customerName,
        leadUserId: clean.leadUserIds[0],
        status: hasProjectLeadPermission(user, existing) || hasRole(user, "ADMIN") ? clean.status : ProjectStatus.PENDING_APPROVAL,
      },
      where: { id: projectId },
    });

    await tx.projectMember.deleteMany({ where: { projectId } });

    await tx.projectMember.createMany({
      data: [
        ...clean.leadUserIds.map((leadId) => ({
          projectId,
          projectTag: ProjectMemberTag.LEAD_PROJECT,
          userId: leadId,
        })),
        ...clean.memberUserIds.map((memberId) => ({
          projectId,
          projectTag: ProjectMemberTag.TEAM_MEMBER,
          userId: memberId,
        })),
      ],
      skipDuplicates: true,
    });

    if (!hasRole(user, "ADMIN") && !clean.leadUserIds.includes(user.id)) {
      await tx.projectApproval.deleteMany({ where: { projectId, status: ProjectApprovalStatus.PENDING } });
      await tx.projectApproval.createMany({
        data: [...new Set(clean.leadUserIds)].filter((id) => id !== user.id).map((approverId) => ({ projectId, approverId, action: "EDIT" as const, payload: clean, previous: { customerName: existing.customerName, name: existing.name, projectId: existing.projectId, status: existing.status, leadUserIds: previousLeadIds, memberUserIds: existing.members.filter((member) => member.projectTag === ProjectMemberTag.TEAM_MEMBER).map((member) => member.user.id) } })),
        skipDuplicates: true,
      });
    }

    const pendingTransactions = await tx.transaction.findMany({
      where: { projectId, workflowStatus: TransactionWorkflowStatus.PENDING },
      select: {
        id: true,
        requestedById: true,
        approvals: {
          where: { requiredTag: ProjectMemberTag.LEAD_PROJECT, status: ApprovalStatus.PENDING },
          orderBy: { stepSequence: "asc" },
          select: { stepSequence: true },
        },
      },
    });
    const nextLeads = await tx.user.findMany({
      where: { id: { in: clean.leadUserIds }, isActive: true },
      select: { id: true, name: true },
    });

    for (const transaction of pendingTransactions) {
      const leadStep = transaction.approvals[0]?.stepSequence;
      if (leadStep === undefined) continue;
      const approvers = nextLeads.filter((lead) => lead.id !== transaction.requestedById);
      await tx.transactionApproval.deleteMany({
        where: { transactionId: transaction.id, requiredTag: ProjectMemberTag.LEAD_PROJECT, status: ApprovalStatus.PENDING },
      });
      await tx.transactionApproval.createMany({
        data: approvers.map((lead) => ({
          transactionId: transaction.id,
          requiredTag: ProjectMemberTag.LEAD_PROJECT,
          stepSequence: leadStep,
          userId: lead.id,
          approverNameSnapshot: lead.name,
          approverTagSnapshot: ProjectMemberTag.LEAD_PROJECT,
          status: ApprovalStatus.PENDING,
        })),
      });
    }

    if (JSON.stringify(previousLeadIds) !== JSON.stringify(clean.leadUserIds)) {
      await tx.projectLeadChange.create({
        data: {
          projectId,
          changedById: user.id,
          previousLeadIds,
          nextLeadIds: clean.leadUserIds,
        },
      });
    }

    return tx.project.findUniqueOrThrow({
      select: projectSelect,
      where: { id: projectId },
    });
  });

  return toProjectRow(project, user);
}

export async function deleteProjectForAdmin(user: CurrentUser, projectId: string) {
  const existing = await db.project.findUnique({
    select: projectSelect,
    where: { id: projectId },
  });

  if (!existing) {
    throw new WorkflowError("Project not found.", 404);
  }

  if (!canManageProject(user, existing)) {
    throw new WorkflowError("Only admin users or project leads can delete this project.", 403, "FORBIDDEN");
  }

  await db.project.delete({ where: { id: projectId } });

  return existing;
}

export async function approveProject(user: CurrentUser, projectId: string) {
  const approval = await db.projectApproval.findFirst({ where: { projectId, approverId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } });
  if (!approval) throw new WorkflowError("You are not assigned to approve this project.", 403, "FORBIDDEN");
  if (approval.status === ProjectApprovalStatus.APPROVED) {
    return db.project.findUniqueOrThrow({ select: projectSelect, where: { id: projectId } });
  }
  if (approval.status !== ProjectApprovalStatus.PENDING) throw new WorkflowError("This project approval is no longer available.", 409, "PROJECT_APPROVAL_NOT_PENDING");
  return db.$transaction(async (tx) => {
    await tx.projectApproval.update({ where: { id: approval.id }, data: { status: ProjectApprovalStatus.APPROVED, actedAt: new Date() } });
    const pending = await tx.projectApproval.count({ where: { projectId, status: ProjectApprovalStatus.PENDING } });
    await tx.project.update({ where: { id: projectId }, data: { status: ProjectStatus.ACTIVE } });
    if (pending > 0) await tx.projectApproval.updateMany({ where: { projectId, status: ProjectApprovalStatus.PENDING }, data: { status: ProjectApprovalStatus.APPROVED, actedAt: new Date(), comment: "Confirmed by another project lead." } });
    return tx.project.findUniqueOrThrow({ select: projectSelect, where: { id: projectId } });
  });
}

export async function rejectProject(user: CurrentUser, projectId: string) {
  const approval = await db.projectApproval.findFirst({ where: { projectId, approverId: user.id, status: ProjectApprovalStatus.PENDING }, select: { id: true, action: true, previous: true } });
  if (!approval) throw new WorkflowError("You are not assigned to approve this project.", 403, "FORBIDDEN");
  return db.$transaction(async (tx) => {
    if (approval.action === "CREATE") {
      await tx.project.delete({ where: { id: projectId } });
      return { deleted: true };
    }
    const previous = approval.previous as { customerName: string; name: string; projectId: string | null; status: ProjectStatus; leadUserIds: string[]; memberUserIds: string[] };
    if (typeof previous?.projectId !== "string" || !previous.projectId.trim()) {
      throw new WorkflowError("Previous project data has no Project ID; review the approval history before restoring it.", 409);
    }
    await tx.project.update({ where: { id: projectId }, data: { customerName: previous.customerName, name: previous.name, projectId: previous.projectId, status: previous.status, leadUserId: previous.leadUserIds[0] } });
    await tx.projectMember.deleteMany({ where: { projectId } });
    await tx.projectMember.createMany({ data: [...previous.leadUserIds.map((userId) => ({ projectId, userId, projectTag: ProjectMemberTag.LEAD_PROJECT })), ...previous.memberUserIds.map((userId) => ({ projectId, userId, projectTag: ProjectMemberTag.TEAM_MEMBER }))], skipDuplicates: true });
    await tx.projectApproval.updateMany({ where: { projectId, status: ProjectApprovalStatus.PENDING }, data: { status: ProjectApprovalStatus.REJECTED, actedAt: new Date(), comment: "Project change rejected." } });
    return tx.project.findUniqueOrThrow({ select: projectSelect, where: { id: projectId } });
  });
}

export async function getProjectDetail(user: CurrentUser, projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { ...projectSelect, approvals: { select: { approverId: true, status: true, action: true, comment: true } } } });
  if (!project) throw new WorkflowError("Project not found.", 404);

  const transactions = await db.transaction.findMany({
    orderBy: [{ requestDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      requestDate: true,
      requestedBy: { select: { name: true, email: true } },
      status: true,
      transactionNo: true,
      documentRef: true,
      sourceTransactionId: true,
      sourceTransaction: { select: { transactionNo: true, documentRef: true } },
      type: true,
      workflowStatus: true,
    },
    where: {
      projectId,
      workflowStatus: { not: TransactionWorkflowStatus.CANCELLED },
    },
  });

  return {
    canApprove: project.approvals.some((approval) => approval.approverId === user.id && approval.status === ProjectApprovalStatus.PENDING),
    project,
    transactions: transactions.map((transaction): ProjectTransactionHistoryRow => ({
      id: transaction.id,
      requestDate: transaction.requestDate.toISOString(),
      requestedBy: transaction.requestedBy.name || transaction.requestedBy.email || "-",
      status: transaction.workflowStatus,
      transactionNo: transaction.transactionNo,
      transactionReference: formatTransactionReference(transaction),
      type: transaction.type,
    })),
  };
}
