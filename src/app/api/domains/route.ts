import { AssetTrackMethod } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth";
import { createDomainForUser } from "@/lib/domains";
import { PermissionError } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

const createDomainSchema = z.object({
  categoryName: z.string().trim().min(1),
  controllerId: z.string().uuid(),
  domainName: z.string().trim().min(1),
  prefix: z.string().trim().min(1),
  trackMethod: z.nativeEnum(AssetTrackMethod),
  typeCode: z.string().trim().optional().nullable(),
  typeName: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser("/dashboard");
    const body = createDomainSchema.parse(await request.json());
    const domain = await createDomainForUser(user, body);

    return NextResponse.json({ domain });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Invalid domain payload." }, { status: 400 });
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

