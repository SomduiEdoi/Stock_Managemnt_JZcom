import { Prisma, ProjectMemberTag, ProjectStatus } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

export type ProjectUserOption = {
  email: string;
  id: string;
  name: string;
};

export type ProjectRow = {
  canDelete: boolean;
  canManage: boolean;
  id: string;
  lead: ProjectUserOption | null;
  leads: ProjectUserOption[];
  members: ProjectUserOption[];
  name: string;
  projectId: string | null;
  status: ProjectStatus;
};

export type ProjectManagementData = {
  canCreate: boolean;
  projects: ProjectRow[];
  users: ProjectUserOption[];
};

export type UpsertProjectInput = {
  leadUserId?: string;
  leadUserIds?: string[];
  memberUserIds: string[];
  name?: string;
  projectId?: string;
  status?: ProjectStatus;
};

const projectSelect = Prisma.validator<Prisma.ProjectSelect>()({
  id: true,
  leadUser: { select: { email: true, id: true, name: true } },
  members: {
    orderBy: [{ projectTag: "asc" }, { user: { name: "asc" } }],
    select: {
      projectTag: true,
      user: { select: { email: true, id: true, name: true } },
    },
  },
  name: true,
  projectId: true,
  status: true,
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
  return hasRole(user, "ADMIN") || (hasRole(user, "USER") && hasProjectLeadPermission(user, project));
}

function toUniqueUsers(users: ProjectUserOption[]) {
  const seen = new Set<string>();
  return users.filter((user) => {
    if (seen.has(user.id)) return false;
    seen.add(user.id);
    return true;
  });
}

function toProjectRow(project: ProjectRecord, user: CurrentUser): ProjectRow {
  const leadMembers = project.members
    .filter((member) => member.projectTag === ProjectMemberTag.LEAD_PROJECT)
    .map((member) => member.user);
  const leads = toUniqueUsers(project.leadUser ? [project.leadUser, ...leadMembers] : leadMembers);
  const canManage = canManageProject(user, project);

  return {
    canDelete: canManage,
    canManage,
    id: project.id,
    lead: leads[0] ?? null,
    leads,
    members: project.members
      .filter((member) => member.projectTag === ProjectMemberTag.TEAM_MEMBER)
      .map((member) => member.user),
    name: project.name,
    projectId: project.projectId,
    status: project.status,
  };
}

async function getUserOptions() {
  return db.user.findMany({
    orderBy: { name: "asc" },
    select: { email: true, id: true, name: true },
    where: {
      isActive: true,
      roles: { some: { role: { code: "USER" } } },
    },
  });
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
  const projectId = requireText(input.projectId, "Project ID").toUpperCase();
  const leadUserIds = [...new Set([...(input.leadUserIds ?? []), input.leadUserId].filter(Boolean) as string[])];

  if (leadUserIds.length === 0) {
    throw new WorkflowError("Lead Team is required.");
  }

  const status = input.status ?? ProjectStatus.ACTIVE;
  if (![ProjectStatus.ACTIVE, ProjectStatus.CLOSED].includes(status)) {
    throw new WorkflowError("Project status must be Active or Closed.");
  }

  const memberUserIds = [...new Set(input.memberUserIds.filter((id) => id && !leadUserIds.includes(id)))];

  return { leadUserIds, memberUserIds, name, projectId, status };
}

function normalizeUpdateProjectInput(input: UpsertProjectInput) {
  const leadUserIds = [...new Set([...(input.leadUserIds ?? []), input.leadUserId].filter(Boolean) as string[])];

  if (leadUserIds.length === 0) {
    throw new WorkflowError("Lead Team is required.");
  }

  if (!input.status) {
    throw new WorkflowError("Project status is required.");
  }

  if (![ProjectStatus.ACTIVE, ProjectStatus.CLOSED].includes(input.status)) {
    throw new WorkflowError("Project status must be Active or Closed.");
  }

  const memberUserIds = [...new Set(input.memberUserIds.filter((id) => id && !leadUserIds.includes(id)))];

  return { leadUserIds, memberUserIds, status: input.status };
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
    canCreate: hasRole(user, "ADMIN"),
    projects: projects.map((project) => toProjectRow(project, user)),
    users,
  };
}

export const getProjectManagementForAdmin = getProjectManagementData;

export async function createProjectForAdmin(user: CurrentUser, input: UpsertProjectInput) {
  if (!hasRole(user, "ADMIN")) {
    throw new WorkflowError("Only admin users can create projects.", 403, "FORBIDDEN");
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
        projectId: clean.projectId,
        status: clean.status,
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
    await tx.project.update({
      data: {
        leadUserId: clean.leadUserIds[0],
        status: clean.status,
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
