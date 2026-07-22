import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dataDirectory = process.env.STOCK_DATA_DIR ?? path.resolve(process.cwd(), "..", "data");

type CsvRecord = Record<string, string>;

const sourceFiles = [
  {
    descriptionColumn: "Comment",
    fileName: "Network_reclassified.csv",
  },
  {
    descriptionColumn: "Description",
    fileName: "Server_reclassified.csv",
  },
] as const;

function clean(value: string | undefined) {
  const trimmed = value?.replace(/^\uFEFF/, "").trim();

  return trimmed ? trimmed : null;
}

function stripSharePointSchema(text: string) {
  const normalized = text.replace(/^\uFEFF/, "");

  if (!normalized.startsWith("ListSchema=")) {
    return normalized;
  }

  const lineBreakIndex = normalized.indexOf("\n");

  if (lineBreakIndex === -1) {
    throw new Error("CSV is missing a header row after ListSchema.");
  }

  return normalized.slice(lineBreakIndex + 1);
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

async function readCsvRecords(fileName: string) {
  const filePath = path.join(dataDirectory, fileName);
  const rawText = await readFile(filePath, "utf8");
  const [headers, ...rows] = parseCsv(stripSharePointSchema(rawText));

  if (!headers) {
    throw new Error(`Missing CSV header in ${fileName}.`);
  }

  return rows.map((cells) => recordFromCells(headers, cells));
}

async function backfillFile(
  fileName: string,
  descriptionColumn: "Comment" | "Description",
) {
  const rows = await readCsvRecords(fileName);
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const serialNo = clean(row["Serial No."]);
    const description = clean(row[descriptionColumn]);

    if (!serialNo || !description) {
      skipped += 1;
      continue;
    }

    const asset = await prisma.asset.findUnique({
      select: { assetModelId: true },
      where: { serialNo },
    });

    if (!asset) {
      skipped += 1;
      continue;
    }

    await prisma.assetModel.update({
      data: { description },
      where: { id: asset.assetModelId },
    });
    updated += 1;
  }

  return { fileName, skipped, updated };
}

async function main() {
  const summaries = [];

  for (const sourceFile of sourceFiles) {
    summaries.push(
      await backfillFile(sourceFile.fileName, sourceFile.descriptionColumn),
    );
  }

  console.info("Asset model description backfill complete.");
  console.table(summaries);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
