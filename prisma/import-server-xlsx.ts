import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import {
  AssetActionType,
  AssetStatus,
  CustomFieldDataType,
  MigrationRowStatus,
  MigrationStatus,
  Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";

type SourceRow = Record<string, unknown>;
type ImportRow = {
  sheet: string;
  rowNumber: number;
  raw: Record<string, string | null>;
  category: string;
  categoryCode: string;
  type: string;
  typeCode: string;
  brand: string | null;
  model: string;
  partNo: string | null;
  description: string | null;
  serialNo: string;
  location: string | null;
  note: string | null;
  status: AssetStatus;
  specifications: Record<string, string>;
  stockCode: string;
  modelKey: string;
};

const categoryCodes: Record<string, string> = {
  Server: "SV",
  Storage: "ST",
  HDD: "HD",
  SSD: "SS",
  Memory: "MM",
  Module: "MD",
  Card: "CD",
  "Spare Part": "SP",
};

const typeCodes: Record<string, Record<string, string>> = {
  Server: { "Rack Server": "RAK", "Tower Server": "TOW", "Micro Server": "MIC" },
  Storage: { NAS: "NAS", SAN: "SAN" },
  HDD: { SAS: "SAS", SATA: "SAT" },
  SSD: { SAS: "SAS", SATA: "SAT" },
  Memory: { RDIMM: "RDM" },
  Module: { "Single Mode": "SOM", "Multi Mode": "MTM" },
  Card: { "RAID Card": "RAD", "HBA Card": "HBA", "SAS Card": "SAS", "PCI Card": "PCI", "Network Card": "NWC" },
  "Spare Part": { "Power Supply Unit": "PSU", Fan: "FAN", Card: "CAD", Battery: "BAT" },
};

const statusMap: Record<string, AssetStatus> = {
  Ready: AssetStatus.READY,
  Sold: AssetStatus.SOLD,
  Borrow: AssetStatus.BORROW,
  Using: AssetStatus.USING,
  Fail: AssetStatus.FAIL,
  Wait: AssetStatus.NEED_CHECK,
  "Need Check": AssetStatus.NEED_CHECK,
};

const coreColumns = new Set([
  "Status", "Category", "Types", "Brand", "Model", "Serial No.", "Part No.", "Description", "Location", "Remark",
]);
const sheets = ["Server", "Storage", "HDD", "SSD", "Memory", "Module", "Card", "Spare Part"];

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function optional(value: unknown): string | null {
  const valueText = text(value);
  return !valueText || valueText === "-" ? null : valueText;
}

function customKey(label: string): string {
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return key || `field_${Buffer.from(label).toString("hex").slice(0, 24)}`;
}

function parseWorkbook(filePath: string): ImportRow[] {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  if (workbook.SheetNames.length !== sheets.length || sheets.some((sheet) => !workbook.SheetNames.includes(sheet))) {
    throw new Error(`Expected exactly these eight detail sheets: ${sheets.join(", ")}.`);
  }

  const rows: ImportRow[] = [];
  const counters = new Map<string, number>();
  for (const sheet of sheets) {
    const sourceRows = XLSX.utils.sheet_to_json<SourceRow>(workbook.Sheets[sheet], { defval: null, raw: false, blankrows: false });
    for (let index = 0; index < sourceRows.length; index++) {
      const source = sourceRows[index];
      if (Object.values(source).every((value) => !text(value))) continue;
      const category = text(source.Category);
      const type = text(source.Types);
      const statusText = text(source.Status);
      const categoryCode = categoryCodes[category];
      const typeCode = typeCodes[category]?.[type];
      const status = statusMap[statusText];
      const serialNo = text(source["Serial No."]);
      const model = text(source.Model);
      if (!categoryCode || !typeCode) throw new Error(`${sheet} row ${index + 2}: unmapped category/type ${category} / ${type}.`);
      if (!status) throw new Error(`${sheet} row ${index + 2}: unmapped status ${statusText}.`);
      if (!serialNo) throw new Error(`${sheet} row ${index + 2}: Serial No. is required.`);
      if (!model) throw new Error(`${sheet} row ${index + 2}: Model is required.`);

      const brand = optional(source.Brand);
      const partNo = optional(source["Part No."]);
      const description = optional(source.Description);
      const specifications = Object.fromEntries(Object.entries(source)
        .filter(([key, value]) => !coreColumns.has(key) && !key.startsWith("__EMPTY") && key !== "0" && optional(value) !== null)
        .map(([key, value]) => [key, text(value)]));
      const raw = Object.fromEntries(Object.entries(source)
        .filter(([key]) => !key.startsWith("__EMPTY") && key !== "0")
        .map(([key, value]) => [key, optional(value)]));
      const pair = `${categoryCode}-${typeCode}`;
      const sequence = (counters.get(pair) ?? 0) + 1;
      counters.set(pair, sequence);
      rows.push({
        sheet,
        rowNumber: index + 2,
        raw,
        category,
        categoryCode,
        type,
        typeCode,
        brand,
        model,
        partNo,
        description,
        serialNo,
        location: optional(source.Location),
        note: optional(source.Remark),
        status,
        specifications,
        stockCode: `SV-${categoryCode}-${typeCode}${String(sequence).padStart(4, "0")}`,
        modelKey: JSON.stringify([category, type, brand, model, partNo, description]),
      });
    }
  }

  if (rows.length !== 713) throw new Error(`Expected 713 inventory records; parsed ${rows.length}.`);
  if (new Set(rows.map((row) => row.serialNo)).size !== rows.length) throw new Error("Workbook contains duplicate serial numbers.");
  if (new Set(rows.map((row) => row.stockCode)).size !== rows.length) throw new Error("Generated stock codes are not unique.");
  return rows;
}

function summarize(rows: ImportRow[]) {
  const countBy = (key: (row: ImportRow) => string) => Object.fromEntries(
    [...rows.reduce((map, row) => map.set(key(row), (map.get(key(row)) ?? 0) + 1), new Map<string, number>())].sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    records: rows.length,
    categoryCounts: countBy((row) => row.category),
    typeCounts: countBy((row) => `${row.category} / ${row.type}`),
    statusCounts: countBy((row) => row.status),
    waitMappedToNeedCheck: rows.filter((row) => row.raw.Status === "Wait").length,
    uniqueModels: new Set(rows.map((row) => row.modelKey)).size,
    specificFieldsByCategory: Object.fromEntries(Object.keys(categoryCodes).map((category) => [
      category,
      [...new Set(rows.filter((row) => row.category === category).flatMap((row) => Object.keys(row.specifications)))].sort(),
    ])),
    stockCodeExamples: rows.slice(0, 10).map(({ stockCode, category, type, model }) => ({ stockCode, category, type, model })),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply") && args.includes("--replace-server");
  if (args.includes("--apply") !== args.includes("--replace-server")) {
    throw new Error("To replace records, pass both --apply and --replace-server.");
  }
  const suppliedPath = args.find((arg) => !arg.startsWith("--"));
  const filePath = resolve(suppliedPath ?? process.env.SERVER_XLSX ?? "../data/Server update 30_09_26.xlsx");
  const rows = parseWorkbook(filePath);
  const warehouse = await db.assetWarehouse.findUnique({ where: { code: "SERVER" }, select: { id: true, code: true, prefix: true, name: true } });
  if (!warehouse || warehouse.prefix !== "SV") throw new Error("SERVER warehouse not found or its prefix is not SV.");

  const oldAssets = await db.asset.findMany({ where: { warehouseId: warehouse.id }, select: { id: true } });
  const oldAssetIds = oldAssets.map((asset) => asset.id);
  const oldModels = await db.assetModel.findMany({ where: { warehouseId: warehouse.id }, select: { id: true } });
  const oldModelIds = oldModels.map((model) => model.id);
  const serials = rows.map((row) => row.serialNo);
  const [assetItemRefs, modelItemRefs, outcomeRefs, externalModelAssets, serialConflicts, actor, otherWarehouses] = await Promise.all([
    db.transactionItem.count({ where: { assetId: { in: oldAssetIds } } }),
    db.transactionItem.count({ where: { assetModelId: { in: oldModelIds } } }),
    db.transactionItemOutcome.count({ where: { assetId: { in: oldAssetIds } } }),
    db.asset.count({ where: { assetModelId: { in: oldModelIds }, warehouseId: { not: warehouse.id } } }),
    db.asset.findMany({ where: { serialNo: { in: serials }, warehouseId: { not: warehouse.id } }, select: { serialNo: true, warehouse: { select: { code: true } } } }),
    db.user.findFirst({ where: { roles: { some: { role: { code: "ADMIN" } } } }, select: { id: true, name: true } }),
    db.assetWarehouse.findMany({ where: { code: { not: "SERVER" } }, select: { code: true, _count: { select: { assets: true } } } }),
  ]);
  const summary = {
    mode: apply ? "apply" : "dry-run",
    file: filePath,
    warehouse,
    existingServerAssets: oldAssets.length,
    existingServerModels: oldModels.length,
    replacingWith: rows.length,
    transactionItemReferencesByAsset: assetItemRefs,
    transactionItemReferencesByModel: modelItemRefs,
    transactionOutcomeReferences: outcomeRefs,
    assetsInOtherWarehousesUsingServerModels: externalModelAssets,
    serialConflictsInOtherWarehouses: serialConflicts,
    actor: actor ? { id: actor.id, name: actor.name } : null,
    otherWarehouseAssetCounts: Object.fromEntries(otherWarehouses.map(({ code, _count }) => [code, _count.assets])),
    ...summarize(rows),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) return;
  if (!actor) throw new Error("No ADMIN account is available to attribute the import.");
  if (oldAssets.length !== 551) throw new Error(`Found ${oldAssets.length} existing Server assets; expected 551 at confirmation. Refusing replacement.`);
  if (assetItemRefs || modelItemRefs || outcomeRefs || externalModelAssets || serialConflicts.length) {
    throw new Error("Transaction/history or cross-warehouse references prevent safe replacement. Nothing was changed.");
  }

  const beforeOtherCounts = Object.fromEntries(otherWarehouses.map(({ code, _count }) => [code, _count.assets]));
  const result = await db.$transaction(async (tx) => {
    const current = await tx.assetWarehouse.findUniqueOrThrow({ where: { code: "SERVER" }, select: { id: true, prefix: true } });
    if (current.id !== warehouse.id || current.prefix !== "SV") throw new Error("SERVER warehouse identity changed after preflight.");
    const currentAssets = await tx.asset.findMany({ where: { warehouseId: current.id }, select: { id: true } });
    if (currentAssets.length !== 551 || currentAssets.some((asset) => !oldAssetIds.includes(asset.id))) {
      throw new Error("Server inventory changed after preflight; refusing replacement.");
    }
    const assetIds = currentAssets.map((asset) => asset.id);
    const models = await tx.assetModel.findMany({ where: { warehouseId: current.id }, select: { id: true } });
    const modelIds = models.map((model) => model.id);
    const [assetRefs, modelRefs, outcomeCount, externalAssets, duplicateSerials] = await Promise.all([
      tx.transactionItem.count({ where: { assetId: { in: assetIds } } }),
      tx.transactionItem.count({ where: { assetModelId: { in: modelIds } } }),
      tx.transactionItemOutcome.count({ where: { assetId: { in: assetIds } } }),
      tx.asset.count({ where: { assetModelId: { in: modelIds }, warehouseId: { not: current.id } } }),
      tx.asset.count({ where: { serialNo: { in: serials }, warehouseId: { not: current.id } } }),
    ]);
    if (assetRefs || modelRefs || outcomeCount || externalAssets || duplicateSerials) {
      throw new Error("References or duplicate serials appeared after preflight; replacement aborted.");
    }

    const categories = await tx.assetCategory.findMany({ where: { warehouseId: current.id }, select: { id: true } });
    const categoryIds = categories.map((category) => category.id);
    await tx.assetCustomFieldValue.deleteMany({ where: { assetId: { in: assetIds } } });
    await tx.assetReservation.deleteMany({ where: { assetId: { in: assetIds } } });
    await tx.userFavorite.deleteMany({ where: { assetId: { in: assetIds } } });
    await tx.assetStatusHistory.deleteMany({ where: { assetId: { in: assetIds } } });
    await tx.migrationRow.deleteMany({ where: { assetId: { in: assetIds } } });
    await tx.asset.deleteMany({ where: { id: { in: assetIds } } });
    await tx.assetModel.deleteMany({ where: { id: { in: modelIds } } });
    await tx.assetCategoryCustomField.deleteMany({ where: { categoryId: { in: categoryIds } } });
    await tx.assetType.deleteMany({ where: { categoryId: { in: categoryIds } } });
    await tx.assetCategory.deleteMany({ where: { id: { in: categoryIds } } });

    const categoryRecords = new Map<string, { id: string }>();
    for (const [name, code] of Object.entries(categoryCodes)) {
      const category = await tx.assetCategory.create({ data: { warehouseId: current.id, name, code }, select: { id: true } });
      categoryRecords.set(name, category);
    }
    const typeRecords = new Map<string, { id: string }>();
    for (const [categoryName, types] of Object.entries(typeCodes)) {
      const categoryId = categoryRecords.get(categoryName)!.id;
      for (const [typeName, code] of Object.entries(types)) {
        const type = await tx.assetType.create({ data: { categoryId, name: typeName, code }, select: { id: true } });
        typeRecords.set(`${categoryName}\u0000${typeName}`, type);
      }
    }

    const fieldsByCategoryLabel = new Map<string, string>();
    for (const categoryName of Object.keys(categoryCodes)) {
      const labels = [...new Set(rows.filter((row) => row.category === categoryName).flatMap((row) => Object.keys(row.specifications)))].sort();
      const categoryId = categoryRecords.get(categoryName)!.id;
      for (const [sortOrder, label] of labels.entries()) {
        const field = await tx.assetCategoryCustomField.create({
          data: { categoryId, key: customKey(label), label, dataType: CustomFieldDataType.TEXT, isSearchable: true, sortOrder },
          select: { id: true },
        });
        fieldsByCategoryLabel.set(`${categoryName}\u0000${label}`, field.id);
      }
    }

    const modelRecords = new Map<string, { id: string }>();
    const batch = await tx.migrationBatch.create({
      data: { sourceSystem: "Server Excel", fileName: "Server update 30_09_26.xlsx", status: MigrationStatus.PROCESSING, totalRows: rows.length, createdById: actor.id },
      select: { id: true },
    });
    const assetsToCreate: Prisma.AssetCreateManyInput[] = [];
    const historiesToCreate: Prisma.AssetStatusHistoryCreateManyInput[] = [];
    const valuesToCreate: Prisma.AssetCustomFieldValueCreateManyInput[] = [];
    const migrationRowsToCreate: Prisma.MigrationRowCreateManyInput[] = [];
    for (const row of rows) {
      let model = modelRecords.get(row.modelKey);
      if (!model) {
        const modelRecord = await tx.assetModel.create({
          data: {
            warehouseId: current.id,
            categoryId: categoryRecords.get(row.category)!.id,
            assetTypeId: typeRecords.get(`${row.category}\u0000${row.type}`)!.id,
            name: row.model,
            brand: row.brand,
            partNo: row.partNo,
            typeName: row.type,
            description: row.description,
            isSerialized: true,
          },
          select: { id: true },
        });
        model = modelRecord;
        modelRecords.set(row.modelKey, modelRecord);
      }
      const assetId = randomUUID();
      assetsToCreate.push({
        id: assetId,
        assetModelId: model.id,
        warehouseId: current.id,
        serialNo: row.serialNo,
        status: row.status,
        stockCode: row.stockCode,
        assetQuantity: 1,
        locationText: row.location,
        note: row.note,
        specifications: row.specifications as Prisma.InputJsonValue,
        sourceSystem: "Server Excel",
        sourceRecordId: `${row.sheet}:${row.rowNumber}`,
        migrationBatchId: batch.id,
        createdById: actor.id,
        updatedById: actor.id,
      });
      historiesToCreate.push({ assetId, actionType: AssetActionType.IMPORT, toStatus: row.status, changedById: actor.id, note: `Imported from ${row.sheet}, row ${row.rowNumber}.` });
      valuesToCreate.push(...Object.entries(row.specifications).flatMap(([label, valueText]) => {
        const fieldId = fieldsByCategoryLabel.get(`${row.category}\u0000${label}`);
        return fieldId ? [{ assetId, fieldId, valueText }] : [];
      }));
      migrationRowsToCreate.push({
        migrationBatchId: batch.id,
        rowNumber: row.rowNumber,
        rawData: row.raw as Prisma.InputJsonValue,
        mappedData: { category: row.category, type: row.type, status: row.status, stockCode: row.stockCode, serialNo: row.serialNo } as Prisma.InputJsonValue,
        status: MigrationRowStatus.IMPORTED,
        assetId,
      });
    }
    await tx.asset.createMany({ data: assetsToCreate });
    await tx.assetStatusHistory.createMany({ data: historiesToCreate });
    if (valuesToCreate.length) await tx.assetCustomFieldValue.createMany({ data: valuesToCreate });
    await tx.migrationRow.createMany({ data: migrationRowsToCreate });
    await tx.migrationBatch.update({ where: { id: batch.id }, data: { status: MigrationStatus.COMPLETED, successRows: rows.length, completedAt: new Date() } });

    const [assetCount, stockCodeCount, serialCount, statusCounts, otherCounts] = await Promise.all([
      tx.asset.count({ where: { warehouseId: current.id, isActive: true } }),
      tx.asset.count({ where: { warehouseId: current.id, stockCode: { startsWith: "SV-" } } }),
      tx.asset.count({ where: { warehouseId: current.id, serialNo: { not: null } } }),
      tx.asset.groupBy({ by: ["status"], where: { warehouseId: current.id }, _count: { _all: true } }),
      tx.assetWarehouse.findMany({ where: { code: { not: "SERVER" } }, select: { code: true, _count: { select: { assets: true } } } }),
    ]);
    if (assetCount !== 713 || stockCodeCount !== 713 || serialCount !== 713) throw new Error("Post-import Server inventory verification failed.");
    const otherAssetCounts = Object.fromEntries(otherCounts.map(({ code, _count }) => [code, _count.assets]));
    if (JSON.stringify(beforeOtherCounts) !== JSON.stringify(otherAssetCounts)) throw new Error("Another warehouse asset count changed unexpectedly.");
    return { imported: assetCount, stockCodes: stockCodeCount, serials: serialCount, statusCounts, otherWarehouseAssetCounts: otherAssetCounts, migrationBatchId: batch.id };
  }, { maxWait: 30_000, timeout: 120_000 });
  console.log(JSON.stringify({ result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
