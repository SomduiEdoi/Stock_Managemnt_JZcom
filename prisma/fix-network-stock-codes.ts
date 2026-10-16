import { db } from "@/lib/db";

const expectedCount = 594;

function correctedCode(stockCode: string | null, categoryCode: string | null, typeCode: string | null) {
  if (!stockCode || !categoryCode || !typeCode) throw new Error("Found a Network asset without stock code/category/type code.");
  const oldPattern = /^NW-([A-Z0-9]{2})-([A-Z0-9]{3})-(\d{4})$/;
  const newPattern = /^NW-([A-Z0-9]{2})-([A-Z0-9]{3})(\d{4})$/;
  const match = stockCode.match(oldPattern) ?? stockCode.match(newPattern);
  if (!match || match[1] !== categoryCode || match[2] !== typeCode) {
    throw new Error(`Unexpected Network stock code or prefix mismatch: ${stockCode}.`);
  }
  return `NW-${categoryCode}-${typeCode}${match[3]}`;
}

async function main() {
  const apply = process.argv.includes("--apply") && process.argv.includes("--fix-network-stockcodes");
  if (process.argv.includes("--apply") !== process.argv.includes("--fix-network-stockcodes")) {
    throw new Error("To write changes, pass both --apply and --fix-network-stockcodes.");
  }
  const warehouse = await db.assetWarehouse.findUnique({ where: { code: "NETWORK" }, select: { id: true, code: true, prefix: true } });
  if (!warehouse || warehouse.prefix !== "NW") throw new Error("NETWORK warehouse not found or prefix is not NW.");
  const assets = await db.asset.findMany({
    where: { warehouseId: warehouse.id },
    select: {
      id: true,
      stockCode: true,
      assetModel: { select: { category: { select: { code: true } }, assetType: { select: { code: true } } } },
    },
    orderBy: { stockCode: "asc" },
  });
  if (assets.length !== expectedCount) throw new Error(`Expected ${expectedCount} Network assets; found ${assets.length}.`);
  const updates = assets.map((asset) => ({
    id: asset.id,
    from: asset.stockCode,
    to: correctedCode(asset.stockCode, asset.assetModel.category?.code ?? null, asset.assetModel.assetType?.code ?? null),
  }));
  if (new Set(updates.map((item) => item.to)).size !== expectedCount) throw new Error("Corrected Network stock codes would not be unique.");
  const changed = updates.filter((item) => item.from !== item.to);
  const targetCodes = updates.map((item) => item.to);
  const conflicts = await db.asset.findMany({
    where: { stockCode: { in: targetCodes }, warehouseId: { not: warehouse.id } },
    select: { stockCode: true, warehouse: { select: { code: true } } },
  });
  if (conflicts.length) throw new Error(`Corrected codes collide with other warehouses: ${JSON.stringify(conflicts)}.`);
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    warehouse,
    assets: assets.length,
    needingCorrection: changed.length,
    unchanged: assets.length - changed.length,
    collisionsOutsideNetwork: conflicts.length,
    samples: changed.slice(0, 12),
  }, null, 2));
  if (!apply) return;

  const result = await db.$transaction(async (tx) => {
    const current = await tx.asset.findMany({ where: { warehouseId: warehouse.id }, select: { id: true, stockCode: true } });
    if (current.length !== expectedCount) throw new Error("Network asset count changed after preflight.");
    const initial = new Map(updates.map((item) => [item.id, item.from]));
    if (current.some((item) => initial.get(item.id) !== item.stockCode)) throw new Error("Network stock codes changed after preflight.");

    for (const item of changed) {
      await tx.asset.update({ where: { id: item.id }, data: { stockCode: item.to } });
    }
    const finalAssets = await tx.asset.findMany({ where: { warehouseId: warehouse.id }, select: { id: true, stockCode: true } });
    if (finalAssets.length !== expectedCount || finalAssets.some((item) => !/^NW-[A-Z0-9]{2}-[A-Z0-9]{3}\d{4}$/.test(item.stockCode ?? ""))) {
      throw new Error("Post-update Network stock code validation failed.");
    }
    return { updated: changed.length, total: finalAssets.length };
  }, { maxWait: 30_000, timeout: 120_000 });
  console.log(JSON.stringify({ result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
