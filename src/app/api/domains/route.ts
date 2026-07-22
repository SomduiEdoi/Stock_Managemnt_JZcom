import { AssetTrackMethod } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { createDomainForUser } from "@/lib/domains";
import { PermissionError } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

const createDomainSchema = z.object({
  controllerId: z.string().trim().min(1, "Stock controller is required.").uuid("Stock controller is required."),
  domainName: z.string().trim().min(1, "Domain name is required."),
  headControllerId: z.string().trim().uuid("Head stock controller is required.").nullable().optional(),
  prefix: z.string().trim().min(1, "Prefix is required.").regex(/^[A-Za-z0-9]{2}$/, "Prefix must be exactly 2 English letters or numbers."),
  trackMethod: z.nativeEnum(AssetTrackMethod),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser("/dashboard");
    const body = createDomainSchema.parse(await request.json());
    const domain = await createDomainForUser(user, body);

    return NextResponse.json({ domain });
  } catch (error) {
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
}


