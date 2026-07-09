import { OrganizationLevel, OrganizationTag } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser } from "@/lib/api";
import { deleteUserForAdmin, updateUserForAdmin } from "@/lib/user-management";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().uuid() });

const updateUserSchema = z.object({
  domainId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1),
  organizationLevel: z.nativeEnum(OrganizationLevel).nullable().optional(),
  organizationTag: z.nativeEnum(OrganizationTag).nullable().optional(),
  role: z.enum(["ADMIN", "STOCK_CONTROLLER", "USER"]),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const body = updateUserSchema.parse(await readJsonBody(request));
    await updateUserForAdmin(user, id, body);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    await deleteUserForAdmin(user, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
