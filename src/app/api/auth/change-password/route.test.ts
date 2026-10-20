import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), change: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({ ...await original<typeof import("@/lib/api")>(), requireApiUser: mocks.user }));
vi.mock("@/lib/change-local-password", async (original) => ({ ...await original<typeof import("@/lib/change-local-password")>(), changeLocalPassword: mocks.change }));
import { POST } from "./route";
import { WorkflowError } from "@/lib/workflow";
const body = { currentPassword: "old-password-12345", newPassword: "New-password-12345!", confirmPassword: "New-password-12345!" };
const request = (data: unknown = body, origin = "http://localhost") => new NextRequest("http://localhost/api/auth/change-password", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(data) });
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "session-user" }); mocks.change.mockResolvedValue(undefined); });
describe("password change API", () => {
  it("uses only the authenticated identity", async () => { expect((await POST(request())).status).toBe(200); expect(mocks.change).toHaveBeenCalledWith("session-user", body); });
  it("requires authentication", async () => { mocks.user.mockRejectedValue(new WorkflowError("Unauthorized", 401)); expect((await POST(request())).status).toBe(401); expect(mocks.change).not.toHaveBeenCalled(); });
  it("rejects cross-origin requests", async () => { expect((await POST(request(body, "https://other.example"))).status).toBe(403); expect(mocks.change).not.toHaveBeenCalled(); });
  it("rejects a target account supplied in the payload", async () => { expect((await POST(request({ ...body, userId: "victim" }))).status).toBe(400); expect(mocks.change).not.toHaveBeenCalled(); });
});
