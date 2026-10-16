import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser, apiJson } from "@/lib/api";
import { verifyEmailAgainstDirectory } from "@/lib/user-management";

const verifyEmailSchema = z.object({
  email: z.string().trim().email(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const body = verifyEmailSchema.parse(await readJsonBody(request));
    const verified = await verifyEmailAgainstDirectory(user, body.email);

    return apiJson({
      email: verified.email,
      name: verified.name,
      verified: true,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

