import { db } from "@/lib/db";

async function main() {
  const result = await db.$transaction(async (tx) => {
    const oldWarehouse = await tx.assetWarehouse.findUnique({
      where: { code: "DL" },
      select: { id: true },
    });

    if (!oldWarehouse) {
      throw new Error("DL warehouse not found.");
    }

    const assets = await tx.asset.findMany({
      where: { warehouseId: oldWarehouse.id },
      select: { id: true },
    });
    const assetIds = assets.map((asset) => asset.id);
    const transactionItems = await tx.transactionItem.findMany({
      where: { assetId: { in: assetIds } },
      select: { transactionId: true },
    });
    const transactionIds = [...new Set(transactionItems.map((item) => item.transactionId))];

    if (transactionIds.length > 0) {
      await tx.transaction.deleteMany({ where: { id: { in: transactionIds } } });
    }

    if (assetIds.length > 0) {
      await tx.migrationRow.deleteMany({ where: { assetId: { in: assetIds } } });
      await tx.assetStatusHistory.deleteMany({ where: { assetId: { in: assetIds } } });
      await tx.assetReservation.deleteMany({ where: { assetId: { in: assetIds } } });
      await tx.assetCustomFieldValue.deleteMany({ where: { assetId: { in: assetIds } } });
      await tx.asset.deleteMany({ where: { id: { in: assetIds } } });
    }

    await tx.assetType.deleteMany({
      where: { category: { warehouseId: oldWarehouse.id } },
    });
    await tx.assetModel.deleteMany({ where: { warehouseId: oldWarehouse.id } });
    await tx.assetCategory.deleteMany({ where: { warehouseId: oldWarehouse.id } });
    await tx.userWarehousePermission.deleteMany({ where: { warehouseId: oldWarehouse.id } });
    await tx.assetWarehouse.delete({ where: { id: oldWarehouse.id } });

    const suriya = await tx.user.findUnique({
      where: { email: "suriya@example.com" },
      select: { id: true },
    });
    if (!suriya) {
      throw new Error("suriya@example.com not found.");
    }

    const warehouse = await tx.assetWarehouse.create({
      data: {
        code: "INSTALLATION",
        name: "Installation",
        prefix: "IN",
        headStockControllerId: suriya.id,
      },
    });
    const users = await tx.user.findMany({ where: { isActive: true }, select: { id: true } });
    await tx.userWarehousePermission.createMany({
      data: users.map((user) => ({
        userId: user.id,
        warehouseId: warehouse.id,
        canView: true,
        canManage: user.id === suriya.id,
      })),
    });

    return {
      deletedAssets: assetIds.length,
      deletedTransactions: transactionIds.length,
      createdWarehouse: warehouse.code,
      permissionUsers: users.length,
    };
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
