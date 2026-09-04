import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AssetActionType,
  AssetTrackMethod,
  AssetStatus,
  MigrationRowStatus,
  MigrationStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();
const dataDirectory = process.env.STOCK_DATA_DIR ?? path.resolve(process.cwd(), "..", "data");
const selectedWarehouses = new Set(
  (process.env.STOCK_IMPORT_WAREHOUSES ?? "")
    .split(",")
    .map((warehouse) => normalizeKey(warehouse).toUpperCase())
    .filter(Boolean),
);
const sourceSystem = "SharePoint";

type CsvRecord = Record<string, string>;
type WarehouseCode = string;

type SourceFile = {
  warehouseCode: WarehouseCode;
  fileName: string;
};

type ParsedRow = {
  rowNumber: number;
  data: CsvRecord;
};

type MappedRow = {
  brand: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  description: string | null;
  imageRef: string | null;
  legacyFg: number | null;
  legacyQty: number | null;
  locationText: string | null;
  modelName: string;
  note: string | null;
  partNo: string | null;
  serialNo: string | null;
  status: AssetStatus;
  stockCode: string | null;
  trackMethod: AssetTrackMethod;
  typeCode: string | null;
  typeName: string | null;
};

const sourceFiles: SourceFile[] = [
  { warehouseCode: "NETWORK", fileName: "Network_reclassified.csv" },
  { warehouseCode: "SERVER", fileName: "Server_reclassified.csv" },
  { warehouseCode: "BSD", fileName: "BSD_reclassified.csv" },
  { warehouseCode: "DL", fileName: "DL_reclassified.csv" },
];

const statusMap = new Map<string, AssetStatus>([
  ["borrow", AssetStatus.BORROW],
  ["fail", AssetStatus.FAIL],
  ["lost", AssetStatus.LOST],
  ["need check", AssetStatus.NEED_CHECK],
  ["ready", AssetStatus.READY],
  ["sold", AssetStatus.SOLD],
  ["using", AssetStatus.USING],
  ["wait", AssetStatus.NEED_CHECK],
]);

const typeCodeByWarehouse: Record<WarehouseCode, Record<string, string>> = {
  NETWORK: {
    "access point": "APC",
    "aoc cable": "AOC",
    "dac cable": "DAC",
    "expansion module": "EXM",
    "fiber cable": "FCB",
    firewall: "FWL",
    gateway: "GTW",
    gbic: "GBC",
    "mounting kit": "MKT",
    "network module": "NMD",
    "poe injector": "POE",
    "power adapter": "PAD",
    "power module": "PWM",
    "power supply": "PSU",
    qsfp: "QSF",
    "rack kit": "RKT",
    router: "RTR",
    sfp: "SFP",
    "stack data cable": "SDC",
    "stack module": "STM",
    "stack power cable": "SPC",
    switch: "SWT",
    transceiver: "TRX",
    "wireless controller": "WLC",
  },
  SERVER: {
    "bay hdd": "BAY",
    "blade server": "BLD",
    cable: "CAB",
    fan: "FAN",
    "hba card": "HBA",
    "hdd sas": "HDS",
    "hdd sata": "HDT",
    hyperconverged: "HCI",
    memory: "MEM",
    "network card": "NIC",
    "power supply unit": "PSU",
    "rack server": "RAK",
    "raid card": "RAD",
    "sfp module": "SFP",
    "spare part": "SPR",
    "ssd sas": "SDS",
    "ssd sata": "SDT",
    "tower server": "TWR",
  },
  BSD: {
    adapter: "ADP",
    bag: "BAG",
    battery: "BAT",
    component: "CMP",
    enclosure: "ENC",
    "hdd": "HDD",
    hdmi: "HDM",
    headphones: "HPN",
    keypad: "KPD",
    "memory card": "MCD",
    "mini pc": "MPC",
    monitor: "MON",
    mouse: "MSE",
    "mouse pad": "MPD",
    notebook: "NBK",
    "office accessory": "OFA",
    "pc/desktop": "PCD",
    ram: "RAM",
    ssd: "SSD",
    switch: "SWT",
    ups: "UPS",
    "usb cable": "UCB",
    "usb flash drive": "UFD",
    "vga cable": "VGA",
  },
  DL: {
    "access control": "ACT",
    "cctv equipment": "CCT",
    "back box / outlet box": "BOX",
    "cable tie / cable management": "CTL",
    faceplate: "FAC",
    "fiber adapter / fiber module": "FAM",
    "fiber splice / fiber accessories": "FSP",
    "lan cable": "LAN",
    "modular jack / keystone jack": "MOJ",
    "modular plug (rj45 plug)": "MOP",
    "patch cord": "PCL",
    accessories: "ACC",
    "electrical cable / electrical material": "ECT",
    "plug / socket / power plug": "PUG",
    rack: "RAK",
    "rack accessories": "RAC",
    "telephone accessories": "TEL",
  },
  SALE_STOCK: {
    ups: "UPS",
    battery: "BAT",
    hdd: "HDD",
    ssd: "SSD",
    "usb flash drive": "UFD",
    "memory card": "MCD",
    ram: "RAM",
    notebook: "NBK",
    "mini pc": "MPC",
    "pc/desktop": "PCD",
    monitor: "MON",
    component: "CPN",
    hdmi: "HDM",
    "usb cable": "USB",
    "vga cable": "VGA",
    "printer cable": "PRT",
    converter: "ADP",
    "mouse pad": "MPD",
    bag: "BAG",
    mouse: "MOU",
    headphones: "HPN",
    keypad: "KPD",
    enclosure: "ENC",
    "office accessory": "OFA",
    switch: "SWT",
  },
};

