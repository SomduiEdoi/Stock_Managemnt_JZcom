import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { deleteWarehouseForUser, updateWarehouseForUser } from "@/lib/warehouses";
import { PermissionError } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ code: string }>;
};

const paramsSchema = z.object({
  code: z.string().trim().min(1),
});

const updateWarehouseSchema = z.object({
  controllerId: z.string().trim().min(1, "Stock controller is required.").uuid("Stock controller is required."),
  warehouseName: z.string().trim().min(1, "Warehouse name is required."),
  headControllerId: z.string().trim().uuid("Head stock controller is required.").nullable().optional(),
  headControllerIds: z.array(z.string().trim().uuid("Head stock controller is required.")).optional(),
}).strict();

function errorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ message: error.issues[0]?.message ?? "Invalid warehouse payload." }, { status: 400 });
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
    const body = updateWarehouseSchema.parse(payload);
    const warehouse = await updateWarehouseForUser(user, decodeURIComponent(code), body);

    return NextResponse.json({ warehouse });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireCurrentUser("/dashboard");
    const { code } = paramsSchema.parse(await context.params);
    const result = await deleteWarehouseForUser(user, decodeURIComponent(code));

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}


