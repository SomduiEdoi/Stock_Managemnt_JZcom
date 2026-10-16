import { createHash } from "node:crypto";
import { db } from "@/lib/db";

const windowMs = 15 * 60 * 1000;

export async function checkLoginLimit(identifier: string, mode: string, network: string | null) {
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const accountKey = `account:${hash(`${mode}:${identifier.trim().toLowerCase()}`)}`;
  const buckets = [{ key: accountKey, limit: 5 }, { key: network ? `network:${hash(network)}` : "global", limit: network ? 30 : 300 }];
  for (const bucket of buckets) {
    const rows = await db.$queryRaw<Array<{ attempts: number; reset_at: Date }>>`
      INSERT INTO login_throttles (key, attempts, reset_at)
      VALUES (${bucket.key}, 1, NOW() + INTERVAL '15 minutes')
      ON CONFLICT (key) DO UPDATE SET
        attempts = CASE WHEN login_throttles.reset_at <= NOW() THEN 1 ELSE login_throttles.attempts + 1 END,
        reset_at = CASE WHEN login_throttles.reset_at <= NOW() THEN NOW() + INTERVAL '15 minutes' ELSE login_throttles.reset_at END
      RETURNING attempts, reset_at`;
    if (rows[0].attempts > bucket.limit) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((rows[0].reset_at.getTime() - Date.now()) / 1000)), accountKey };
    }
  }
  // Expired buckets are disposable; audit records are retained separately.
  await db.loginThrottle.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - windowMs) } } });
  return { allowed: true, retryAfter: 0, accountKey };
}