const categoryCodeByWarehouse: Record<WarehouseCode, Record<string, string>> = {
  SALE_STOCK: {
    "adapter & converter": "AD",
    accessories: "AC",
    cables: "CB",
    computer: "CP",
    memory: "MM",
    power: "PW",
    storage: "ST",
  },
};

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function fallbackTypeCode(value: string | null) {
  const normalized = (value ?? "XX").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  return (normalized || "XX").padEnd(3, "X").slice(0, 3);
}

function typeCodeFor(warehouseCode: WarehouseCode, typeName: string | null) {
  if (!typeName) {
    return null;
  }

  return typeCodeByWarehouse[warehouseCode][normalizeKey(typeName)] ?? fallbackTypeCode(typeName);
}

function fallbackCategoryCode(value: string | null) {
  const normalized = (value ?? "XX").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  return (normalized || "XX").padEnd(2, "X").slice(0, 2);
}

function categoryCodeFor(warehouseCode: WarehouseCode, categoryName: string | null) {
  if (!categoryName) {
    return null;
  }

  return categoryCodeByWarehouse[warehouseCode]?.[normalizeKey(categoryName)] ?? fallbackCategoryCode(categoryName);
}

function nextImportedStockCode(
  warehousePrefix: string,
  categoryCode: string | null,
  typeCode: string | null,
  counters: Map<string, number>,
) {
  const prefix = `${warehousePrefix}-${categoryCode ?? "XX"}-${typeCode ?? "UNK"}`;
  const next = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, next);

  return `${prefix}${String(next).padStart(4, "0")}`;
}

function clean(value: string | undefined) {
  const trimmed = value?.replace(/^\uFEFF/, "").trim();

  return trimmed ? trimmed : null;
}

function parseInteger(value: string | undefined) {
  const cleaned = clean(value);

  if (!cleaned) {
    return null;
  }

  const parsed = Number.parseInt(cleaned.replaceAll(",", ""), 10);

  return Number.isNaN(parsed) ? null : parsed;
}

function stripSharePointSchema(text: string) {
  const normalized = text.replace(/^\uFEFF/, "");

  if (!normalized.startsWith("ListSchema=")) {
    return { text: normalized, headerRowNumber: 1 };
  }

  const lineBreakIndex = normalized.indexOf("\n");

  if (lineBreakIndex === -1) {
    throw new Error("CSV is missing a header row after ListSchema.");
  }

  return {
    text: normalized.slice(lineBreakIndex + 1),
    headerRowNumber: 2,
  };
}

function pushCsvCell(rows: string[][], row: string[], cell: string) {
  row.push(cell);

  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      pushCsvCell(rows, row, cell);
      row = [];
      cell = "";

      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    pushCsvCell(rows, row, cell);
  }

  return rows;
}

function recordFromCells(headers: string[], cells: string[]) {
  return headers.reduce<CsvRecord>((record, header, index) => {
    record[header] = cells[index] ?? "";
    return record;
  }, {});
}

