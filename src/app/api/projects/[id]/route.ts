import { apiJson } from "@/lib/api";
import { ProjectStatus } from "@prisma/client";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { deleteProjectForAdmin, getProjectDetail, updateProjectForAdmin } from "@/lib/project-management";
import { PermissionError } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({
  id: z.string().trim().uuid(),
});

const projectSchema = z.object({
  leadUserId: z.string().trim().uuid().optional(),
  leadUserIds: z.array(z.string().trim().uuid()).default([]),
  memberUserIds: z.array(z.string().trim().uuid()).default([]),
  name: z.string().trim().optional(),
  customerName: z.string().trim().min(1, "Customer name is required."),
  projectId: z.string().trim().optional(),
  status: z.nativeEnum(ProjectStatus),
});

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return apiJson({ message: error.issues[0]?.message ?? "Invalid project payload." }, { status: 400 });
  }

  if (error instanceof WorkflowError) {
    return apiJson({ code: error.code, message: error.message }, { status: error.statusCode });
  }

  if (error instanceof PermissionError) {
    return apiJson({ code: "FORBIDDEN", message: error.message }, { status: error.statusCode });
  }

  throw error;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser("/project");
    const { id } = paramsSchema.parse(await context.params);
    const body = projectSchema.parse(await request.json());
    const project = await updateProjectForAdmin(user, id, body);

    return apiJson({ project });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser("/project");
    const { id } = paramsSchema.parse(await context.params);
    const detail = await getProjectDetail(user, id);

    return apiJson({ transactions: detail.transactions });
  } catch (error) {
    return errorResponse(error);
  }
}

import { requireDeleteProof } from "@/lib/destructive-auth";
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser("/project");
    const { id } = paramsSchema.parse(await context.params);
    await requireDeleteProof(request, user.id, `/projects/${id}`);
    const project = await deleteProjectForAdmin(user, id);

    return apiJson({ project });
  } catch (error) {
    return errorResponse(error);
  }
}

