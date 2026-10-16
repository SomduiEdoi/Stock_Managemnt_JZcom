import { db } from "./src/lib/db";

async function main() {
  const rows = await db.asset.findMany({
    where: { note: { contains: "�" } },
    select: { stockCode: true, note: true, sourceSystem: true, sourceRecordId: true },
    orderBy: { stockCode: "asc" },
  });
  console.log(JSON.stringify(rows, null, 2));
  await (db as any)["$disconnect"]();
}

void main();
