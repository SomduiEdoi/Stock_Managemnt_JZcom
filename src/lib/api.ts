import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getUserFromSessionToken } from "@/lib/auth";
import { PermissionError } from "@/lib/permissions";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { WorkflowError } from "@/lib/workflow";

export async function requireApiUser(request: NextRequest) {
  const user = await getUserFromSessionToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (!user) {
    throw new WorkflowError("Unauthorized.", 401, "UNAUTHORIZED");
  }

  return user;
}

export async function readJsonBody(request: NextRequest) {
  return request.json().catch(() => ({}));
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { issues: error.flatten(), message: "Invalid request body." },
      { status: 400 },
    );
  }

  if (error instanceof PermissionError) {
    return NextResponse.json(
      { message: error.message },
      { status: error.statusCode },
    );
  }

  if (error instanceof WorkflowError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.statusCode },
    );
  }

  console.error(error);

  return NextResponse.json(
    { message: "Internal server error." },
    { status: 500 },
  );
}
