import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { AssetActionType, AssetStatus, CustomFieldDataType, Prisma } from "@prisma/client";
import { isQuantityTrackedAsset } from "../src/lib/asset-tracking";
import { db } from "@/lib/db";

type ImportRow = {
  sheet: string;
  sourceRecordId: string;
  category: string;
  categoryCode: string;
  type: string;
  typeCode: string;
  brand: string | null;
  model: string;
  description: string | null;
  partNo: string | null;
  quantity: number;
  note: string | null;
  specifics: Record<string, string>;
  stockCode: string;
};

const categoryCodes: Record<string, string> = {
  LAN: "LA",
  Fiber: "FB",
  Rack: "RK",
  Accessories: "AS",
  "AC Power": "AC",
  Electrical: "EL",
  "Access Control": "AT",
  CCTV: "CT",
  Telephone: "TP",
};

const typeCodes: Record<string, Record<string, string>> = {
  LAN: { "LAN Cable": "LAN", "Patch Cord": "PCL" },
  Fiber: { "Fiber Cable": "OFM" },
  Rack: { Cabinet: "CBN", "Rack Accessories": "ACC" },
  Accessories: { Modular: "MOJ", "Face plate": "FAC", Faceplate: "FAC", Box: "BOT" },
  "AC Power": { APC: "APC", AC: "ACC" },
  Electrical: { Socket: "SCK", "VCT Cable": "VCT", "THW Cable": "THW", "VAF Cable": "VAF" },
  "Access Control": { "Access Control": "ACT" },
  CCTV: { NVR: "NVR", Camera: "CAM", Accessories: "ACC" },
  Telephone: { "Telephone Accessories": "ACC", Cable: "CAB" },
};

const specificsByCategory: Record<string, string[]> = {
  LAN: ["Length", "Color", "Used"],
  Fiber: ["Length", "Fiber Mode", "Used"],
  Rack: ["Size", "Port", "Depth", "Used"],
  Accessories: ["Color", "Port", "Connector Type"],
  Electrical: ["Outlet", "Size", "Used"],
};

const stableStatuses = new Set<AssetStatus>([
  AssetStatus.READY,
  AssetStatus.NEED_CHECK,
  AssetStatus.FAIL,
  AssetStatus.LOST,
]);

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function optionalText(value: unknown) {
  const valueText = cellText(value);
  return !valueText || valueText === "-" ? null : valueText;
}

