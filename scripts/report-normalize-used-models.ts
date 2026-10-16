import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { Prisma, type AssetStatus } from "@prisma/client";
import { db } from "../src/lib/db";
import { buildNormalizationReport, validateApprovedMapping, type NormalizationSnapshot, type Row } from "../src/lib/used-model-normalization";

type Client = Prisma.TransactionClient;
export async function readSnapshot(client: Client): Promise<NormalizationSnapshot> {
  const read = async (table: string) => {
    const rows = await client.$queryRawUnsafe<{ row: Row }[]>(`SELECT row_to_json(t) AS row FROM ${table} t ORDER BY id`);
    return rows.map(result => result.row);
  };
  return {
    models: await read("asset_models"), assets: await read("assets"),
    items: await read("transaction_items"), transactions: await read("transactions"),
    reservations: await read("asset_reservations"), histories: await read("asset_status_histories"),
  };
}

export async function run(args: string[]) {
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) {
    const report = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return buildNormalizationReport(await readSnapshot(tx));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
    console.log(JSON.stringify({ mode: "dry-run", ...report }, null, 2));
    return;
  }
  if (args.length !== 3 || args[0] !== "--apply" || args[1] !== "--mapping") throw new Error("Usage: tsx scripts/report-normalize-used-models.ts [--dry-run | --apply --mapping approved.json]");
  const input: unknown = JSON.parse(await readFile(args[2], "utf8"));
  const result = await db.$transaction(async tx => {
    // Block concurrent inventory/workflow writes until revision validation and all updates commit.
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
    await tx.$executeRawUnsafe("LOCK TABLE asset_models, assets, transaction_items, transactions, asset_reservations, asset_status_histories IN SHARE ROW EXCLUSIVE MODE");
    const snapshot = await readSnapshot(tx);
    const mapping = validateApprovedMapping(input, snapshot);
    if (!await tx.user.findUnique({ where: { id: mapping.actorId } })) throw new Error("Audit actor does not exist");
    let changedAssets = 0;
    for (const pair of mapping.pairs) {
      for (const asset of snapshot.assets.filter(row => row.asset_model_id === pair.usedModelId)) {
        const count = await tx.$executeRaw`UPDATE assets SET asset_model_id = ${pair.newModelId}::uuid, condition = 'USED', updated_at = CURRENT_TIMESTAMP WHERE id = ${asset.id}::uuid AND asset_model_id = ${pair.usedModelId}::uuid`;
        if (count !== 1) throw new Error("Asset revision conflict");
        await tx.assetStatusHistory.create({ data: {
          assetId: asset.id, fromStatus: asset.status as AssetStatus, toStatus: asset.status as AssetStatus,
          actionType: "STATUS_CHANGE", changedById: mapping.actorId, condition: "USED",
          stockCode: asset.stock_code as string,
          previousQuantity: Number(asset.asset_quantity), newQuantity: Number(asset.asset_quantity),
          quantityBefore: Number(asset.asset_quantity), quantityAfter: Number(asset.asset_quantity), quantityChanged: 0,
          note: JSON.stringify({ event: "LEGACY_USED_MODEL_NORMALIZATION", version: 1, revision: mapping.revision, reason: mapping.reason, oldModelId: pair.usedModelId, newModelId: pair.newModelId, oldCondition: asset.condition, newCondition: "USED", stockCode: asset.stock_code }),
        } });
        changedAssets++;
      }
      const count = await tx.$executeRaw`UPDATE asset_models SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = ${pair.usedModelId}::uuid`;
      if (count !== 1) throw new Error("Model revision conflict");
    }
    return { mode: "apply", changedAssets, archivedModels: mapping.pairs.length, revision: mapping.revision };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => db.$disconnect());
}