async function readCsvRows(filePath: string) {
  const rawText = await readFile(filePath, "utf8");
  const stripped = stripSharePointSchema(rawText);
  const [headers, ...rows] = parseCsv(stripped.text);

  if (!headers) {
    throw new Error(`Missing CSV header in ${filePath}`);
  }

  return rows.map((cells, index) => ({
    rowNumber: stripped.headerRowNumber + index + 1,
    data: recordFromCells(headers, cells),
  }));
}

function mapStatus(value: string | undefined) {
  const cleaned = clean(value);
  const status = cleaned ? statusMap.get(cleaned.toLowerCase()) : null;

  if (!status) {
    throw new Error(`Unsupported status: ${cleaned ?? "(blank)"}`);
  }

  return status;
}

function combineNote(row: CsvRecord) {
  const parts = [clean(row.Remark)].filter(Boolean);

  return parts.length > 0 ? parts.join("\n") : null;
}

function mapRow(warehouseCode: WarehouseCode, row: CsvRecord): MappedRow {
  if (warehouseCode === "BSD" || warehouseCode === "DL") {
    const quantity = parseInteger(row.QTY) ?? 0;
    const categoryName = clean(row.Category);
    const typeName = clean(row.Types);

    return {
      brand: clean(row.Brand),
      categoryCode: categoryCodeFor(warehouseCode, categoryName),
      categoryName,
      description: clean(row.Description) ?? clean(row.Comment),
      imageRef: clean(row.Image),
      legacyFg: parseInteger(row.FG),
      legacyQty: quantity,
      locationText: clean(row.Location),
      modelName: clean(row.Model) ?? clean(row.Description) ?? "Unknown Model",
      note: combineNote(row),
      partNo: clean(row["Part No."]),
      serialNo: null,
      status: quantity > 0 ? AssetStatus.READY : AssetStatus.NEED_CHECK,
      stockCode: null,
      trackMethod: AssetTrackMethod.QUANTITY,
      typeCode: typeCodeFor(warehouseCode, typeName),
      typeName,
    };
  }

  const serialNo = clean(row["Serial No."]);

  if (!serialNo) {
    throw new Error("Serial No. is required.");
  }

  const typeName = clean(row.Types);
  const categoryName = clean(row.Category);

  return {
    brand: clean(row.Brand),
    categoryCode: categoryCodeFor(warehouseCode, categoryName),
    categoryName,
    description: clean(row.Description) ?? clean(row.Comment),
    imageRef: clean(row.Image),
    legacyFg: parseInteger(row.FG),
    legacyQty: parseInteger(row.QTY),
    locationText: clean(row.Location),
    modelName: clean(row.Model) ?? clean(row.Description) ?? "Unknown Model",
    note: combineNote(row),
    partNo: clean(row["Part No."]),
    serialNo,
    status: mapStatus(row.Status),
    stockCode: null,
    trackMethod: AssetTrackMethod.SERIAL,
    typeCode: typeCodeFor(warehouseCode, typeName),
    typeName,
  };
}

async function findOrCreateCategory(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  name: string | null,
  code: string | null,
) {
  if (!name) {
    return null;
  }

  return tx.assetCategory.upsert({
    where: { warehouseId_name: { warehouseId, name } },
    update: { code, isActive: true },
    create: { code, warehouseId, name },
  });
}

async function findOrCreateLocation(
  tx: Prisma.TransactionClient,
  name: string | null,
) {
  if (!name) {
    return null;
  }

  return tx.location.upsert({
    where: { name },
    update: { isActive: true },
    create: { name },
  });
}

async function findOrCreateAssetType(
  tx: Prisma.TransactionClient,
  categoryId: string | null,
  name: string | null,
  code: string | null,
  trackMethod: AssetTrackMethod,
) {
  if (!categoryId || !name) {
    return null;
  }

  return tx.assetType.upsert({
    where: { categoryId_name: { categoryId, name } },
    update: { code, isActive: true },
    create: {
      categoryId,
      code,
      name,
      trackMethod,
    },
  });
}

