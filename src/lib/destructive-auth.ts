import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { authenticateWithLdap } from "@/lib/ldap";
import { checkLoginLimit } from "@/lib/login-security";
import { WorkflowError } from "@/lib/workflow";

function sign(payload: string) {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required");
  return createHmac("sha256", process.env.AUTH_SECRET).update(`delete:${payload}`).digest("base64url");
}
export function createDeleteProof(userId: string, scope: string, now = Date.now(), id = randomUUID()) {
  const payload = Buffer.from(JSON.stringify({ userId, scope, expires: now + 60000, id })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export async function requireDeleteProof(request: Request, userId: string, scope: string) {
  try {
    const [payload, signature, extra] = (request.headers.get("x-delete-proof") ?? "").split(".");
    if (!payload || !signature || extra) throw new Error();
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error();
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (value.userId !== userId || value.scope !== scope || value.expires <= Date.now()) throw new Error();
    const consumed = await db.destructiveConfirmation.deleteMany({ where: { id: value.id, userId, scope, expiresAt: { gt: new Date() } } });
    if (consumed.count !== 1) throw new Error();
  } catch { throw new WorkflowError("Password verification is required before deletion. Please verify again.", 401, "DELETE_REAUTH_REQUIRED"); }
}
export async function verifyDeletePassword(userId: string, password: string, scope: string) {
  const limit = await checkLoginLimit(userId, "DELETE_REAUTH", null);
  if (!limit.allowed) throw new WorkflowError("Too many attempts. Please try again later.", 429);
  const user = await db.user.findUnique({ where: { id: userId }, select: { isActive: true, provider: true, passwordHash: true, ldapUsername: true, ldapUpn: true } });
  let valid = false;
  if (user?.isActive && password && Buffer.byteLength(password) <= 1024) {
    if (user.provider === "LOCAL") valid = Boolean(user.passwordHash && Buffer.byteLength(password) <= 72 && await compare(password, user.passwordHash));
    else if (user.ldapUpn) {
      const identity = await authenticateWithLdap(user.ldapUpn, password);
      valid = Boolean(identity && identity.username.toLowerCase() === user.ldapUsername?.toLowerCase() && identity.upn?.toLowerCase() === user.ldapUpn.toLowerCase());
    }
  }
  if (!valid) {
    await db.loginAudit.create({ data: { userId, mode: "DELETE_REAUTH", result: "DENIED" } });
    throw new WorkflowError("รหัสผ่านไม่ถูกต้อง ไม่สามารถลบข้อมูลได้", 401, "INVALID_DELETE_PASSWORD");
  }
  await db.loginThrottle.deleteMany({ where: { key: limit.accountKey } });
  await db.loginAudit.create({ data: { userId, mode: "DELETE_REAUTH", result: "VERIFIED" } });
  const now = Date.now();
  const id = randomUUID();
  await db.destructiveConfirmation.deleteMany({ where: { expiresAt: { lte: new Date(now) } } });
  await db.destructiveConfirmation.create({ data: { id, userId, scope, expiresAt: new Date(now + 60000) } });
  return createDeleteProof(userId, scope, now, id);
}
