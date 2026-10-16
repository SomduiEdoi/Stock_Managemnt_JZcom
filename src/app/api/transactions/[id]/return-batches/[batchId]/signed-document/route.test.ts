import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ session: vi.fn(), document: vi.fn(), upload: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getUserFromSessionToken: mocks.session }));
vi.mock("@/lib/permissions", () => ({ PermissionError: class extends Error {} }));
vi.mock("@/lib/workflow", () => ({
  WorkflowError: class extends Error {
    constructor(message: string, public statusCode: number, public code: string) { super(message); }
  },
}));
vi.mock("@/lib/return-batch-service", () => ({
  getSignedReturnDocument: mocks.document,
  uploadSignedReturnDocument: mocks.upload,
}));

import { GET } from "./route";

const id = "1d13ef0a-5208-465c-acab-44a1b8319511";
const batchId = "3ba5d7c0-935f-41ba-af6d-259cbdb8c9f0";
const call = () => GET(new NextRequest(`http://localhost/api/transactions/${id}/return-batches/${batchId}/signed-document`), { params: Promise.resolve({ id, batchId }) });

describe("uploaded return PDF viewing", () => {
  beforeEach(() => vi.resetAllMocks());

  it("allows a logged-in user without roles or warehouse permissions to view the PDF", async () => {
    mocks.session.mockResolvedValue({ id: "unrelated-user", roles: [], permissions: [], organizationAssignments: [] });
    const pdf = Buffer.from("%PDF-uploaded-fixture");
    mocks.document.mockResolvedValue({ pdf, filename: "signed.pdf" });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("inline;");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(pdf);
    expect(mocks.document).toHaveBeenCalledWith(id, batchId);
  });

  it("requires login before reading the PDF", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.document).not.toHaveBeenCalled();
  });
});