async function findOrCreateModel(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  categoryId: string | null,
  assetTypeId: string | null,
  mapped: MappedRow,
) {
  const existing = await tx.assetModel.findFirst({
    where: {
      brand: mapped.brand,
      categoryId,
      warehouseId,
      assetTypeId,
      name: mapped.modelName,
      partNo: mapped.partNo,
      typeName: mapped.typeName,
    },
  });

  if (existing) {
    return tx.assetModel.update({
      where: { id: existing.id },
      data: { description: mapped.description, isActive: true },
    });
  }

  return tx.assetModel.create({
    data: {
      brand: mapped.brand,
      categoryId,
      assetTypeId,
      description: mapped.description,
      warehouseId,
      name: mapped.modelName,
      partNo: mapped.partNo,
      typeName: mapped.typeName,
    },
  });
}

function toJsonObject(value: Record<string, unknown>) {
  return value as Prisma.InputJsonObject;
}

function toAssetQuantity(mapped: MappedRow) {
  if (mapped.trackMethod === AssetTrackMethod.QUANTITY) {
    return mapped.legacyQty ?? 0;
  }

  return mapped.legacyQty && mapped.legacyQty > 0 ? mapped.legacyQty : 1;
}

function toAssetData(
  mapped: MappedRow,
  warehouseId: string,
  assetModelId: string,
  locationId: string | null,
  userId: string,
  batchId: string,
  sourceRecordId: string,
) {
  return {
    assetModelId,
    assetQuantity: toAssetQuantity(mapped),
    warehouseId,
    imageRef: mapped.imageRef,
    legacyFg: mapped.legacyFg,
    legacyQty: mapped.legacyQty,
    locationId,
    locationText: mapped.locationText,
    migrationBatchId: batchId,
    note: mapped.note,
    requestLockedAt: null,
    requestLockedById: null,
    serialNo: mapped.serialNo,
    sourceRecordId,
    sourceSystem,
    status: mapped.status,
    stockCode: mapped.stockCode,
    updatedById: userId,
  };
}

async function createImportHistory(
  tx: Prisma.TransactionClient,
  assetId: string,
  mapped: MappedRow,
  userId: string,
  fromStatus: AssetStatus | null,
) {
  return tx.assetStatusHistory.create({
    data: {
      actionType: AssetActionType.IMPORT,
      assetId,
      changedById: userId,
      fromStatus,
      note: mapped.note ?? "Imported from SharePoint CSV.",
      toStatus: mapped.status,
    },
  });
}

async function upsertAssetFromRow(
  tx: Prisma.TransactionClient,
  mapped: MappedRow,
  warehouseId: string,
  userId: string,
  batchId: string,
  sourceRecordId: string,
) {
  const category = await findOrCreateCategory(tx, warehouseId, mapped.categoryName, mapped.categoryCode);
  const assetType = await findOrCreateAssetType(
    tx,
    category?.id ?? null,
    mapped.typeName,
    mapped.typeCode,
    mapped.trackMethod,
  );
  const location = await findOrCreateLocation(tx, mapped.locationText);
  const model = await findOrCreateModel(
    tx,
    warehouseId,
    category?.id ?? null,
    assetType?.id ?? null,
    mapped,
  );
  const assetData = toAssetData(
    mapped,
    warehouseId,
    model.id,
    location?.id ?? null,
    userId,
    batchId,
    sourceRecordId,
  );
  const existing =
    mapped.serialNo
      ? await tx.asset.findUnique({ where: { serialNo: mapped.serialNo } })
      : mapped.stockCode
        ? await tx.asset.findFirst({
            where: {
              warehouseId,
              stockCode: mapped.stockCode,
            },
          })
        : null;

  if (!existing) {
    const asset = await tx.asset.create({
      data: { ...assetData, createdById: userId },
    });
    await createImportHistory(tx, asset.id, mapped, userId, null);
    return asset;
  }

  const asset = await tx.asset.update({
    where: { id: existing.id },
    data: assetData,
  });

  if (existing.status !== mapped.status) {
    await createImportHistory(tx, asset.id, mapped, userId, existing.status);
  }

  return asset;
}

async function createFailedRow(
  batchId: string,
  row: ParsedRow,
  error: unknown,
  mapped?: MappedRow,
) {
  await prisma.migrationRow.create({
    data: {
      errorMessage: error instanceof Error ? error.message : String(error),
      mappedData: mapped ? toJsonObject({ ...mapped }) : undefined,
      migrationBatchId: batchId,
      rawData: toJsonObject(row.data),
      rowNumber: row.rowNumber,
      status: MigrationRowStatus.FAILED,
    },
  });
}

