import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  AssetActionType,
  AssetStatus,
  MigrationRowStatus,
  MigrationStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();
const workbookPath =
  process.env.SALE_STOCK_XLSX ??
  path.resolve(process.cwd(), "..", "data", "BSD_Sale_Stock_29_09_26.xlsx");
const sourceSystem = "Excel";
const saleStockWarehouseCode = "SALE_STOCK";

const sourceSheets = [
  "Power",
  "Cables",
  "Adapter & Converter",
  "Memory",
  "Storage",
  "Computer",
  "Accessories",
] as const;

const categoryPrefixByName = new Map<string, string>([
  ["adapter & converter", "AD"],
  ["accessories", "AC"],
  ["cables", "CB"],
  ["computer", "CP"],
  ["memory", "MM"],
  ["power", "PW"],
  ["storage", "ST"],
]);

const typePrefixByName = new Map<string, string>([
  ["bag", "BAG"],
  ["battery", "BAT"],
  ["component", "CPN"],
  ["converter", "ADP"],
  ["enclosure", "ENC"],
  ["hdd", "HDD"],
  ["hdmi", "HDM"],
  ["headphones", "HPN"],
  ["keypad", "KPD"],
  ["memory card", "MCD"],
  ["mini pc", "MPC"],
  ["monitor", "MON"],
  ["mouse", "MOU"],
  ["mouse pad", "MPD"],
  ["notebook", "NBK"],
  ["office accessory", "OFA"],
  ["pc/desktop", "PCD"],
  ["printer cable", "PRT"],
  ["ram", "RAM"],
  ["ssd", "SSD"],
  ["switch", "SWT"],
  ["ups", "UPS"],
  ["usb cable", "USB"],
  ["usb flash drive", "UFD"],
  ["vga cable", "VGA"],
]);

const standardColumns = new Set([
  "No.",
  "Category",
  "Type",
  "Brand",
  "Model",
  "Part No.",
  "Description",
  "Q'ty",
  "Location",
  "Check Stock 2025",
  "Remark",
]);

const specificationColumnsBySheet = new Map<string, string[]>([
  ["Accessories", ["Specification", "Specific 2", "Used"]],
]);

type ExcelRow = {
  rowNumber: number;
  sheetName: string;
  values: Record<string, string | number | boolean | null>;
};

type MappedSaleRow = {
  brand: string | null;
  categoryCode: string;
  categoryName: string;
  description: string | null;
  locationText: string | null;
  modelName: string;
  note: string | null;
  partNo: string | null;
  quantity: number;
  rawData: Record<string, string | number | boolean | null>;
  rowNumber: number;
  sheetName: string;
  specifications: Record<string, string>;
  status: AssetStatus;
  stockCode: string;
  typeCode: string;
  typeName: string;
};

