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
  id: string;
  lead: ProjectUserOption | null;
  members: ProjectUserOption[];
  name: string;
  projectId: string | null;
  status: ProjectStatus;
};

export type ProjectManagementData = {
  projects: ProjectRow[];
  users: ProjectUserOption[];
};

export type UpsertProjectInput = {
  leadUserId: string;
  memberUserIds: string[];
  name: string;
  projectId: string;
  status?: ProjectStatus;
};

const projectSelect = Prisma.validator<Prisma.ProjectSelect>()({
  id: true,
  leadUser: { select: { email: true, id: true, name: true } },
  members: {
    orderBy: { user: { name: "asc" } },
    select: {
      projectTag: true,
      user: { select: { email: true, id: true, name: true } },
    },
    where: { projectTag: ProjectMemberTag.TEAM_MEMBER },
  },
  name: true,
  projectId: true,
  status: true,
});

type ProjectRecord = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>;

function ensureAdmin(user: CurrentUser) {
  if (!hasRole(user, "ADMIN")) {
    throw new WorkflowError("Only admin users can manage projects.", 403, "FORBIDDEN");
  }
}

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

function toProjectRow(project: ProjectRecord): ProjectRow {
  return {
    id: project.id,
    lead: project.leadUser,
    members: project.members.map((member) => member.user),
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
    throw new WorkflowError("Lead Project and Team Member must be active User accounts.");
  }

  return foundIds;
}

function normalizeProjectInput(input: UpsertProjectInput, requireStatus = false) {
  const name = requireText(input.name, "Project name");
  const projectId = requireText(input.projectId, "Project ID").toUpperCase();
  const leadUserId = cleanText(input.leadUserId);

  if (!leadUserId) {
    throw new WorkflowError("Lead Project is required.");
  }

  if (requireStatus && !input.status) {
    throw new WorkflowError("Project status is required.");
  }

  const status = input.status ?? ProjectStatus.ACTIVE;
  if (![ProjectStatus.ACTIVE, ProjectStatus.CLOSED].includes(status)) {
    throw new WorkflowError("Project status must be Active or Closed.");
  }

  const memberUserIds = [...new Set(input.memberUserIds.filter((id) => id && id !== leadUserId))];

  return { leadUserId, memberUserIds, name, projectId, status };
}

export async function getProjectManagementForAdmin(user: CurrentUser): Promise<ProjectManagementData> {
  ensureAdmin(user);

  const [projects, users] = await Promise.all([
    db.project.findMany({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { name: "asc" }],
      select: projectSelect,
    }),
    getUserOptions(),
  ]);

  return {
    projects: projects.map(toProjectRow),
    users,
  };
}

export async function createProjectForAdmin(user: CurrentUser, input: UpsertProjectInput) {
  ensureAdmin(user);
  const clean = normalizeProjectInput(input);
  await assertUserOptions([clean.leadUserId, ...clean.memberUserIds]);

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
        leadUserId: clean.leadUserId,
        name: clean.name,
        projectId: clean.projectId,
        status: clean.status,
      },
      select: { id: true },
    });

    if (clean.memberUserIds.length > 0) {
      await tx.projectMember.createMany({
        data: clean.memberUserIds.map((memberId) => ({
          projectId: created.id,
          projectTag: ProjectMemberTag.TEAM_MEMBER,
          userId: memberId,
        })),
        skipDuplicates: true,
      });
    }

    return tx.project.findUniqueOrThrow({
      select: projectSelect,
      where: { id: created.id },
    });
  });

  return toProjectRow(project);
}

export async function updateProjectForAdmin(
  user: CurrentUser,
  projectId: string,
  input: UpsertProjectInput,
) {
  ensureAdmin(user);
  const clean = normalizeProjectInput(input, true);
  await assertUserOptions([clean.leadUserId, ...clean.memberUserIds]);

  const existing = await db.project.findUnique({
    select: { id: true },
    where: { id: projectId },
  });

  if (!existing) {
    throw new WorkflowError("Project not found.", 404);
  }

  const duplicate = await db.project.findFirst({
    select: { id: true },
    where: { id: { not: projectId }, projectId: clean.projectId },
  });

  if (duplicate) {
    throw new WorkflowError("Project ID already exists.", 409, "DUPLICATE_PROJECT");
  }

  const project = await db.$transaction(async (tx) => {
    await tx.project.update({
      data: {
        leadUserId: clean.leadUserId,
        name: clean.name,
        projectId: clean.projectId,
        status: clean.status,
      },
      where: { id: projectId },
    });

    await tx.projectMember.deleteMany({
      where: { projectId, projectTag: ProjectMemberTag.TEAM_MEMBER },
    });

    if (clean.memberUserIds.length > 0) {
      await tx.projectMember.createMany({
        data: clean.memberUserIds.map((memberId) => ({
          projectId,
          projectTag: ProjectMemberTag.TEAM_MEMBER,
          userId: memberId,
        })),
        skipDuplicates: true,
      });
    }

    return tx.project.findUniqueOrThrow({
      select: projectSelect,
      where: { id: projectId },
    });
  });

  return toProjectRow(project);
}

export async function deleteProjectForAdmin(user: CurrentUser, projectId: string) {
  ensureAdmin(user);

  const existing = await db.project.findUnique({
    select: { id: true, name: true, projectId: true },
    where: { id: projectId },
  });

  if (!existing) {
    throw new WorkflowError("Project not found.", 404);
  }

  await db.project.delete({ where: { id: projectId } });

  return existing;
}
