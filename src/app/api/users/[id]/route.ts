import { OrganizationLevel, OrganizationTag, StockControllerTag } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser } from "@/lib/api";
import {
  deleteUserForAdmin,
  unlinkLdapUserForAdmin,
  updateUserForAdmin,
} from "@/lib/user-management";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().uuid() });

const updateUserSchema = z.union([
  z.object({ unlinkLdap: z.literal(true) }),
  z.object({
    ldapUsername: z.string().trim().min(1).max(255),
    name: z.string().trim().min(1),
    organizationLevel: z.nativeEnum(OrganizationLevel).nullable().optional(),
    organizationAssignments: z
      .array(
        z.object({
          organizationLevel: z.nativeEnum(OrganizationLevel),
          organizationTag: z.nativeEnum(OrganizationTag),
        }),
      )
      .optional(),
    primaryOrganizationTag: z.nativeEnum(OrganizationTag).nullable().optional(),
    organizationTag: z.nativeEnum(OrganizationTag).nullable().optional(),
    role: z.enum(["ADMIN", "STOCK_CONTROLLER", "USER"]),
    stockControllerTag: z.nativeEnum(StockControllerTag).nullable().optional(),
  }),
]);

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const body = updateUserSchema.parse(await readJsonBody(request));

    if ("unlinkLdap" in body) {
      await unlinkLdapUserForAdmin(user, id);
      return NextResponse.json({ ok: true });
    }

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
