import { randomUUID } from "node:crypto";
import { createDeleteProof } from "./destructive-auth";
import { Prisma, PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "@/lib/auth";

const context = vi.hoisted(() => ({
  tx: null as Prisma.TransactionClient | null,
  user: null as CurrentUser | null,
}));
vi.mock("@/lib/db", () => ({
  db: new Proxy(
    {},
    {
      get(_target, property) {
        if (!context.tx)
          throw new Error("Database access outside rollback transaction");
        if (property === "$transaction")
          return (callback: (tx: Prisma.TransactionClient) => unknown) =>
            callback(context.tx!);
        return Reflect.get(context.tx, property);
      },
    },
  ),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  requireApiUser: async () => context.user!,
}));

import { PUT } from "@/app/api/warehouses/[code]/categories/route";
import {
  PATCH as editAsset,
  DELETE as deleteAsset,
} from "@/app/api/assets/[id]/route";
import { POST as createAsset } from "@/app/api/assets/route";
import { PATCH as recommendAsset } from "@/app/api/assets/[id]/recommendation/route";
import { PATCH as changeStatus } from "@/app/api/assets/[id]/status/route";

const enabled = process.env.RUN_POSTGRES_SCOPE_TESTS === "1";
const client = enabled ? new PrismaClient() : null;
const rollback = new Error("EXPECTED_SCOPE_TEST_ROLLBACK");
afterAll(async () => {
  await client?.$disconnect();
});
const request = async (url: string, body: unknown, method = "PATCH") => {
  const result = new NextRequest(`http://localhost${url}`, {
    method, headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (method === "DELETE" || (method === "PUT" && JSON.stringify(body).includes('"delete":true'))) {
    const id = randomUUID();
    const scope = url.replace(/^\/api/, "");
    const userId = context.user!.id;
    const now = Date.now();
    await context.tx!.destructiveConfirmation.create({ data: { id, userId, scope, expiresAt: new Date(now + 60000) } });
    result.headers.set("x-delete-proof", createDeleteProof(userId, scope, now, id));
  }
  return result;
};

async function fixture(tx: Prisma.TransactionClient) {
  const marker = `QA-SCOPE-${randomUUID().slice(0, 16)}`.toUpperCase();
  const actor = await tx.user.create({ data: { name: marker } });
  const a = await tx.assetWarehouse.create({
    data: { code: `${marker}-A`, prefix: `${marker}-A`, name: marker },
  });
  const b = await tx.assetWarehouse.create({
    data: { code: `${marker}-B`, prefix: `${marker}-B`, name: marker },
  });
  const ca = await tx.assetCategory.create({
    data: { warehouseId: a.id, name: "Category A", code: "CA" },
  });
  const cb = await tx.assetCategory.create({
    data: { warehouseId: b.id, name: "Category B", code: "CB" },
  });
  const cb2 = await tx.assetCategory.create({
    data: { warehouseId: b.id, name: "Other Category B", code: "CC" },
  });
  const ta = await tx.assetType.create({
    data: { categoryId: ca.id, name: "Type A", code: "TAA" },
  });
  const tb = await tx.assetType.create({
    data: { categoryId: cb.id, name: "Type B", code: "TBB" },
  });
  const fa = await tx.assetCategoryCustomField.create({
    data: { categoryId: ca.id, key: "field_a", label: "Field A" },
  });
  const fb = await tx.assetCategoryCustomField.create({
    data: { categoryId: cb.id, key: "field_b", label: "Field B" },
  });
  const model = await tx.assetModel.create({
    data: {
      warehouseId: a.id,
      categoryId: ca.id,
      assetTypeId: ta.id,
      name: "Test Model",
      isSerialized: false,
    },
  });
  const asset = await tx.asset.create({
    data: {
      warehouseId: a.id,
      assetModelId: model.id,
      assetQuantity: 3,
      status: "READY",
    },
  });
  context.user = {
    ...actor,
    roles: ["ADMIN"],
    permissions: [],
    organizationAssignments: [],
  } as unknown as CurrentUser;
  return { a, b, ca, cb, cb2, ta, tb, fa, fb, asset };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function run(
  test: (tx: Prisma.TransactionClient, f: Fixture) => Promise<void>,
) {
  try {
    await client!.$transaction(
      async (tx) => {
        context.tx = tx;
        await test(tx, await fixture(tx));
        throw rollback;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
      },
    );
    throw new Error("Expected rollback");
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    context.tx = null;
    context.user = null;
  }
}
async function snapshot(tx: Prisma.TransactionClient, f: Fixture) {
  const warehouseIds = [f.a.id, f.b.id];
  return {
    warehouses: await tx.assetWarehouse.findMany({
      where: { id: { in: warehouseIds } },
      orderBy: { id: "asc" },
    }),
    categories: await tx.assetCategory.findMany({
      where: { warehouseId: { in: warehouseIds } },
      orderBy: { id: "asc" },
    }),
    types: await tx.assetType.findMany({
      where: { category: { warehouseId: { in: warehouseIds } } },
      orderBy: { id: "asc" },
    }),
    fields: await tx.assetCategoryCustomField.findMany({
      where: { category: { warehouseId: { in: warehouseIds } } },
      orderBy: { id: "asc" },
    }),
    models: await tx.assetModel.findMany({
      where: { warehouseId: { in: warehouseIds } },
      orderBy: { id: "asc" },
    }),
    assets: await tx.asset.findMany({
      where: { warehouseId: { in: warehouseIds } },
      orderBy: { id: "asc" },
    }),
    histories: await tx.assetStatusHistory.findMany({
      where: { assetId: f.asset.id },
    }),
  };
}

describe.skipIf(!enabled)(
  "API warehouse ownership on PostgreSQL (mandatory rollback)",
  () => {
    for (const operation of ["update", "delete"] as const) {
      for (const entity of ["category", "type", "field"] as const) {
        it(`returns 404 for cross-warehouse ${entity} ${operation}, with no writes`, async () =>
          run(async (tx, f) => {
            const before = await snapshot(tx, f);
            const foreign =
              entity === "category"
                ? {
                    id: f.ca.id,
                    name: f.ca.name,
                    code: f.ca.code,
                    delete: operation === "delete",
                  }
                : {
                    id: f.cb.id,
                    name: f.cb.name,
                    code: f.cb.code,
                    types:
                      entity === "type"
                        ? [
                            {
                              id: f.ta.id,
                              name: f.ta.name,
                              code: f.ta.code,
                              delete: operation === "delete",
                            },
                          ]
                        : [],
                    customFields:
                      entity === "field"
                        ? [
                            {
                              id: f.fa.id,
                              label: f.fa.label,
                              delete: operation === "delete",
                            },
                          ]
                        : [],
                  };
            const url = `/api/warehouses/${f.b.code}/categories`;
            const response = await PUT(
              await request(
                url,
                {
                  categories: [
                    { id: f.cb2.id, name: "Must not change", code: f.cb2.code },
                    foreign,
                  ],
                },
                "PUT",
              ),
              { params: Promise.resolve({ code: f.b.code }) },
            );
            expect(response.status).toBe(404);
            expect(await snapshot(tx, f)).toEqual(before);
          }));
      }
    }
    for (const entity of ["type", "field", "fieldType"] as const) {
      it(`rejects ${entity} under the wrong parent category in the same warehouse`, async () =>
        run(async (tx, f) => {
          const before = await snapshot(tx, f);
          const url = `/api/warehouses/${f.b.code}/categories`;
          const response = await PUT(
            await request(
              url,
              {
                categories: [
                  {
                    id: f.cb2.id,
                    code: f.cb2.code,
                    name: f.cb2.name,
                    types:
                      entity === "type"
                        ? [{ id: f.tb.id, name: f.tb.name, code: f.tb.code }]
                        : [],
                    customFields:
                      entity === "field"
                        ? [{ id: f.fb.id, label: "Other" }]
                        : entity === "fieldType"
                          ? [{ label: "New", assetTypeId: f.tb.id }]
                          : [],
                  },
                ],
              },
              "PUT",
            ),
            { params: Promise.resolve({ code: f.b.code }) },
          );
          expect(response.status).toBe(404);
          expect(await snapshot(tx, f)).toEqual(before);
        }));
    }
    it("rejects foreign type IDs on newly inserted custom fields", async () =>
      run(async (tx, f) => {
        const before = await snapshot(tx, f);
        const url = `/api/warehouses/${f.b.code}/categories`;
        const response = await PUT(
          await request(
            url,
            {
              categories: [
                {
                  id: f.cb.id,
                  code: f.cb.code,
                  name: f.cb.name,
                  customFields: [{ label: "Injected", assetTypeId: f.ta.id }],
                },
              ],
            },
            "PUT",
          ),
          { params: Promise.resolve({ code: f.b.code }) },
        );
        expect(response.status).toBe(404);
        expect(await snapshot(tx, f)).toEqual(before);
      }));
    it("allows correctly scoped category/type/field edits", async () =>
      run(async (tx, f) => {
        const url = `/api/warehouses/${f.b.code}/categories`;
        const response = await PUT(
          await request(
            url,
            {
              categories: [
                {
                  id: f.cb.id,
                  name: "Renamed",
                  code: f.cb.code,
                  types: [
                    { id: f.tb.id, name: "Renamed type", code: f.tb.code },
                  ],
                  customFields: [
                    {
                      id: f.fb.id,
                      key: "field_b",
                      label: "Renamed field",
                      assetTypeId: f.tb.id,
                    },
                  ],
                },
              ],
            },
            "PUT",
          ),
          { params: Promise.resolve({ code: f.b.code }) },
        );
        expect(response.status).toBe(200);
        expect(
          (await tx.assetCategory.findUniqueOrThrow({ where: { id: f.cb.id } }))
            .name,
        ).toBe("Renamed");
      }));
    const assetBody = (warehouseCode: string) => ({
      warehouseCode,
      modelName: "Test Model",
      brand: "Test Brand",
      categoryName: "Category A",
      typeName: "Type A",
      locationText: "Shelf A",
    locationName: "Shelf A",
      quantity: 3,
      status: "READY",
    });
    it("forbids warehouse reassignment even for an admin", async () =>
      run(async (tx, f) => {
        const before = await snapshot(tx, f);
        const url = `/api/assets/${f.asset.id}`;
        expect(
          (
            await editAsset(await request(url, assetBody(f.b.code)), {
              params: Promise.resolve({ id: f.asset.id }),
            })
          ).status,
        ).toBe(403);
        expect(await snapshot(tx, f)).toEqual(before);
      }));
    for (const operation of [
      "edit",
      "delete",
      "status",
      "recommendation",
      "create",
    ] as const) {
      it(`forbids ${operation} outside the user's warehouse scope`, async () =>
        run(async (tx, f) => {
          context.user!.roles = ["STOREMAN"];
          context.user!.permissions = [
            { warehouseCode: f.b.code, canManage: true, canView: true },
          ];
          const before = await snapshot(tx, f);
          const url = `/api/assets/${f.asset.id}`;
          const params = { params: Promise.resolve({ id: f.asset.id }) };
          const response =
            operation === "edit"
              ? await editAsset(await request(url, assetBody(f.a.code)), params)
              : operation === "delete"
                ? await deleteAsset(await request(url, {}, "DELETE"), params)
                : operation === "status"
                  ? await changeStatus(
                      await request(`${url}/status`, {
                        status: "FAIL",
                        note: "Test",
                      }),
                      params,
                    )
                  : operation === "recommendation"
                    ? await recommendAsset(
                        await request(`${url}/recommendation`, { recommended: true }),
                        params,
                      )
                    : await createAsset(
                        await request("/api/assets", assetBody(f.a.code), "POST"),
                      );
          expect(response.status).toBe(403);
          expect(await snapshot(tx, f)).toEqual(before);
        }));
    }
  },
);
