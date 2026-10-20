import { OrganizationLevel, OrganizationTag } from "@prisma/client";
import { z } from "zod";
import { organizationTagForTeam } from "@/lib/organization-team-options";

export const organizationAssignmentSchema = z.object({
  organizationLevel: z.nativeEnum(OrganizationLevel),
  organizationTag: z.nativeEnum(OrganizationTag),
  team: z.enum(["SYSTEM", "NETWORK", "CLOUD", "CMS", "SD", "PRT", "DL", "BSD", "SERVICE", "SOLUTION", "WAREHOUSE"]).nullable().optional(),
}).transform((value) => ({ ...value, organizationTag: value.team ? organizationTagForTeam(value.team, value.organizationLevel) as OrganizationTag : value.organizationTag }));

export const localPasswordSchema = z.string()
  .min(6, "Password must contain at least 6 characters.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.")
  .regex(/[^\p{L}\p{N}\s]/u, "Password must include a special character.")
  .refine((value) => new TextEncoder().encode(value).length <= 72, "Password must not exceed 72 UTF-8 bytes.");
export const localUsernameSchema = z.string().trim().toLowerCase().min(3).max(64).regex(/^[a-z0-9][a-z0-9._-]*$/, "Use letters, numbers, dots, underscores or hyphens.");

export const localCredentialsSchema = z.object({
  username: localUsernameSchema,
  password: localPasswordSchema,
  confirmPassword: z.string(),
}).superRefine((value, context) => {
  if (value.password !== value.confirmPassword) context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match." });
});

export const createUserSchema = z.object({
  provider: z.enum(["AD", "LOCAL"]).default("AD"),
  email: z.union([z.string().trim().toLowerCase().email(), z.literal("")]).default(""),
  name: z.string().trim().default(""),
  organizationLevel: z.nativeEnum(OrganizationLevel).nullable().optional(),
  organizationAssignments: z.array(organizationAssignmentSchema).optional(),
  primaryOrganizationKey: z.string().nullable().optional(),
  primaryOrganizationTag: z.nativeEnum(OrganizationTag).nullable().optional(),
  organizationTag: z.nativeEnum(OrganizationTag).nullable().optional(),
  role: z.enum(["ADMIN", "STOREMAN", "USER"]),
  username: z.string().optional(),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
}).superRefine((value, context) => {
  if (value.provider === "AD") {
    if (!value.email) context.addIssue({ code: z.ZodIssueCode.custom, path: ["email"], message: "Email is required." });
    if (!value.name) context.addIssue({ code: z.ZodIssueCode.custom, path: ["name"], message: "Name is required." });
  }
  if (value.provider === "LOCAL") {
    const result = localCredentialsSchema.safeParse(value);
    if (!result.success) for (const issue of result.error.issues) context.addIssue(issue);
  } else if (value.password !== undefined || value.confirmPassword !== undefined || value.username !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "AD accounts must not include local credentials." });
  }
});

export type CreateManagedUserInput = z.infer<typeof createUserSchema>;