function quantity(value: unknown, sheet: string, rowNumber: number) {
  const raw = cellText(value);
  if (!raw || raw === "-" || /^xx$/i.test(raw)) return 0;

  const parsed = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${sheet} row ${rowNumber}: invalid QTY "${raw}".`);
  }
  return Math.floor(parsed);
}

function parseWorkbook(filePath: string): ImportRow[] {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheets = workbook.SheetNames.filter((name) => name.trim().toLowerCase() !== "stock-dl");
  if (sheets.length !== 9) {
    throw new Error(`Expected 9 detail sheets (excluding Stock-DL), found ${sheets.length}.`);
  }

  const counters = new Map<string, number>();
  const rows: ImportRow[] = [];

  for (const sheetName of sheets) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
    const headerIndex = matrix.findIndex((row) => row.includes("StockCode") && row.includes("Type"));
    if (headerIndex < 0) throw new Error(`${sheetName}: could not find the detail table header.`);

    const headers = matrix[headerIndex].map(cellText);
    const indices = (name: string) => headers.flatMap((value, index) => value === name ? [index] : []);
    const secondCategoryIndex = indices("Category")[1];
    const quantityIndex = ["QTY.", "Q'ty", "QTY"].map((name) => indices(name)[0]).find((index) => index !== undefined);
    const column = {
      sourceCode: indices("StockCode")[0],
      category: secondCategoryIndex,
      type: indices("Type")[0],
      brand: indices("Brand")[0],
      model: indices("Model")[0],
      description: indices("Description")[0],
      partNo: indices("Part no.")[0] ?? indices("Part No.")[0],
      quantity: quantityIndex,
      note: indices("Rem")[0],
    };
    if (Object.values(column).some((index) => index === undefined)) {
      throw new Error(`${sheetName}: one or more required columns are missing.`);
    }

    for (let index = headerIndex + 1; index < matrix.length; index++) {
      const source = matrix[index];
      const sourceCode = cellText(source[column.sourceCode!]);
      if (!sourceCode) continue;

      const category = cellText(source[column.category!]);
      const type = cellText(source[column.type!]);
      const categoryCode = categoryCodes[category];
      const typeCode = typeCodes[category]?.[type];
      if (!category || !type || !categoryCode || !typeCode) {
        throw new Error(`${sheetName} row ${index + 1}: unmapped category/type "${category}" / "${type}".`);
      }

      const specifics: Record<string, string> = {};
      for (const label of specificsByCategory[category] ?? []) {
        const fieldIndex = indices(label)[0];
        if (fieldIndex === undefined) continue;
        const fieldValue = optionalText(source[fieldIndex]);
        if (fieldValue) specifics[label] = fieldValue;
      }

      const sequenceKey = `${categoryCode}-${typeCode}`;
      const sequence = (counters.get(sequenceKey) ?? 0) + 1;
      counters.set(sequenceKey, sequence);
      const ordinal = rows.length + 1;
      rows.push({
        sheet: sheetName,
        sourceRecordId: `${sheetName}:${ordinal}`,
        category,
        categoryCode,
        type,
        typeCode,
        brand: optionalText(source[column.brand!]),
        model: optionalText(source[column.model!]) ?? type,
        description: optionalText(source[column.description!]),
        partNo: optionalText(source[column.partNo!]),
        quantity: quantity(source[column.quantity!], sheetName, index + 1),
        note: optionalText(source[column.note!]),
        specifics,
        stockCode: `IN-${categoryCode}-${typeCode}${String(sequence).padStart(4, "0")}`,
      });
    }
  }

  if (rows.length !== 170) throw new Error(`Expected 170 detail rows, found ${rows.length}.`);
  if (new Set(rows.map((row) => row.stockCode)).size !== rows.length) {
    throw new Error("Generated stock codes are not unique.");
  }
  return rows;
}

function getBaselineStatus(
  histories: Array<{
    actionType: AssetActionType;
    transactionId: string | null;
    fromStatus: AssetStatus | null;
    toStatus: AssetStatus;
    changedAt: Date;
  }>,
  currentStatus: AssetStatus,
) {
  const firstRequestEvent = histories.find((history) =>
    history.actionType === AssetActionType.REQUEST_HOLD || history.transactionId !== null,
  );
  if (!firstRequestEvent) return currentStatus;

  const priorStable = histories
    .filter((history) =>
      history.changedAt < firstRequestEvent.changedAt &&
      history.transactionId === null &&
      history.actionType !== AssetActionType.REQUEST_HOLD &&
      stableStatuses.has(history.toStatus),
    )
    .at(-1);
  if (priorStable) return priorStable.toStatus;
  if (firstRequestEvent.fromStatus && stableStatuses.has(firstRequestEvent.fromStatus)) {
    return firstRequestEvent.fromStatus;
  }
  return stableStatuses.has(currentStatus) ? currentStatus : AssetStatus.READY;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const clearTransactions = args.includes("--clear-transactions");
  if (apply && !clearTransactions) {
    throw new Error("Applying this replacement requires --clear-transactions because that was explicitly approved.");
  }

  const suppliedPath = args.find((arg) => !arg.startsWith("--"));
  const filePath = resolve(suppliedPath ?? "../data/DL_Installation_29_09_26.xlsx");
  const rows = parseWorkbook(filePath);
  const preview = {
    file: filePath,
    ignoredSheet: "Stock-DL",
    detailSheets: [...new Set(rows.map((row) => row.sheet))],
    rows: rows.length,
    ready: rows.filter((row) => row.quantity >= 1).length,
    needCheck: rows.filter((row) => row.quantity === 0).length,
    totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    specificFieldsByCategory: Object.fromEntries(
      Object.entries(specificsByCategory).map(([category, fields]) => [category, fields]),
    ),
    stockCodeExamples: rows.slice(0, 6).map(({ stockCode, category, type }) => ({ stockCode, category, type })),
  };
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", ...preview }, null, 2));
    return;
  }

  const result = await db.$transaction(async (tx) => {
    const warehouse = await tx.assetWarehouse.findUniqueOrThrow({ where: { code: "INSTALLATION" } });
    const existingAssets = await tx.asset.findMany({
      where: { warehouseId: warehouse.id },
      select: { id: true, sourceRecordId: true, sourceSystem: true, createdById: true, assetModelId: true },
    });
    if (existingAssets.length !== rows.length) {
      throw new Error(`Installation has ${existingAssets.length} assets; expected ${rows.length}. Refusing replacement.`);
    }
    const assetsBySourceId = new Map(existingAssets.map((asset) => [asset.sourceRecordId, asset]));
    if (assetsBySourceId.size !== rows.length || rows.some((row) => !assetsBySourceId.has(row.sourceRecordId))) {
      throw new Error("Existing Installation assets do not match the workbook row IDs. Refusing replacement.");
    }

    const transactions = await tx.transaction.findMany({
      select: {
        id: true,
        type: true,
        status: true,
        items: {
          select: {
            assetId: true,
            requestedQuantity: true,
            asset: { select: { serialNo: true, assetModel: { select: { isSerialized: true } } } },
          },
        },
      },
    });
    const transactionItems = transactions.flatMap((transaction) => transaction.items);
    const eventRows = await tx.assetStatusHistory.findMany({
      where: {
        OR: [
          { transactionId: { not: null } },
          { actionType: AssetActionType.REQUEST_HOLD },
        ],
      },
      orderBy: [{ changedAt: "asc" }, { id: "asc" }],
      select: { assetId: true },
    });
    const affectedAssetIds = [...new Set([
      ...transactionItems.flatMap((item) => item.assetId ? [item.assetId] : []),
      ...eventRows.map((event) => event.assetId),
    ])];
    const affectedAssets = affectedAssetIds.length
      ? await tx.asset.findMany({
          where: { id: { in: affectedAssetIds } },
          select: {
            id: true,
            status: true,
            assetQuantity: true,
            statusHistories: {
              orderBy: [{ changedAt: "asc" }, { id: "asc" }],
              select: { actionType: true, transactionId: true, fromStatus: true, toStatus: true, changedAt: true },
            },
          },
        })
      : [];

    const quantityToRestore = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.type !== "SOLD" || transaction.status !== "COMPLETED") continue;
      for (const item of transaction.items) {
        if (!item.assetId || !item.asset || !isQuantityTrackedAsset(item.asset)) continue;
        quantityToRestore.set(
          item.assetId,
          (quantityToRestore.get(item.assetId) ?? 0) + item.requestedQuantity,
        );
      }
    }

    for (const asset of affectedAssets) {
      const status = getBaselineStatus(asset.statusHistories, asset.status);
      const restoreQuantity = quantityToRestore.get(asset.id) ?? 0;
      await tx.asset.update({
        where: { id: asset.id },
        data: {
          status,
          assetQuantity: { increment: restoreQuantity },
          requestLockedById: null,
          requestLockedAt: null,
        },
      });
    }

    const removedHistories = await tx.assetStatusHistory.deleteMany({
      where: {
        OR: [
          { transactionId: { not: null } },
          { actionType: AssetActionType.REQUEST_HOLD },
        ],
      },
    });
    const removedReservations = await tx.assetReservation.deleteMany({});
    const clearedLocks = await tx.asset.updateMany({
      where: { OR: [{ requestLockedById: { not: null } }, { requestLockedAt: { not: null } }] },
      data: { requestLockedById: null, requestLockedAt: null },
    });
    const removedTransactions = await tx.transaction.deleteMany({});

    const actorId = existingAssets.find((asset) => asset.createdById)?.createdById
      ?? (await tx.user.findFirst({ where: { isActive: true }, select: { id: true } }))?.id;
    if (!actorId) throw new Error("No active user is available to attribute the import history.");

    const categoryRecords = new Map<string, { id: string; name: string }>();
    const typeRecords = new Map<string, { id: string }>();
    for (const row of rows) {
      let category = categoryRecords.get(row.category);
      if (!category) {
        const record = await tx.assetCategory.upsert({
          where: { warehouseId_name: { warehouseId: warehouse.id, name: row.category } },
          update: { code: row.categoryCode, isActive: true },
          create: { warehouseId: warehouse.id, name: row.category, code: row.categoryCode },
          select: { id: true, name: true },
        });
        category = record;
        categoryRecords.set(row.category, record);
      }

      const typeKey = `${row.category}:${row.type}`;
      let type = typeRecords.get(typeKey);
      if (!type) {
        type = await tx.assetType.upsert({
          where: { categoryId_name: { categoryId: category.id, name: row.type } },
          update: { code: row.typeCode, isActive: true },
          create: { categoryId: category.id, name: row.type, code: row.typeCode },
          select: { id: true },
        });
        typeRecords.set(typeKey, type);
      }

      const sourceAsset = assetsBySourceId.get(row.sourceRecordId)!;
      const oldAsset = await tx.asset.findUniqueOrThrow({
        where: { id: sourceAsset.id },
        select: { status: true, assetQuantity: true },
      });
      await tx.assetModel.update({
        where: { id: sourceAsset.assetModelId },
        data: {
          warehouseId: warehouse.id,
          categoryId: category.id,
          assetTypeId: type.id,
          name: row.model,
          isSerialized: false,
          brand: row.brand,
          modelNo: null,
          partNo: row.partNo,
          typeName: row.type,
          description: row.description,
          isActive: true,
        },
      });

      const assetStatus = row.quantity >= 1 ? AssetStatus.READY : AssetStatus.NEED_CHECK;
      await tx.asset.update({
        where: { id: sourceAsset.id },
        data: {
          warehouseId: warehouse.id,
          assetQuantity: row.quantity,
          status: assetStatus,
          stockCode: row.stockCode,
          serialNo: null,
          locationText: null,
          note: row.note,
          specifications: row.specifics as Prisma.InputJsonValue,
          sourceSystem: "Installation Excel",
          sourceRecordId: row.sourceRecordId,
          isActive: true,
          requestLockedById: null,
          requestLockedAt: null,
          updatedById: actorId,
        },
      });

      await tx.assetStatusHistory.create({
        data: {
          assetId: sourceAsset.id,
          actionType: AssetActionType.IMPORT,
          fromStatus: oldAsset.status,
          toStatus: assetStatus,
          previousQuantity: oldAsset.assetQuantity,
          newQuantity: row.quantity,
          changedById: actorId,
          note: `Replaced from ${row.sheet} in DL_Installation_29_09_26.xlsx.`,
        },
      });
    }

    const affectedCategoryIds = [...categoryRecords.values()].map((category) => category.id);
    for (const category of categoryRecords.values()) {
      const fieldNames = specificsByCategory[category.name] ?? [];
      const fieldKeys = fieldNames.map((label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
      await tx.assetCategoryCustomField.updateMany({
        where: { categoryId: category.id, key: { notIn: fieldKeys } },
        data: { isActive: false },
      });
      for (const [sortOrder, label] of fieldNames.entries()) {
        const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        await tx.assetCategoryCustomField.upsert({
          where: { categoryId_key: { categoryId: category.id, key } },
          update: { label, assetTypeId: null, dataType: CustomFieldDataType.TEXT, isActive: true, sortOrder },
          create: { categoryId: category.id, key, label, dataType: CustomFieldDataType.TEXT, isActive: true, sortOrder },
        });
      }
    }

    await tx.assetCustomFieldValue.deleteMany({ where: { assetId: { in: existingAssets.map((asset) => asset.id) } } });
    const fieldRecords = await tx.assetCategoryCustomField.findMany({
      where: { categoryId: { in: affectedCategoryIds }, isActive: true },
      select: { id: true, categoryId: true, key: true, label: true },
    });
    const fieldByCategoryAndLabel = new Map(
      fieldRecords.map((field) => [`${field.categoryId}:${field.label}`, field.id]),
    );
    const customValues = rows.flatMap((row) => {
      const category = categoryRecords.get(row.category)!;
      return Object.entries(row.specifics).flatMap(([label, valueText]) => {
        const fieldId = fieldByCategoryAndLabel.get(`${category.id}:${label}`);
        const assetId = assetsBySourceId.get(row.sourceRecordId)!.id;
        return fieldId ? [{ assetId, fieldId, valueText }] : [];
      });
    });
    if (customValues.length) await tx.assetCustomFieldValue.createMany({ data: customValues });

    const removedUnusedModels = await tx.assetModel.deleteMany({
      where: { warehouseId: warehouse.id, assets: { none: {} } },
    });
    const [assetCount, readyCount, needCheckCount, remainingTransactions, remainingApprovals, remainingItems, remainingOutcomes, remainingTxHistories] = await Promise.all([
      tx.asset.count({ where: { warehouseId: warehouse.id, isActive: true } }),
      tx.asset.count({ where: { warehouseId: warehouse.id, isActive: true, status: AssetStatus.READY } }),
      tx.asset.count({ where: { warehouseId: warehouse.id, isActive: true, status: AssetStatus.NEED_CHECK } }),
      tx.transaction.count(),
      tx.transactionApproval.count(),
      tx.transactionItem.count(),
      tx.transactionItemOutcome.count(),
      tx.assetStatusHistory.count({ where: { transactionId: { not: null } } }),
    ]);

    if (assetCount !== rows.length || readyCount !== 112 || needCheckCount !== 58) {
      throw new Error(`Post-import validation failed: ${assetCount} assets, ${readyCount} Ready, ${needCheckCount} Need Check.`);
    }
    if (remainingTransactions || remainingApprovals || remainingItems || remainingOutcomes || remainingTxHistories) {
      throw new Error("Post-clear validation failed; transactional records remain.");
    }

    return {
      ...preview,
      imported: rows.length,
      readyCount,
      needCheckCount,
      customValues: customValues.length,
      removedUnusedModels: removedUnusedModels.count,
      cleared: {
        transactions: removedTransactions.count,
        transactionLinkedHistories: removedHistories.count,
        reservations: removedReservations.count,
        unlockedAssets: clearedLocks.count,
      },
      remaining: {
        transactions: remainingTransactions,
        approvals: remainingApprovals,
        transactionItems: remainingItems,
        outcomes: remainingOutcomes,
        transactionLinkedHistories: remainingTxHistories,
      },
      categories: categoryRecords.size,
      types: typeRecords.size,
    };
  }, { timeout: 120_000, maxWait: 10_000 });

  console.log(JSON.stringify({ mode: "applied", ...result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
