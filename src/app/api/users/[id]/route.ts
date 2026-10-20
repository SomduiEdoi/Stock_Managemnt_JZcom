import { OrganizationLevel, OrganizationTag } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser, apiJson } from "@/lib/api";
import { deleteUserForAdmin, updateUserForAdmin } from "@/lib/user-management";
import { localUsernameSchema, organizationAssignmentSchema } from "@/lib/user-account-schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().uuid() });

const updateUserSchema = z.object({
  username: localUsernameSchema.optional(),
  email: z.union([z.string().trim().email(), z.literal("")]).default(""),
  name: z.string().trim().default(""),
  organizationLevel: z.nativeEnum(OrganizationLevel).nullable().optional(),
  organizationAssignments: z
    .array(
      organizationAssignmentSchema,
    )
    .optional(),
  primaryOrganizationTag: z.nativeEnum(OrganizationTag).nullable().optional(),
  primaryOrganizationKey: z.string().nullable().optional(),
  organizationTag: z.nativeEnum(OrganizationTag).nullable().optional(),
  role: z.enum(["ADMIN", "STOREMAN", "USER"]),
});

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const body = updateUserSchema.parse(await readJsonBody(request));

    await updateUserForAdmin(user, id, body);

    return apiJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    await deleteUserForAdmin(user, id);

    return apiJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

