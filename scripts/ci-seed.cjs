const { PrismaClient } = require("@prisma/client");

async function main() {
  if (process.env.CI !== "true") {
    throw new Error("CI reference seed is only permitted in CI=true environments.");
  }
  const url = new URL(process.env.DATABASE_URL);
  if (url.pathname !== "/stock_ci") {
    throw new Error("CI reference seed requires the disposable stock_ci database.");
  }
  const db = new PrismaClient();
  try {
    // Integration fixtures depend on roles, not demo accounts or imported data.
    for (const code of ["ADMIN", "STOREMAN", "USER"]) {
      await db.role.upsert({ where: { code }, create: { code, name: code }, update: {} });
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
