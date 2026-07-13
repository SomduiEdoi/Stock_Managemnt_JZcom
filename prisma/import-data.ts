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
const sourceSystem = "SharePoint";

type CsvRecord = Record<string, string>;
type DomainCode = "NETWORK" | "SERVER";

type SourceFile = {
  domainCode: DomainCode;
  fileName: string;
};

type ParsedRow = {
  rowNumber: number;
  data: CsvRecord;
};

type MappedRow = {
  brand: string | null;
  categoryName: string | null;
  description: string | null;
  imageRef: string | null;
  legacyFg: number | null;
  legacyQty: number | null;
  locationText: string | null;
  modelName: string;
  note: string | null;
  partNo: string | null;
  serialNo: string;
  status: AssetStatus;
  stockCode: string | null;
  typeCode: string | null;
  typeName: string | null;
};

const sourceFiles: SourceFile[] = [
  { domainCode: "NETWORK", fileName: "Network_reclassified.csv" },
  { domainCode: "SERVER", fileName: "Server_reclassified.csv" },
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

const typeCodeByDomain: Record<DomainCode, Record<string, string>> = {
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
};

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function fallbackTypeCode(value: string | null) {
  const normalized = (value ?? "XX").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  return (normalized || "XX").padEnd(3, "X").slice(0, 3);
}

function typeCodeFor(domainCode: DomainCode, typeName: string | null) {
  if (!typeName) {
    return null;
  }

  return typeCodeByDomain[domainCode][normalizeKey(typeName)] ?? fallbackTypeCode(typeName);
}

function nextImportedStockCode(
  domainPrefix: string,
  typeCode: string | null,
  counters: Map<string, number>,
) {
  const prefix = `${domainPrefix}-${typeCode ?? "UNK"}`;
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

function mapRow(domainCode: DomainCode, row: CsvRecord): MappedRow {
  const serialNo = clean(row["Serial No."]);

  if (!serialNo) {
    throw new Error("Serial No. is required.");
  }

  const typeName = clean(row.Types);

  return {
    brand: clean(row.Brand),
    categoryName: clean(row.Category),
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
    typeCode: typeCodeFor(domainCode, typeName),
    typeName,
  };
}

async function findOrCreateCategory(
  tx: Prisma.TransactionClient,
  domainId: string,
  name: string | null,
) {
  if (!name) {
    return null;
  }

  return tx.assetCategory.upsert({
    where: { domainId_name: { domainId, name } },
    update: { isActive: true },
    create: { domainId, name },
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
      trackMethod: AssetTrackMethod.SERIAL,
    },
  });
}

async function findOrCreateModel(
  tx: Prisma.TransactionClient,
  domainId: string,
  categoryId: string | null,
  assetTypeId: string | null,
  mapped: MappedRow,
) {
  const existing = await tx.assetModel.findFirst({
    where: {
      brand: mapped.brand,
      categoryId,
      domainId,
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
      domainId,
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
  return mapped.legacyQty && mapped.legacyQty > 0 ? mapped.legacyQty : 1;
}

function toAssetData(
  mapped: MappedRow,
  domainId: string,
  assetModelId: string,
  locationId: string | null,
  userId: string,
  batchId: string,
  sourceRecordId: string,
) {
  return {
    assetModelId,
    assetQuantity: toAssetQuantity(mapped),
    domainId,
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
  domainId: string,
  userId: string,
  batchId: string,
  sourceRecordId: string,
) {
  const category = await findOrCreateCategory(tx, domainId, mapped.categoryName);
  const assetType = await findOrCreateAssetType(
    tx,
    category?.id ?? null,
    mapped.typeName,
    mapped.typeCode,
  );
  const location = await findOrCreateLocation(tx, mapped.locationText);
  const model = await findOrCreateModel(
    tx,
    domainId,
    category?.id ?? null,
    assetType?.id ?? null,
    mapped,
  );
  const assetData = toAssetData(
    mapped,
    domainId,
    model.id,
    location?.id ?? null,
    userId,
    batchId,
    sourceRecordId,
  );
  const existing = await tx.asset.findUnique({
    where: { serialNo: mapped.serialNo },
  });

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
  domainId: string,
  userId: string,
  seenSerials: Set<string>,
  domainCode: DomainCode,
  domainPrefix: string,
  stockCodeCounters: Map<string, number>,
) {
  const mapped = mapRow(domainCode, row.data);
  mapped.stockCode = nextImportedStockCode(domainPrefix, mapped.typeCode, stockCodeCounters);
  const serialKey = mapped.serialNo.toLowerCase();

  if (seenSerials.has(serialKey)) {
    throw new Error(`Duplicate serial no. in source files: ${mapped.serialNo}`);
  }

  seenSerials.add(serialKey);

  return prisma.$transaction(async (tx) => {
    const sourceRecordId = `${batchId}:${row.rowNumber}:${mapped.serialNo}`;
    const asset = await upsertAssetFromRow(
      tx,
      mapped,
      domainId,
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
  const domain = await prisma.assetDomain.findUnique({
    where: { code: sourceFile.domainCode },
  });

  if (!domain) {
    throw new Error(`Missing domain ${sourceFile.domainCode}. Run seed first.`);
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
    domain.id,
    domain.prefix,
    userId,
    seenSerials,
  );
}

async function importRowsForBatch(
  sourceFile: SourceFile,
  batchId: string,
  domainId: string,
  domainPrefix: string,
  userId: string,
  seenSerials: Set<string>,
) {
  const filePath = path.join(process.cwd(), "data", sourceFile.fileName);
  const rows = await readCsvRows(filePath);
  const stockCodeCounters = new Map<string, number>();
  let successRows = 0;
  let failedRows = 0;

  for (const row of rows) {
    try {
      await importParsedRow(
        batchId,
        row,
        domainId,
        userId,
        seenSerials,
        sourceFile.domainCode,
        domainPrefix,
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
