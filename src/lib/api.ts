import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
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

export function apiJson<T>(body: T, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Content-Type", "application/json; charset=utf-8");
  return response;
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return apiJson({ code: "CONCURRENT_UPDATE", message: "This request changed while you were submitting. Refresh and try again." }, { status: 409 });
  }
  if (error instanceof ZodError) {
    return apiJson(
      { issues: error.flatten(), message: "Invalid request body." },
      { status: 400 },
    );
  }

  if (error instanceof PermissionError) {
    return apiJson(
      { message: error.message },
      { status: error.statusCode },
    );
  }

  if (error instanceof WorkflowError) {
    return apiJson(
      { code: error.code, message: error.message },
      { status: error.statusCode },
    );
  }

  console.error(error);

  return apiJson(
    { message: "Internal server error." },
    { status: 500 },
  );
}
