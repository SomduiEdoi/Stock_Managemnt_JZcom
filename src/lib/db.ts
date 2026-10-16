import { PrismaClient } from "@prisma/client";

const globalForPrisma: typeof globalThis & {
  prisma?: PrismaClient;
} = globalThis;

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

