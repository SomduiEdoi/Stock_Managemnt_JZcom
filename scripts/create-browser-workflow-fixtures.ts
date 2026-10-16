import { db } from "../src/lib/db";

const marker = "QA-BROWSER-20261005";

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log("Pass --apply to create labelled test stock in INSTALLATION and SALE_STOCK. Existing fixtures are never reset.");
    return;
  }
  const result = await db.$transaction(async (tx) => {
    const existing = await tx.assetModel.findMany({ where: { modelNo: marker }, include: { assets: true } });
    if (existing.length) return { reused: true, models: existing };
    const models = [];
    for (const code of ["INSTALLATION", "SALE_STOCK"]) {
      const warehouse = await tx.assetWarehouse.findUniqueOrThrow({ where: { code } });
      const category = await tx.assetCategory.findFirst({ where: { warehouseId: warehouse.id, isActive: true }, orderBy: { name: "asc" } });
      if (!category) throw new Error(`No active category for ${code}; no test data committed`);
      const quantity = await tx.assetModel.create({ data: {
        warehouseId: warehouse.id, categoryId: category.id, name: `${marker} ${code} Quantity`,
        modelNo: marker, brand: "QA TEST ONLY", description: "Disposable browser workflow test stock. Not real equipment.",
        isSerialized: false,
      } });
      for (const condition of ["NEW", "USED"] as const) {
        await tx.asset.create({ data: {
          assetModelId: quantity.id, warehouseId: warehouse.id, stockCode: `${warehouse.prefix}-QA-20261005-${condition}`,
          condition, status: "READY", assetQuantity: condition === "NEW" ? 20 : 3,
          note: `${marker}: TEST ONLY; initial ${condition} quantity ${condition === "NEW" ? 20 : 3}.`,
        } });
      }
      models.push(quantity);
      if (code === "INSTALLATION") {
        const serial = await tx.assetModel.create({ data: {
          warehouseId: warehouse.id, categoryId: category.id, name: `${marker} Serialized`,
          modelNo: marker, brand: "QA TEST ONLY", description: "Disposable serial return test. Not real equipment.",
          isSerialized: true,
        } });
        await tx.asset.create({ data: {
          assetModelId: serial.id, warehouseId: warehouse.id, stockCode: `${warehouse.prefix}-QA-20261005-SERIAL`,
          serialNo: `${marker}-SN001`, condition: "NEW", status: "READY", assetQuantity: 1,
          note: `${marker}: TEST ONLY; preserve this serial on return.`,
        } });
        models.push(serial);
      }
    }
    return { reused: false, models: await tx.assetModel.findMany({ where: { id: { in: models.map((model) => model.id) } }, include: { assets: true } }) };
  }, { isolationLevel: "Serializable" });
  console.log(JSON.stringify({ marker, reused: result.reused, models: result.models.map((model) => ({
    id: model.id, name: model.name, isSerialized: model.isSerialized,
    assets: model.assets.map((asset) => ({ id: asset.id, stockCode: asset.stockCode, condition: asset.condition, qty: asset.assetQuantity, serialNo: asset.serialNo })),
  })) }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
