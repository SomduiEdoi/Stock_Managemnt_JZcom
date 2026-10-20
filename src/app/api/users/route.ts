import { NextRequest } from "next/server";
import { createUserSchema } from "@/lib/user-account-schema";
import { apiErrorResponse, readJsonBody, requireApiUser, apiJson } from "@/lib/api";
import { createUserForAdmin } from "@/lib/user-management";


export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = createUserSchema.parse(await readJsonBody(request));
    const createdUser = await createUserForAdmin(user, body);

    return apiJson({ user: createdUser }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

