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
  Switch: "SW",
  Wireless: "WL",
  Firewall: "FW",
  Module: "MD",
  "Spare Part": "SP",
  Cable: "CB",
};

const typeCodes: Record<string, Record<string, string>> = {
  Switch: { "Fast Ethernet": "FEN", "Gigabit Ethernet": "GEN", "Multi Gigabit Ethernet": "MGE" },
  Wireless: { "Access Point": "ACP", Controller: "CON" },
  Firewall: { Firewall: "FRN" },
  Module: { "Single Mode": "SGM", "Multi Mode": "MTM", "Copper (RJ45)": "COP", "Single Mode / Multi Mode": "SMM" },
  "Spare Part": { "Power Supply": "PWS", Expansion: "EXP", Router: "ROT", "POE Injector": "POE" },
  Cable: { "Stack Data Cable": "SDT", "Stack Power Cable": "SPR", "DAC Cable": "DAC", "AOC Cable": "AOC", "SAS Cable": "SAS" },
};

const statusMap: Record<string, AssetStatus> = {
  Ready: AssetStatus.READY,
  Using: AssetStatus.USING,
  "Need Check": AssetStatus.NEED_CHECK,
  Wait: AssetStatus.NEED_CHECK,
  Sold: AssetStatus.SOLD,
  Borrow: AssetStatus.BORROW,
  Fail: AssetStatus.FAIL,
  Lost: AssetStatus.LOST,
};

const coreColumns = new Set([
  "Status", "Category", "Types", "Brand", "Model", "Serial No.", "Part No.", "Description", "Location", "Remark",
]);

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
  const rows: ImportRow[] = [];
  const counters = new Map<string, number>();
  const sheets = ["Switch", "Wireless", "Firewall", "Module", "Spare Part", "Cable"];
  if (workbook.SheetNames.length !== sheets.length || sheets.some((sheet) => !workbook.SheetNames.includes(sheet))) {
    throw new Error(`Expected exactly these six detail sheets: ${sheets.join(", ")}.`);
  }

  for (const sheet of sheets) {
    const rawRows = XLSX.utils.sheet_to_json<SourceRow>(workbook.Sheets[sheet], { defval: null, raw: false, blankrows: false });
    for (let index = 0; index < rawRows.length; index++) {
      const source = rawRows[index];
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
      if (!serialNo) throw new Error(`${sheet} row ${index + 2}: Serial No. is required for this import.`);
      if (!model) throw new Error(`${sheet} row ${index + 2}: Model is required.`);

      const brand = optional(source.Brand);
      const partNo = optional(source["Part No."]);
      const description = optional(source.Description);
      const specifications = Object.fromEntries(
        Object.entries(source)
          .filter(([key, value]) => !coreColumns.has(key) && optional(value) !== null)
          .map(([key, value]) => [key, text(value)]),
      );
      const raw = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, optional(value)]));
      const pair = `${categoryCode}-${typeCode}`;
      const sequence = (counters.get(pair) ?? 0) + 1;
      counters.set(pair, sequence);
      const modelKey = JSON.stringify([category, type, brand, model, partNo, description]);
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
        stockCode: `NW-${categoryCode}-${typeCode}${String(sequence).padStart(4, "0")}`,
        modelKey,
      });
    }
  }

  if (rows.length !== 594) throw new Error(`Expected 594 inventory records; parsed ${rows.length}.`);
  const serials = rows.map((row) => row.serialNo);
  if (new Set(serials).size !== rows.length) throw new Error("Workbook contains duplicate serial numbers.");
  const stockCodes = rows.map((row) => row.stockCode);
  if (new Set(stockCodes).size !== rows.length) throw new Error("Generated stock codes are not unique.");
  return rows;
}

