/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS setup script. */
const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");
require("@next/env").loadEnvConfig(process.cwd());
const db = new PrismaClient();

async function main() {
  const role = await db.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  const createOnly = process.argv.includes("--create-only");
  let passwordHash;
  if (!createOnly) {
    if (process.stdin.isTTY) throw new Error("Use the secure PowerShell password setup script.");
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (Buffer.byteLength(input) > 4096) throw new Error("Input too large.");
    }
    const { password } = JSON.parse(input);
    if (typeof password !== "string" || password.length < 6 || Buffer.byteLength(password, "utf8") > 72 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^\p{L}\p{N}\s]/u.test(password)) throw new Error("Password must have at least 6 characters, lowercase, uppercase, a number and a special character; maximum 72 UTF-8 bytes.");
    passwordHash = await hash(password, 12);
    input = "";
  }
  await db.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { localUsername: "admin" },
      create: { provider: "LOCAL", name: "admin", localUsername: "admin", email: null, passwordHash: passwordHash ?? null, roles: { create: { roleId: role.id } } },
      update: passwordHash ? { provider: "LOCAL", passwordHash, isActive: true } : { provider: "LOCAL" },
    });
    await tx.loginAudit.create({ data: { userId: user.id, mode: "LOCAL", result: createOnly ? "ACCOUNT_PREPARED" : "PASSWORD_SET" } });
  });
  console.log(createOnly ? "Local admin prepared. Login remains unavailable until you set a password." : "Local admin password set. Select Local Admin on the login page.");
}
main().catch(() => { console.error("Local admin setup failed. Check database connectivity and password requirements."); process.exitCode = 1; }).finally(() => db.$disconnect());
