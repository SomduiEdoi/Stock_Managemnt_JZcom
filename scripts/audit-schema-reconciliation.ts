import { createHash } from "node:crypto";
import { db } from "../src/lib/db";

async function main() {
  const snapshot = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const duplicates = await tx.$queryRaw<Array<{ prefix: string; count: bigint }>>`
      SELECT warehouse_prefix AS prefix, count(*) AS count
      FROM asset_warehouses GROUP BY warehouse_prefix HAVING count(*) > 1`;
    if (duplicates.length) throw new Error("Duplicate warehouse prefixes: unique index cannot be safely added");
    const tables = await tx.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations' ORDER BY tablename`;
    const data = [];
    for (const { tablename } of tables) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      const rows = await tx.$queryRawUnsafe<Array<{ row: string }>>(
        `SELECT row_to_json(t)::text AS row FROM public.${quoted} t ORDER BY row_to_json(t)::text`,
      );
      data.push({ table: tablename, count: rows.length, sha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex") });
    }
    const indexes = await tx.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`;
    return { data, indexes };
  }, { timeout: 60000 });
  console.log(JSON.stringify(snapshot, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
