import { readFile } from "node:fs/promises";
import { AssetActionType, AssetStatus, AssetTrackMethod, CustomFieldDataType } from "@prisma/client";
import { db } from "@/lib/db";

type Source = { sheet: string; rows: Array<Record<string, string>> };

const categoryMap: Record<string, string> = {
  LAN: "LA", Fiber: "FB", Rack: "RK", Accessories: "AS", "AC Power": "AC",
  Electical: "EL", Electrical: "EL", "Access Control": "AT", CCTV: "CT", Telephone: "TL",
};
const typeMap: Record<string, string> = {
  LAN: "LAN", "Patch Cord": "PCD", "Fiber Cable": "CAB", Cabinet: "CBN", Accessories: "ACC",
  Modular: "MDL", "Face plate": "FPT", Box: "BOX", APC: "APC", AC: "ACP", "VCT Cable": "VCT",
  "THW Cable": "THW", "VAF Cable": "VAF", Socket: "SCK", "Access Control": "ACT", NVR: "NVR",
  Camera: "CAM", Cable: "CAB", "Telephone Accessories": "ACC", "Fiber": "FBR",
};
const ignored = new Set(["Category", "Type", "Brand", "Model", "Description", "Part no.", "Part No.", "Q'ty", "QTY.", "Location", "Check Stock 2025", "Rem", "No.", "Group", "StockCode"]);

function text(value: unknown) {
  const result = String(value ?? "").trim();
  return !result || result === "-" ? null : result;
}

function quantity(row: Record<string, string>) {
  const raw = row["Q'ty"] ?? row["QTY."] ?? "0";
  const parsed = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

async function main() {
  const source = JSON.parse(await readFile("C:/Users/ASUS/Documents/Codex/installation-source.json", "utf8")) as Source[];
  const result = await db.$transaction(async (tx) => {
    const warehouse = await tx.assetWarehouse.findUniqueOrThrow({ where: { code: "INSTALLATION" } });
    const suriya = await tx.user.findUniqueOrThrow({ where: { email: "suriya@example.com" } });
    const counters = new Map<string, number>();
    let imported = 0;
    for (const sheet of source) {
      for (const row of sheet.rows) {
        const categoryName = text(row.Category) ?? sheet.sheet;
        const typeName = text(row.Type) ?? "Unspecified";
        const categoryCode = categoryMap[categoryName] ?? categoryName.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 2).padEnd(2, "X");
        const typeCode = typeMap[typeName] ?? typeName.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 3).padEnd(3, "X");
        const category = await tx.assetCategory.upsert({ where: { warehouseId_name: { warehouseId: warehouse.id, name: categoryName } }, update: { code: categoryCode, isActive: true }, create: { warehouseId: warehouse.id, name: categoryName, code: categoryCode } });
        const type = await tx.assetType.upsert({ where: { categoryId_name: { categoryId: category.id, name: typeName } }, update: { code: typeCode, trackMethod: AssetTrackMethod.QUANTITY, isActive: true }, create: { categoryId: category.id, name: typeName, code: typeCode, trackMethod: AssetTrackMethod.QUANTITY } });
        for (const [key, value] of Object.entries(row)) {
          if (ignored.has(key) || !text(value)) continue;
          await tx.assetCategoryCustomField.upsert({ where: { categoryId_key: { categoryId: category.id, key: key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") } }, update: { label: key.trim(), assetTypeId: type.id, isActive: true }, create: { categoryId: category.id, assetTypeId: type.id, key: key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: key.trim(), dataType: CustomFieldDataType.TEXT } });
        }
        const qty = quantity(row);
        const counterKey = `${categoryCode}-${typeCode}`;
        const next = (counters.get(counterKey) ?? 0) + 1;
        counters.set(counterKey, next);
        const stockCode = `IN-${categoryCode}-${typeCode}${String(next).padStart(4, "0")}`;
        const modelName = text(row.Model) ?? typeName;
        const model = await tx.assetModel.create({ data: { warehouseId: warehouse.id, categoryId: category.id, assetTypeId: type.id, name: modelName, brand: text(row.Brand), partNo: text(row["Part no."] ?? row["Part No."]), typeName, description: text(row.Description) } });
        const asset = await tx.asset.create({ data: { warehouseId: warehouse.id, assetModelId: model.id, assetQuantity: qty, legacyQty: qty, status: qty === 0 ? AssetStatus.NEED_CHECK : AssetStatus.READY, stockCode, serialNo: null, locationText: text(row.Location), note: text(row.Rem), sourceSystem: "Installation Excel", sourceRecordId: `${sheet.sheet}:${imported + 1}`, createdById: suriya.id, updatedById: suriya.id } });
        const fields = await tx.assetCategoryCustomField.findMany({ where: { categoryId: category.id, assetTypeId: type.id } });
        const values = fields.flatMap((field) => { const sourceKey = Object.keys(row).find((key) => key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") === field.key); const value = sourceKey ? text(row[sourceKey]) : null; return value ? [{ assetId: asset.id, fieldId: field.id, valueText: value }] : []; });
        if (values.length) await tx.assetCustomFieldValue.createMany({ data: values });
        await tx.assetStatusHistory.create({ data: { assetId: asset.id, actionType: AssetActionType.IMPORT, changedById: suriya.id, toStatus: asset.status, note: "Imported from Installation warehouse Excel." } });
        imported++;
      }
    }
    return { imported, categories: await tx.assetCategory.count({ where: { warehouseId: warehouse.id } }), types: await tx.assetType.count({ where: { category: { warehouseId: warehouse.id } } }) };
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
