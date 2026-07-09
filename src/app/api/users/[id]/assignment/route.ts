import { ProjectTag } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser } from "@/lib/api";
import { assignProjectTagForAdmin } from "@/lib/user-management";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().uuid() });
const assignmentSchema = z.object({
  projectTag: z.nativeEnum(ProjectTag).nullable(),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const body = assignmentSchema.parse(await readJsonBody(request));
    await assignProjectTagForAdmin(user, id, body.projectTag);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