function cleanText(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  return text && text !== "-" ? text : null;
}

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeCode(value: string | null | undefined, length: 2 | 3) {
  const normalized = (value ?? "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();

  return (normalized || "X".repeat(length)).padEnd(length, "X").slice(0, length);
}

function parseQuantity(value: unknown) {
  const text = cleanText(value);

  if (!text || text === "-") {
    return 0;
  }

  const parsed = Number.parseInt(text.replace(/,/g, ""), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readWorkbookRows() {
  const pythonCode = `
import json, sys, openpyxl
sys.stdout.reconfigure(encoding="utf-8")
path = sys.argv[1]
sheets = ${JSON.stringify(sourceSheets)}
wb = openpyxl.load_workbook(path, data_only=True)
rows = []
for sheet_name in sheets:
    ws = wb[sheet_name]
    header_row = None
    headers = []
    for row in ws.iter_rows():
        values = [cell.value for cell in row]
        if any(value == "No." for value in values):
            header_row = row[0].row
            headers = [str(value).strip() if value is not None else "" for value in values]
            break
    if header_row is None:
        raise RuntimeError(f"Missing header row in {sheet_name}")
    last_header_index = max(i for i, header in enumerate(headers) if header)
    headers = headers[:last_header_index + 1]
    for excel_row_number, excel_row in enumerate(ws.iter_rows(min_row=header_row + 1, values_only=True), start=header_row + 1):
        cells = list(excel_row[:len(headers)])
        if not any(value not in (None, "") for value in cells):
            continue
        record = {}
        for index, header in enumerate(headers):
            if header:
                record[header] = cells[index] if index < len(cells) else None
        if not record.get("Model") and not record.get("Description"):
            continue
        rows.append({"sheetName": sheet_name, "rowNumber": excel_row_number, "values": record})
print(json.dumps(rows, ensure_ascii=False, default=str))
`;
  const result = spawnSync("python", ["-c", pythonCode, workbookPath], {
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
    },
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || "Unable to read Sale Stock workbook.");
  }

  return JSON.parse(result.stdout) as ExcelRow[];
}

function typeNameFor(row: ExcelRow) {
  const categoryName = cleanText(row.values.Category) ?? row.sheetName;
  const rawType = cleanText(row.values.Type);

  if (categoryName === "Cables") {
    const connector = normalizeKey(cleanText(row.values["Connector / Cable Type"]));

    if (connector.includes("printer")) return "Printer Cable";
    if (connector.includes("usb")) return "USB Cable";
    if (connector.includes("vga")) return "VGA Cable";
    if (connector.includes("hdmi")) return "HDMI";
  }

  if (categoryName === "Accessories") {
    const raw = normalizeKey(rawType);
    if (raw.includes("switch")) return "Switch";
  }

  return rawType ?? "Unknown";
}

function buildSpecifications(row: ExcelRow) {
  const specifications: Record<string, string> = {};
  const allowedColumns = specificationColumnsBySheet.get(row.sheetName);

  Object.entries(row.values).forEach(([key, rawValue]) => {
    if (standardColumns.has(key)) {
      return;
    }

    if (allowedColumns && !allowedColumns.includes(key)) {
      return;
    }

    const value = cleanText(rawValue);

    if (value && value !== "-") {
      specifications[key.trim()] = value;
    }
  });

  return specifications;
}

function nextStockCode(
  warehousePrefix: string,
  categoryCode: string,
  typeCode: string,
  counters: Map<string, number>,
) {
  const prefix = `${warehousePrefix}-${categoryCode}-${typeCode}`;
  const sequence = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, sequence);

  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

function mapRows(rows: ExcelRow[], warehousePrefix: string) {
  const counters = new Map<string, number>();
  const duplicateNames = new Map<string, number>();

  return rows.map<MappedSaleRow>((row) => {
    const categoryName = cleanText(row.values.Category) ?? row.sheetName;
    const categoryCode =
      categoryPrefixByName.get(normalizeKey(categoryName)) ??
      normalizeCode(categoryName, 2);
    const typeName = typeNameFor(row);
    const typeCode =
      typePrefixByName.get(normalizeKey(typeName)) ??
      normalizeCode(typeName, 3);
    const quantity = parseQuantity(row.values["Q'ty"]);
    const modelNameBase =
      cleanText(row.values.Model) ??
      cleanText(row.values.Description) ??
      `Unknown ${categoryName}`;
    const duplicateKey = [
      normalizeKey(categoryName),
      normalizeKey(typeName),
      normalizeKey(cleanText(row.values.Brand)),
      normalizeKey(modelNameBase),
      normalizeKey(cleanText(row.values["Part No."])),
    ].join("|");
    const duplicateCount = (duplicateNames.get(duplicateKey) ?? 0) + 1;
    duplicateNames.set(duplicateKey, duplicateCount);
    const modelName = duplicateCount > 1 ? `${modelNameBase} (${duplicateCount})` : modelNameBase;

    return {
      brand: cleanText(row.values.Brand),
      categoryCode,
      categoryName,
      description: cleanText(row.values.Description),
      locationText: cleanText(row.values.Location),
      modelName,
      note: cleanText(row.values.Remark),
      partNo: cleanText(row.values["Part No."]),
      quantity,
      rawData: row.values,
      rowNumber: row.rowNumber,
      sheetName: row.sheetName,
      specifications: buildSpecifications(row),
      status: quantity > 0 ? AssetStatus.READY : AssetStatus.NEED_CHECK,
      stockCode: nextStockCode(warehousePrefix, categoryCode, typeCode, counters),
      typeCode,
      typeName,
    };
  });
}

async function validateMasterData(warehouseId: string, rows: MappedSaleRow[]) {
  const categories = await prisma.assetCategory.findMany({
    where: { warehouseId },
    select: { name: true, code: true, types: { select: { name: true, code: true } } },
  });
  const categoryByName = new Map(categories.map((category) => [normalizeKey(category.name), category]));
  const missing: string[] = [];

  for (const row of rows) {
    const category = categoryByName.get(normalizeKey(row.categoryName));
    const type = category?.types.find((item) => normalizeKey(item.name) === normalizeKey(row.typeName));
    if (!category || category.code !== row.categoryCode || !type || type.code !== row.typeCode) {
      missing.push(`${row.categoryName} / ${row.typeName} (${row.categoryCode}/${row.typeCode})`);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Excel mappings do not match existing Sale Stock master data: ${Array.from(new Set(missing)).join(", ")}`);
  }
}

async function clearWarehouseAssets(tx: Prisma.TransactionClient, warehouseId: string) {
  const assetIds = (
    await tx.asset.findMany({
      select: { id: true },
      where: { warehouseId },
    })
  ).map((asset) => asset.id);

  const transactionItemCount = await tx.transactionItem.count({
    where: { assetId: { in: assetIds } },
  });

  if (transactionItemCount > 0) {
    throw new Error(
      `Cannot clear warehouse because ${transactionItemCount} transaction item(s) still reference its assets.`,
    );
  }

  const modelIds = (
    await tx.assetModel.findMany({ select: { id: true }, where: { warehouseId } })
  ).map((model) => model.id);
  const modelTransactionItemCount = await tx.transactionItem.count({
    where: { assetModelId: { in: modelIds } },
  });
  if (modelTransactionItemCount > 0) {
    throw new Error(
      `Cannot replace Sale Stock because ${modelTransactionItemCount} transaction item(s) still reference its models.`,
    );
  }

  await tx.assetReservation.deleteMany({ where: { assetId: { in: assetIds } } });
  await tx.assetCustomFieldValue.deleteMany({ where: { assetId: { in: assetIds } } });
  await tx.assetStatusHistory.deleteMany({ where: { assetId: { in: assetIds } } });
  await tx.migrationRow.deleteMany({ where: { assetId: { in: assetIds } } });
  const deletedAssets = await tx.asset.deleteMany({ where: { id: { in: assetIds } } });

  await tx.assetModel.deleteMany({ where: { warehouseId } });

  return deletedAssets.count;
}


async function createFieldDefinitions(
  tx: Prisma.TransactionClient,
  categoryId: string,
  categoryRows: MappedSaleRow[],
) {
  const labels = Array.from(
    new Set(categoryRows.flatMap((row) => Object.keys(row.specifications))),
  );
  const fieldsByLabel = new Map<string, { id: string; key: string; label: string }>();

  for (const [index, label] of labels.entries()) {
    const key = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 50);

    if (!key) {
      continue;
    }

    const field = await tx.assetCategoryCustomField.upsert({
      create: {
        categoryId,
        dataType: "TEXT",
        isActive: true,
        isFilterable: true,
        isRequired: false,
        isSearchable: true,
        key,
        label,
        sortOrder: index,
      },
      update: {
        isActive: true,
        isFilterable: true,
        isSearchable: true,
        label,
        sortOrder: index,
      },
      where: { categoryId_key: { categoryId, key } },
    });
    fieldsByLabel.set(label, { id: field.id, key: field.key, label: field.label });
  }

  return fieldsByLabel;
}

async function importSaleStockRows(
  tx: Prisma.TransactionClient,
  rows: MappedSaleRow[],
  warehouseId: string,
  userId: string,
  batchId: string,
) {
  const categoriesByName = new Map<string, string>();
  const typesByKey = new Map<string, string>();
  const importedAssets: Array<{ assetId: string; categoryName: string; row: MappedSaleRow }> = [];

  for (const row of rows) {
    let categoryId = categoriesByName.get(row.categoryName);

    if (!categoryId) {
      const category = await tx.assetCategory.upsert({
        create: {
          code: row.categoryCode,
          isActive: true,
          name: row.categoryName,
          warehouseId,
        },
        update: {
          code: row.categoryCode,
          isActive: true,
        },
        where: { warehouseId_name: { name: row.categoryName, warehouseId } },
      });
      categoryId = category.id;
      categoriesByName.set(row.categoryName, categoryId);
    }

    const typeKey = `${categoryId}:${row.typeName}`;
    let assetTypeId = typesByKey.get(typeKey);

    if (!assetTypeId) {
      const type = await tx.assetType.upsert({
        create: {
          categoryId,
          code: row.typeCode,
          isActive: true,
          name: row.typeName,
        },
        update: {
          code: row.typeCode,
          isActive: true,
        },
        where: { categoryId_name: { categoryId, name: row.typeName } },
      });
      assetTypeId = type.id;
      typesByKey.set(typeKey, assetTypeId);
    }

    const location = row.locationText
      ? await tx.location.upsert({
          create: { name: row.locationText },
          update: { isActive: true },
          where: { name: row.locationText },
        })
      : null;

    const model = await tx.assetModel.create({
      data: {
        assetTypeId,
        brand: row.brand,
        categoryId,
        description: row.description,
        isActive: true,
        isSerialized: false,
        name: row.modelName,
        partNo: row.partNo,
        typeName: row.typeName,
        warehouseId,
      },
    });

    const asset = await tx.asset.create({
      data: {
        assetModelId: model.id,
        assetQuantity: row.quantity,
        createdById: userId,
        isActive: true,
        locationId: location?.id ?? null,
        locationText: row.locationText,
        migrationBatchId: batchId,
        note: row.note,
        serialNo: null,
        sourceRecordId: `${batchId}:${row.sheetName}:${row.rowNumber}:${row.stockCode}`,
        sourceSystem,
        specifications: row.specifications,
        status: row.status,
        stockCode: row.stockCode,
        updatedById: userId,
        warehouseId,
      },
    });

    await tx.assetStatusHistory.create({
      data: {
        actionType: AssetActionType.IMPORT,
        assetId: asset.id,
        changedById: userId,
        fromStatus: null,
        newQuantity: row.quantity,
        note: `Imported from ${path.basename(workbookPath)}:${row.sheetName} row ${row.rowNumber}.`,
        previousQuantity: null,
        toStatus: row.status,
      },
    });

    await tx.migrationRow.create({
      data: {
        assetId: asset.id,
        mappedData: row as unknown as Prisma.InputJsonObject,
        migrationBatchId: batchId,
        rawData: row.rawData as Prisma.InputJsonObject,
        rowNumber: row.rowNumber,
        status: MigrationRowStatus.IMPORTED,
      },
    });
    importedAssets.push({ assetId: asset.id, categoryName: row.categoryName, row });
  }

  for (const [categoryName, categoryId] of categoriesByName.entries()) {
    const fieldsByLabel = await createFieldDefinitions(
      tx,
      categoryId,
      rows.filter((row) => row.categoryName === categoryName),
    );

    for (const importedAsset of importedAssets.filter((asset) => asset.categoryName === categoryName)) {
      for (const [label, value] of Object.entries(importedAsset.row.specifications)) {
        const field = fieldsByLabel.get(label);

        if (!field) {
          continue;
        }

        await tx.assetCustomFieldValue.upsert({
          create: {
            assetId: importedAsset.assetId,
            fieldId: field.id,
            valueText: value,
          },
          update: { valueText: value },
          where: {
            assetId_fieldId: {
              assetId: importedAsset.assetId,
              fieldId: field.id,
            },
          },
        });
      }
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const replaceSaleStock = process.argv.includes("--replace-sale-stock");

  if (apply && !replaceSaleStock) {
    throw new Error("Applying this import requires --replace-sale-stock.");
  }

  const admin = await prisma.user.findFirst({
    where: { roles: { some: { role: { code: "ADMIN" } } }, isActive: true },
  });

  if (!admin) {
    throw new Error("Missing active admin user.");
  }

  const saleStock = await prisma.assetWarehouse.findUnique({
    where: { code: saleStockWarehouseCode },
    select: { id: true, prefix: true },
  });
  if (!saleStock) {
    throw new Error("SALE_STOCK warehouse does not exist. Refusing to create or modify warehouse settings.");
  }
  const saleStockWarehouseId = saleStock.id;

  const excelRows = readWorkbookRows();
  const mappedRows = mapRows(excelRows, saleStock.prefix);
  await validateMasterData(saleStock.id, mappedRows);

  if (mappedRows.length !== 71) {
    throw new Error(`Expected 71 source rows, found ${mappedRows.length}. Refusing to continue.`);
  }
  const duplicateStockCodes = mappedRows.length - new Set(mappedRows.map((row) => row.stockCode)).size;
  if (duplicateStockCodes > 0) {
    throw new Error(`Found ${duplicateStockCodes} duplicate stock code(s). Refusing to continue.`);
  }

  const preview = {
    file: path.basename(workbookPath),
    mode: apply ? "REPLACE SALE_STOCK" : "DRY RUN",
    total: mappedRows.length,
    ready: mappedRows.filter((row) => row.status === AssetStatus.READY).length,
    needCheck: mappedRows.filter((row) => row.status === AssetStatus.NEED_CHECK).length,
    totalQuantity: mappedRows.reduce((sum, row) => sum + row.quantity, 0),
    categories: Object.fromEntries(
      Array.from(new Set(mappedRows.map((row) => row.categoryName))).map((category) => [
        category,
        mappedRows.filter((row) => row.categoryName === category).length,
      ]),
    ),
    stockCodeExamples: mappedRows.slice(0, 5).map((row) => row.stockCode),
    specificLabels: Object.fromEntries(
      Array.from(new Set(mappedRows.map((row) => row.categoryName))).map((category) => [
        category,
        Array.from(new Set(mappedRows.filter((row) => row.categoryName === category).flatMap((row) => Object.keys(row.specifications)))),
      ]),
    ),
  };
  if (!apply) {
    console.info("Sale Stock import preview (no database changes made).");
    console.info(JSON.stringify(preview, null, 2));
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const saleStock = await tx.assetWarehouse.findUnique({
        where: { code: saleStockWarehouseCode },
        select: { id: true },
      });
      if (!saleStock) {
        throw new Error("SALE_STOCK warehouse does not exist. Refusing to create or modify warehouse settings.");
      }
      if (saleStock.id !== saleStockWarehouseId) {
        throw new Error("SALE_STOCK warehouse changed during import preflight. Refusing to continue.");
      }

      const clearedSaleStockAssets = await clearWarehouseAssets(tx, saleStock.id);

      const batch = await tx.migrationBatch.create({
        data: {
          createdById: admin.id,
          fileName: path.basename(workbookPath),
          sourceSystem,
          status: MigrationStatus.PROCESSING,
          totalRows: mappedRows.length,
        },
      });

      await importSaleStockRows(tx, mappedRows, saleStock.id, admin.id, batch.id);

      await tx.migrationBatch.update({
        data: {
          completedAt: new Date(),
          failedRows: 0,
          status: MigrationStatus.COMPLETED,
          successRows: mappedRows.length,
        },
        where: { id: batch.id },
      });

      return {
        clearedSaleStockAssets,
        imported: mappedRows.length,
        needCheck: mappedRows.filter((row) => row.status === AssetStatus.NEED_CHECK).length,
        ready: mappedRows.filter((row) => row.status === AssetStatus.READY).length,
      };
    },
    { timeout: 60_000 },
  );

  console.info("Sale Stock import complete.");
  console.info(JSON.stringify(preview, null, 2));
  console.info(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