function buildSummary(rows: ImportRow[]) {
  const countBy = (key: (row: ImportRow) => string) => Object.fromEntries(
    [...rows.reduce((map, row) => map.set(key(row), (map.get(key(row)) ?? 0) + 1), new Map<string, number>())].sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    records: rows.length,
    serialized: rows.length,
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
  const apply = args.includes("--apply") && args.includes("--replace-network");
  if (args.includes("--apply") !== args.includes("--replace-network")) {
    throw new Error("To replace records, pass both --apply and --replace-network.");
  }
  const fileArgument = args.find((arg) => !arg.startsWith("--"));
  const filePath = resolve(fileArgument ?? process.env.NETWORK_XLSX ?? "../data/Network update 29_09_26.xlsx");
  const rows = parseWorkbook(filePath);
  const warehouse = await db.assetWarehouse.findUnique({
    where: { code: "NETWORK" },
    select: { id: true, code: true, prefix: true, name: true },
  });
  if (!warehouse || warehouse.prefix !== "NW") throw new Error("NETWORK warehouse not found or its prefix is not NW.");

  const oldAssets = await db.asset.findMany({ where: { warehouseId: warehouse.id }, select: { id: true, assetModelId: true } });
  const oldAssetIds = oldAssets.map((asset) => asset.id);
  const oldModels = await db.assetModel.findMany({ where: { warehouseId: warehouse.id }, select: { id: true } });
  const oldModelIds = oldModels.map((model) => model.id);
  const sourceSerials = rows.map((row) => row.serialNo);
  const [assetLinkedItems, modelLinkedItems, outcomeLinks, externalModelAssets, serialConflicts, actor, otherCounts] = await Promise.all([
    db.transactionItem.count({ where: { assetId: { in: oldAssetIds } } }),
    db.transactionItem.count({ where: { assetModelId: { in: oldModelIds } } }),
    db.transactionItemOutcome.count({ where: { assetId: { in: oldAssetIds } } }),
    db.asset.count({ where: { assetModelId: { in: oldModelIds }, warehouseId: { not: warehouse.id } } }),
    db.asset.findMany({ where: { serialNo: { in: sourceSerials }, warehouseId: { not: warehouse.id } }, select: { serialNo: true, warehouse: { select: { code: true } } } }),
    db.user.findFirst({ where: { roles: { some: { role: { code: "ADMIN" } } } }, select: { id: true, name: true } }),
    db.assetWarehouse.findMany({ where: { code: { not: "NETWORK" } }, select: { code: true, _count: { select: { assets: true } } } }),
  ]);
  const rowSummary = buildSummary(rows);
  const preflight = {
    mode: apply ? "apply" : "dry-run",
    file: filePath,
    warehouse,
    existingNetworkAssets: oldAssets.length,
    existingNetworkModels: oldModels.length,
    replacingWith: rows.length,
    transactionItemReferencesByAsset: assetLinkedItems,
    transactionItemReferencesByModel: modelLinkedItems,
    transactionOutcomeReferences: outcomeLinks,
    assetsInOtherWarehousesUsingNetworkModels: externalModelAssets,
    serialConflictsInOtherWarehouses: serialConflicts,
    actor: actor ? { id: actor.id, name: actor.name } : null,
    otherWarehouseAssetCounts: Object.fromEntries(otherCounts.map(({ code, _count }) => [code, _count.assets])),
    ...rowSummary,
  };
  console.log(JSON.stringify(preflight, null, 2));
  if (!apply) return;
  if (!actor) throw new Error("No active ADMIN account is available to attribute the import.");
  if (oldAssets.length !== 594) throw new Error(`Found ${oldAssets.length} existing Network assets, expected 594; refusing replacement.`);
  if (assetLinkedItems || modelLinkedItems || outcomeLinks || externalModelAssets || serialConflicts.length) {
    throw new Error("Network assets/models are referenced by transaction records. Nothing was changed; resolve these references before replacing inventory.");
  }

  const beforeCounts = Object.fromEntries(otherCounts.map(({ code, _count }) => [code, _count.assets]));
  const result = await db.$transaction(async (tx) => {
    const current = await tx.assetWarehouse.findUniqueOrThrow({ where: { code: "NETWORK" }, select: { id: true, prefix: true } });
    if (current.id !== warehouse.id || current.prefix !== "NW") throw new Error("NETWORK warehouse identity changed after preflight.");
    const currentAssets = await tx.asset.findMany({ where: { warehouseId: current.id }, select: { id: true, assetModelId: true } });
    if (currentAssets.length !== 594 || currentAssets.some((asset) => !oldAssetIds.includes(asset.id))) {
      throw new Error("Network inventory changed after preflight; refusing to replace a different dataset.");
    }
    const assetIds = currentAssets.map((asset) => asset.id);
    const modelsNow = await tx.assetModel.findMany({ where: { warehouseId: current.id }, select: { id: true } });
    const modelIds = modelsNow.map((model) => model.id);
    const [txAssetRefs, txModelRefs, outcomes] = await Promise.all([
      tx.transactionItem.count({ where: { assetId: { in: assetIds } } }),
      tx.transactionItem.count({ where: { assetModelId: { in: modelIds } } }),
      tx.transactionItemOutcome.count({ where: { assetId: { in: assetIds } } }),
    ]);
    const externalAssetsNow = await tx.asset.count({ where: { assetModelId: { in: modelIds }, warehouseId: { not: current.id } } });
    const serialConflictsNow = await tx.asset.count({ where: { serialNo: { in: sourceSerials }, warehouseId: { not: current.id } } });
    if (txAssetRefs || txModelRefs || outcomes || externalAssetsNow || serialConflictsNow) {
      throw new Error("A transaction reference, external model reference, or duplicate serial appeared after preflight; replacement aborted.");
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

    const categoryRecords = new Map<string, { id: string; code: string }>();
    for (const [name, code] of Object.entries(categoryCodes)) {
      const category = await tx.assetCategory.create({ data: { warehouseId: current.id, name, code }, select: { id: true, code: true } });
      categoryRecords.set(name, { id: category.id, code: category.code! });
    }
    const typeRecords = new Map<string, { id: string }>();
    for (const [categoryName, types] of Object.entries(typeCodes)) {
      const category = categoryRecords.get(categoryName)!;
      for (const [typeName, code] of Object.entries(types)) {
        const type = await tx.assetType.create({ data: { categoryId: category.id, name: typeName, code }, select: { id: true } });
        typeRecords.set(`${categoryName}\u0000${typeName}`, type);
      }
    }

    const fieldLabels = new Map<string, Set<string>>();
    for (const row of rows) {
      const labels = fieldLabels.get(row.category) ?? new Set<string>();
      Object.keys(row.specifications).forEach((key) => labels.add(key));
      fieldLabels.set(row.category, labels);
    }
    const fieldsByCategoryLabel = new Map<string, string>();
    for (const [categoryName, labels] of fieldLabels) {
      const categoryId = categoryRecords.get(categoryName)!.id;
      for (const [sortOrder, label] of [...labels].sort().entries()) {
        const field = await tx.assetCategoryCustomField.create({
          data: { categoryId, key: customKey(label), label, dataType: CustomFieldDataType.TEXT, isSearchable: true, sortOrder },
          select: { id: true },
        });
        fieldsByCategoryLabel.set(`${categoryName}\u0000${label}`, field.id);
      }
    }

    const modelRecords = new Map<string, { id: string }>();
    const batch = await tx.migrationBatch.create({
      data: {
        sourceSystem: "Network Excel",
        fileName: "Network update 29_09_26.xlsx",
        status: MigrationStatus.PROCESSING,
        totalRows: rows.length,
        createdById: actor.id,
      },
      select: { id: true },
    });

    const assetsToCreate: Prisma.AssetCreateManyInput[] = [];
    const historiesToCreate: Prisma.AssetStatusHistoryCreateManyInput[] = [];
    const customValuesToCreate: Prisma.AssetCustomFieldValueCreateManyInput[] = [];
    const migrationRowsToCreate: Prisma.MigrationRowCreateManyInput[] = [];
    for (const row of rows) {
      let model = modelRecords.get(row.modelKey);
      if (!model) {
        const category = categoryRecords.get(row.category)!;
        const type = typeRecords.get(`${row.category}\u0000${row.type}`)!;
        const created = await tx.assetModel.create({
          data: {
            warehouseId: current.id,
            categoryId: category.id,
            assetTypeId: type.id,
            name: row.model,
            brand: row.brand,
            partNo: row.partNo,
            typeName: row.type,
            description: row.description,
            isSerialized: true,
          },
          select: { id: true },
        });
        model = created;
        modelRecords.set(row.modelKey, created);
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
        sourceSystem: "Network Excel",
        sourceRecordId: `${row.sheet}:${row.rowNumber}`,
        migrationBatchId: batch.id,
        createdById: actor.id,
        updatedById: actor.id,
      });
      historiesToCreate.push({ assetId, actionType: AssetActionType.IMPORT, toStatus: row.status, changedById: actor.id, note: `Imported from ${row.sheet}, row ${row.rowNumber}.` });
      const values = Object.entries(row.specifications).flatMap(([label, valueText]) => {
        const fieldId = fieldsByCategoryLabel.get(`${row.category}\u0000${label}`);
        return fieldId ? [{ assetId, fieldId, valueText }] : [];
      });
      customValuesToCreate.push(...values);
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
    if (customValuesToCreate.length) await tx.assetCustomFieldValue.createMany({ data: customValuesToCreate });
    await tx.migrationRow.createMany({ data: migrationRowsToCreate });
    await tx.migrationBatch.update({ where: { id: batch.id }, data: { status: MigrationStatus.COMPLETED, successRows: rows.length, completedAt: new Date() } });

    const [finalCount, codeCount, serialCount, countsByStatus, finalOtherCounts] = await Promise.all([
      tx.asset.count({ where: { warehouseId: current.id, isActive: true } }),
      tx.asset.count({ where: { warehouseId: current.id, stockCode: { startsWith: "NW-" } } }),
      tx.asset.count({ where: { warehouseId: current.id, serialNo: { not: null } } }),
      tx.asset.groupBy({ by: ["status"], where: { warehouseId: current.id }, _count: { _all: true } }),
      tx.assetWarehouse.findMany({ where: { code: { not: "NETWORK" } }, select: { code: true, _count: { select: { assets: true } } } }),
    ]);
    if (finalCount !== 594 || codeCount !== 594 || serialCount !== 594) throw new Error("Post-import Network inventory verification failed.");
    const afterOtherCounts = Object.fromEntries(finalOtherCounts.map(({ code, _count }) => [code, _count.assets]));
    if (JSON.stringify(beforeCounts) !== JSON.stringify(afterOtherCounts)) throw new Error("Another warehouse asset count changed unexpectedly.");
    return { imported: finalCount, stockCodes: codeCount, serials: serialCount, countsByStatus, otherWarehouseAssetCounts: afterOtherCounts, migrationBatchId: batch.id };
  }, { maxWait: 30_000, timeout: 120_000 });

  console.log(JSON.stringify({ result }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
