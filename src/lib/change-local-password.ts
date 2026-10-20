import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { WorkflowError } from "@/lib/workflow";
import { localPasswordSchema } from "@/lib/user-account-schema";
import { checkLoginLimit } from "@/lib/login-security";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).refine((value) => new TextEncoder().encode(value).length <= 72, "Current password is too long."),
  newPassword: localPasswordSchema,
  confirmPassword: z.string(),
}).strict().superRefine((value, context) => {
  if (value.newPassword !== value.confirmPassword) context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match." });
  if (value.newPassword === value.currentPassword) context.addIssue({ code: z.ZodIssueCode.custom, path: ["newPassword"], message: "Choose a different password." });
});

export async function changeLocalPassword(userId: string, input: z.infer<typeof changePasswordSchema>) {
  const data = changePasswordSchema.parse(input);
  const user = await db.user.findUnique({ where: { id: userId }, select: { provider: true, isActive: true, passwordHash: true, localUsername: true } });
  if (!user?.isActive || user.provider !== "LOCAL" || !user.localUsername || !user.passwordHash) throw new WorkflowError("Only active Local accounts can change their password here.", 403, "LOCAL_ACCOUNT_REQUIRED");
  const limit = await checkLoginLimit(userId, "PASSWORD_CHANGE", null);
  if (!limit.allowed) throw new WorkflowError("Too many password change attempts. Please try again later.", 429, "RATE_LIMITED");
  if (!await compare(data.currentPassword, user.passwordHash)) throw new WorkflowError("Current password is incorrect.", 400, "INVALID_CURRENT_PASSWORD");
  const passwordHash = await hash(data.newPassword, 12);
  await db.$transaction(async (tx) => {
    // Compare-and-swap prevents an overlapping request from overwriting a newer password.
    const updated = await tx.user.updateMany({ where: { id: userId, provider: "LOCAL", isActive: true, passwordHash: user.passwordHash }, data: { passwordHash } });
    if (updated.count !== 1) throw new WorkflowError("Account changed. Refresh and try again.", 409, "ACCOUNT_CHANGED");
    await tx.loginAudit.create({ data: { userId, mode: "LOCAL", result: "PASSWORD_CHANGED" } });
    await tx.loginThrottle.deleteMany({ where: { key: limit.accountKey } });
  });
}
