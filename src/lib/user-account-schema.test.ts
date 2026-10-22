import { describe, expect, it } from "vitest";
import { createUserSchema, localCredentialsSchema, localPasswordSchema } from "./user-account-schema";

const base = { name: "Example", email: "example@example.com", role: "ADMIN" };
const local = { ...base, provider: "LOCAL", username: "Example.User", password: "A-long-password-123!", confirmPassword: "A-long-password-123!" };
describe("account creation validation", () => {
  it("accepts Warehouse Manager and preserves its existing authorization tag", () => {
    const parsed = createUserSchema.parse({ ...local, organizationAssignments: [{ team: "WAREHOUSE", organizationLevel: "MANAGER", organizationTag: "WAREHOUSE_MANAGER" }] });
    expect(parsed.organizationAssignments?.[0]).toEqual({ team: "WAREHOUSE", organizationLevel: "MANAGER", organizationTag: "WAREHOUSE_MANAGER" });
  });
  it("accepts a six-character password containing every required class", () => expect(localPasswordSchema.safeParse("Aa1!bc").success).toBe(true));
  it.each(["Aa1!b", "aa1!bc", "AA1!BC", "Aa!!bc", "Aa12bc", "Aa12 b", "Aa12กb"])("rejects password policy violation %s", (password) => expect(localPasswordSchema.safeParse(password).success).toBe(false));
  it("rejects a strong password over the bcrypt byte limit", () => expect(localPasswordSchema.safeParse(`Aa1!${"x".repeat(69)}`).success).toBe(false));
  it("accepts Local without email and name", () => {
    const { email, name, ...credentials } = local;
    void email; void name;
    expect(createUserSchema.safeParse(credentials).success).toBe(true);
  });
  it("still requires AD email and name", () => expect(createUserSchema.safeParse({ role: "ADMIN" }).success).toBe(false));
  it("defaults to AD without password", () => expect(createUserSchema.parse(base).provider).toBe("AD"));
  it.each(["ADMIN", "STOREMAN", "USER"])("accepts local %s", (role) => expect(createUserSchema.safeParse({ ...local, role }).success).toBe(true));
  it("normalizes local usernames", () => expect(localCredentialsSchema.parse(local).username).toBe("example.user"));
  it.each([{ password: undefined }, { password: "short", confirmPassword: "short" }, { confirmPassword: "different" }, { username: "bad name" }, { username: "" }])("rejects invalid credentials %j", (change) => expect(createUserSchema.safeParse({ ...local, ...change }).success).toBe(false));
  it("rejects bcrypt byte overflow", () => expect(createUserSchema.safeParse({ ...local, password: "ก".repeat(25), confirmPassword: "ก".repeat(25) }).success).toBe(false));
  it("does not accept credentials for AD", () => expect(createUserSchema.safeParse({ ...base, password: "ignored-password" }).success).toBe(false));
});
