import { OrganizationLevel, OrganizationTag } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser } from "@/lib/api";
import { createUserForAdmin } from "@/lib/user-management";

const createUserSchema = z.object({
  domainId: z.string().uuid().nullable().optional(),
  email: z.string().trim().email(),
  name: z.string().trim().min(1),
  organizationLevel: z.nativeEnum(OrganizationLevel).nullable().optional(),
  organizationTag: z.nativeEnum(OrganizationTag).nullable().optional(),
  role: z.enum(["ADMIN", "STOCK_CONTROLLER", "USER"]),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = createUserSchema.parse(await readJsonBody(request));
    const createdUser = await createUserForAdmin(user, body);

    return NextResponse.json({ user: createdUser }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
