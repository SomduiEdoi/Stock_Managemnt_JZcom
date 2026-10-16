import { AssetStatus, PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";

const db = new PrismaClient();
const stockCodePattern = /^[A-Z0-9]{2}-[A-Z0-9]{2}-[A-Z0-9]{3}[0-9]{4}$/;

function cell(value: string | number | null | undefined) {
  return String(value ?? "-").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function table(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
}

async function main() {
  const warehouses = await db.assetWarehouse.findMany({ orderBy: { code: "asc" } });
  const assets = await db.asset.findMany({
    where: { isActive: true },
    orderBy: [{ warehouse: { code: "asc" } }, { stockCode: "asc" }, { serialNo: "asc" }],
    select: {
      id: true,
      assetQuantity: true,
      serialNo: true,
      stockCode: true,
      status: true,
      warehouse: { select: { code: true, name: true, prefix: true } },
      assetModel: {
        select: {
          name: true,
          category: { select: { name: true, code: true } },
          assetType: { select: { name: true, code: true } },
        },
      },
    },
  });

  const stockGroups = new Map<string, typeof assets>();
  const serialGroups = new Map<string, typeof assets>();
  for (const asset of assets) {
    if (asset.stockCode?.trim()) stockGroups.set(asset.stockCode, [...(stockGroups.get(asset.stockCode) ?? []), asset]);
    if (asset.serialNo?.trim() && asset.serialNo !== "-") serialGroups.set(asset.serialNo, [...(serialGroups.get(asset.serialNo) ?? []), asset]);
  }
  const duplicateStocks = [...stockGroups.entries()].filter(([, rows]) => rows.length > 1);
  const duplicateSerials = [...serialGroups.entries()].filter(([, rows]) => rows.length > 1);
  const missingStock = assets.filter((asset) => !asset.stockCode?.trim());
  const missingTaxonomy = assets.filter((asset) => !asset.assetModel.category || !asset.assetModel.assetType);
  const zeroQuantity = assets.filter((asset) => asset.assetQuantity === 0);
  const zeroQuantityWrongStatus = zeroQuantity.filter((asset) => asset.status !== AssetStatus.NEED_CHECK);
  const invalidStock = assets.filter((asset) => !asset.stockCode?.trim() || !stockCodePattern.test(asset.stockCode));

  const byWarehouse = warehouses.map((warehouse) => {
    const rows = assets.filter((asset) => asset.warehouse.code === warehouse.code);
    return [warehouse.code, warehouse.name, rows.length];
  });
  const byCategoryType = new Map<string, number>();
  for (const asset of assets) {
    const key = `${asset.warehouse.code}|${asset.assetModel.category?.name ?? "MISSING"}|${asset.assetModel.assetType?.name ?? "MISSING"}`;
    byCategoryType.set(key, (byCategoryType.get(key) ?? 0) + 1);
  }
  const categoryTypeRows = [...byCategoryType.entries()].sort().map(([key, count]) => [...key.split("|"), count]);
  const issueRows = (rows: typeof assets) => rows.map((asset) => [
    asset.warehouse.code,
    asset.stockCode,
    asset.serialNo,
    asset.assetModel.name,
    asset.assetModel.category?.name,
    asset.assetModel.assetType?.name,
    asset.assetQuantity,
    asset.status,
  ]);
  const duplicateRows = (groups: Array<[string, typeof assets]>) => groups.flatMap(([value, rows]) => rows.map((asset) => [value, asset.warehouse.code, asset.stockCode, asset.serialNo, asset.assetModel.name]));

  const report = `# Import Verification Report

Generated: ${new Date().toISOString()}

## Scope and Rules

- Source: current PostgreSQL data only.
- Scope: all active warehouses and active assets.
- Serial numbers must be unique across all warehouses.
- Expected stock code format: \`XX-YY-ZZZ0000\`.
- Quantity rows with quantity \`0\` are reported individually. They should normally be \`NEED_CHECK\`.
- This report is read-only; it does not modify database records.

## Summary

${table(["Metric", "Count"], [
  ["Warehouses", warehouses.length],
  ["Active assets", assets.length],
  ["Duplicate stock code groups", duplicateStocks.length],
  ["Duplicate serial number groups", duplicateSerials.length],
  ["Missing stock code", missingStock.length],
  ["Missing category/type", missingTaxonomy.length],
  ["Quantity = 0", zeroQuantity.length],
  ["Quantity = 0 but status is not NEED_CHECK", zeroQuantityWrongStatus.length],
  ["Invalid or missing stock code format", invalidStock.length],
])}

## Rows per Warehouse

${table(["Warehouse Code", "Warehouse", "Active Assets"], byWarehouse)}

## Rows per Warehouse / Category / Type

${table(["Warehouse", "Category", "Type", "Rows"], categoryTypeRows)}

## Duplicate Stock Code

${duplicateStocks.length ? table(["Stock Code", "Warehouse", "Stock Code", "Serial No.", "Model"], duplicateRows(duplicateStocks)) : "No duplicate stock codes found."}

## Duplicate Serial Number Across All Warehouses

${duplicateSerials.length ? table(["Serial No.", "Warehouse", "Stock Code", "Serial No.", "Model"], duplicateRows(duplicateSerials)) : "No duplicate serial numbers found."}

## Missing Stock Code

${missingStock.length ? table(["Warehouse", "Stock Code", "Serial No.", "Model", "Category", "Type", "Quantity", "Status"], issueRows(missingStock)) : "No missing stock codes found."}

## Missing Category or Type

${missingTaxonomy.length ? table(["Warehouse", "Stock Code", "Serial No.", "Model", "Category", "Type", "Quantity", "Status"], issueRows(missingTaxonomy)) : "No missing category/type rows found."}

## Quantity = 0

${zeroQuantity.length ? table(["Warehouse", "Stock Code", "Serial No.", "Model", "Category", "Type", "Quantity", "Status"], issueRows(zeroQuantity)) : "No quantity-zero rows found."}

## Quantity = 0 With Wrong Status

${zeroQuantityWrongStatus.length ? table(["Warehouse", "Stock Code", "Serial No.", "Model", "Category", "Type", "Quantity", "Status"], issueRows(zeroQuantityWrongStatus)) : "All quantity-zero rows are NEED_CHECK."}

## Invalid or Missing Stock Code Format

${invalidStock.length ? table(["Warehouse", "Stock Code", "Serial No.", "Model", "Category", "Type", "Quantity", "Status"], issueRows(invalidStock)) : "All active assets have a stock code matching XX-YY-ZZZ0000."}
`;

  await mkdir("docs", { recursive: true });
  await writeFile("docs/import-verification-report.md", report, "utf8");
  console.log(JSON.stringify({ report: "docs/import-verification-report.md", warehouses: warehouses.length, assets: assets.length, duplicateStocks: duplicateStocks.length, duplicateSerials: duplicateSerials.length, missingStock: missingStock.length, missingTaxonomy: missingTaxonomy.length, zeroQuantity: zeroQuantity.length, invalidStock: invalidStock.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => db.$disconnect());