async function importParsedRow(
  batchId: string,
  row: ParsedRow,
  warehouseId: string,
  userId: string,
  seenSerials: Set<string>,
  warehouseCode: WarehouseCode,
  warehousePrefix: string,
  stockCodeCounters: Map<string, number>,
) {
  const mapped = mapRow(warehouseCode, row.data);
  mapped.stockCode = nextImportedStockCode(warehousePrefix, mapped.categoryCode, mapped.typeCode, stockCodeCounters);

  if (mapped.serialNo) {
    const serialKey = mapped.serialNo.toLowerCase();

    if (seenSerials.has(serialKey)) {
      throw new Error(`Duplicate serial no. in source files: ${mapped.serialNo}`);
    }

    seenSerials.add(serialKey);
  }

  return prisma.$transaction(async (tx) => {
    const sourceRecordId = `${batchId}:${row.rowNumber}:${mapped.serialNo ?? mapped.stockCode ?? mapped.modelName}`;
    const asset = await upsertAssetFromRow(
      tx,
      mapped,
      warehouseId,
      userId,
      batchId,
      sourceRecordId,
    );

    await tx.migrationRow.create({
      data: {
        assetId: asset.id,
        mappedData: toJsonObject({ ...mapped }),
        migrationBatchId: batchId,
        rawData: toJsonObject(row.data),
        rowNumber: row.rowNumber,
        status: MigrationRowStatus.IMPORTED,
      },
    });

    return asset;
  });
}

async function importFile(
  sourceFile: SourceFile,
  userId: string,
  seenSerials: Set<string>,
) {
  const warehouse = await prisma.assetWarehouse.findUnique({
    where: { code: sourceFile.warehouseCode },
  });

  if (!warehouse) {
    throw new Error(`Missing warehouse ${sourceFile.warehouseCode}. Run seed first.`);
  }

  const batch = await prisma.migrationBatch.create({
    data: {
      createdById: userId,
      fileName: sourceFile.fileName,
      sourceSystem,
      status: MigrationStatus.PROCESSING,
    },
  });

  return importRowsForBatch(
    sourceFile,
    batch.id,
    warehouse.id,
    warehouse.prefix,
    userId,
    seenSerials,
  );
}

async function importRowsForBatch(
  sourceFile: SourceFile,
  batchId: string,
  warehouseId: string,
  warehousePrefix: string,
  userId: string,
  seenSerials: Set<string>,
) {
  const filePath = path.join(dataDirectory, sourceFile.fileName);
  const rows = await readCsvRows(filePath);
  const stockCodeCounters = new Map<string, number>();
  let successRows = 0;
  let failedRows = 0;

  for (const row of rows) {
    try {
      await importParsedRow(
        batchId,
        row,
        warehouseId,
        userId,
        seenSerials,
        sourceFile.warehouseCode,
        warehousePrefix,
        stockCodeCounters,
      );
      successRows += 1;
    } catch (error) {
      failedRows += 1;
      await createFailedRow(batchId, row, error);
    }
  }

  const status =
    failedRows > 0
      ? MigrationStatus.COMPLETED_WITH_ERRORS
      : MigrationStatus.COMPLETED;

  await prisma.migrationBatch.update({
    where: { id: batchId },
    data: {
      completedAt: new Date(),
      failedRows,
      status,
      successRows,
      totalRows: rows.length,
    },
  });

  return { failedRows, fileName: sourceFile.fileName, successRows, totalRows: rows.length };
}

async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: "admin@example.com" },
  });

  if (!admin) {
    throw new Error("Missing admin@example.com. Run npm run db:seed first.");
  }

  const seenSerials = new Set<string>();
  const summaries = [];

  for (const sourceFile of sourceFiles) {
    if (selectedWarehouses.size > 0 && !selectedWarehouses.has(sourceFile.warehouseCode)) {
      continue;
    }

    summaries.push(await importFile(sourceFile, admin.id, seenSerials));
  }

  const totalAssets = await prisma.asset.count();
  console.info("SharePoint CSV import complete.");
  console.table(summaries);
  console.info(`Total assets in database: ${totalAssets}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
