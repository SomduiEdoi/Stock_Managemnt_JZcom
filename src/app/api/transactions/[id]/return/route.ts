import { NextRequest } from "next/server";
import { z } from "zod";
import { AssetCondition, AssetStatus } from "@prisma/client";
import {
  apiErrorResponse,
  readJsonBody,
  requireApiUser, apiJson } from "@/lib/api";
import { deletePendingReturnOutcome, resolveTransactionItems } from "@/lib/workflow";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const returnTransactionSchema = z.object({
  resolutionBatchId: z.string().uuid().optional(),
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      allocations: z.array(z.object({
        quantity: z.number().int().positive(),
        toStatus: z.nativeEnum(AssetStatus),
        returnCondition: z.nativeEnum(AssetCondition).optional(),
        note: z.string().max(1000).optional().nullable(),
        soldPrice: z.string().trim().max(30).optional().nullable(),
      })).max(10).optional(),
      note: z.string().max(1000).optional().nullable(),
      quantity: z.number().int().positive().optional().nullable(),
      soldPrice: z.string().trim().max(30).optional().nullable(),
      toStatus: z.nativeEnum(AssetStatus),
      returnCondition: z.nativeEnum(AssetCondition).optional(),
    }),
  ).min(1).max(100),
});
const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const body = returnTransactionSchema.parse(await readJsonBody(request));
    const transaction = await resolveTransactionItems(user, {
      items: body.items,
      transactionId: id,
      resolutionBatchId: body.resolutionBatchId,
    });

    return apiJson({ transaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireApiUser(request);
    const { id } = paramsSchema.parse(await context.params);
    const outcomeId = z.string().uuid().parse(new URL(request.url).searchParams.get("outcomeId"));
    const transaction = await deletePendingReturnOutcome(user, {
      outcomeId,
      transactionId: id,
    });

    return apiJson({ transaction });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

