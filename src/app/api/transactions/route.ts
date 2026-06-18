import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  apiErrorResponse,
  readJsonBody,
  requireApiUser,
} from "@/lib/api";
import { submitTransaction } from "@/lib/workflow";

const optionalDateSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => (value ? new Date(value) : null))
  .refine((value) => !value || !Number.isNaN(value.getTime()), {
    message: "Invalid date.",
  });

const submitTransactionSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(100),
  documentRef: z.string().max(255).optional().nullable(),
  dueDate: optionalDateSchema,
  internalRequest: z.boolean().optional().default(false),
  note: z.string().max(1000).optional().nullable(),
  projectRequest: z.boolean().optional().default(false),
  purpose: z.string().min(1).max(1000),
  serviceRequest: z.boolean().optional().default(false),
  soldPrice: z.string().trim().optional().nullable(),
  type: z.nativeEnum(TransactionType),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const input = submitTransactionSchema.parse(await readJsonBody(request));
    const transaction = await submitTransaction(user, input);

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
