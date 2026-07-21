import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { deleteDomainForUser, updateDomainForUser } from "@/lib/domains";
import { PermissionError } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ code: string }>;
};

const paramsSchema = z.object({
  code: z.string().trim().min(1),
});

const updateDomainSchema = z.object({
  controllerId: z.string().trim().min(1, "Stock controller is required.").uuid("Stock controller is required."),
  domainName: z.string().trim().min(1, "Domain name is required."),
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ message: error.issues[0]?.message ?? "Invalid domain payload." }, { status: 400 });
  }

  if (error instanceof WorkflowError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.statusCode });
  }

  if (error instanceof PermissionError) {
    return NextResponse.json({ code: "FORBIDDEN", message: error.message }, { status: error.statusCode });
  }

  throw error;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser("/dashboard");
    const { code } = paramsSchema.parse(await context.params);
    const payload = await request.json();
    if (payload && typeof payload === "object" && "prefix" in payload) {
      return NextResponse.json({ message: "Prefix cannot be edited after domain creation." }, { status: 400 });
    }
    const body = updateDomainSchema.parse(payload);
    const domain = await updateDomainForUser(user, decodeURIComponent(code), body);

    return NextResponse.json({ domain });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser("/dashboard");
    const { code } = paramsSchema.parse(await context.params);
    const result = await deleteDomainForUser(user, decodeURIComponent(code));

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

