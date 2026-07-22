import { ProjectStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { createProjectForAdmin } from "@/lib/project-management";
import { PermissionError } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

const projectSchema = z.object({
  leadUserId: z.string().trim().uuid("Lead Project is required."),
  memberUserIds: z.array(z.string().trim().uuid()).default([]),
  name: z.string().trim().min(1, "Project name is required."),
  projectId: z.string().trim().min(1, "Project ID is required."),
  status: z.nativeEnum(ProjectStatus).optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ message: error.issues[0]?.message ?? "Invalid project payload." }, { status: 400 });
  }

  if (error instanceof WorkflowError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.statusCode });
  }

  if (error instanceof PermissionError) {
    return NextResponse.json({ code: "FORBIDDEN", message: error.message }, { status: error.statusCode });
  }

  throw error;
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser("/project");
    const body = projectSchema.parse(await request.json());
    const project = await createProjectForAdmin(user, body);

    return NextResponse.json({ project });
  } catch (error) {
    return errorResponse(error);
  }
}
