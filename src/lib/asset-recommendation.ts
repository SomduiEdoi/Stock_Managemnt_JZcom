import type { CurrentUser } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCanManageWarehouse } from "@/lib/permissions";
import { WorkflowError } from "@/lib/workflow";

export async function setAssetRecommendation(
  user: CurrentUser,
  assetId: string,
  recommended: boolean,
) {
  return db.$transaction(
    async (tx) => {
      const asset = await tx.asset.findUnique({
        select: {
          id: true,
          isActive: true,
          warehouse: { select: { code: true } },
        },
        where: { id: assetId },
      });

      if (!asset || !asset.isActive) {
        throw new WorkflowError("Asset not found.", 404, "ASSET_NOT_FOUND");
      }

      assertCanManageWarehouse(user, asset.warehouse.code);

      return tx.asset.update({
        data: {
          isRecommended: recommended,
          recommendedAt: recommended ? new Date() : null,
          updatedById: user.id,
        },
        select: { id: true, isRecommended: true, recommendedAt: true },
        where: {
          id: asset.id,
          warehouse: { code: asset.warehouse.code },
          isActive: true,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
