import { NextRequest } from "next/server";
import { apiErrorResponse, requireApiUser, apiJson } from "@/lib/api";
import { getEditablePendingRequestsForUser } from "@/lib/workflow";

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const transactions = await getEditablePendingRequestsForUser(user);

    return apiJson({ transactions });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

