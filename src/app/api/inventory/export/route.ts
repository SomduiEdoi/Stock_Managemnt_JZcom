import { NextRequest } from "next/server";
import { requireApiUser, apiJson } from "@/lib/api";
import { getServerInventoryForUser, normalizeServerInventoryFilters } from "@/lib/server-inventory";
import { getNetworkInventoryForUser, normalizeNetworkInventoryFilters } from "@/lib/network-inventory";
import { getWarehouseInventoryForUser, normalizeWarehouseInventoryFilters } from "@/lib/warehouse-inventory";

function toSearchParams(request: NextRequest) {
  const values: Record<string, string | string[]> = {};

  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    const current = values[key];
    values[key] = current === undefined ? value : Array.isArray(current) ? [...current, value] : [current, value];
  }

  return values;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const warehouseCode = request.nextUrl.searchParams.get("warehouse")?.trim().toUpperCase();

    if (!warehouseCode) {
      return apiJson({ message: "Warehouse is required." }, { status: 400 });
    }

    const searchParams = toSearchParams(request);
    delete searchParams.warehouse;

    if (warehouseCode === "SERVER") {
      const filters = normalizeServerInventoryFilters(searchParams);
      const result = await getServerInventoryForUser(user, { ...filters, page: 1 }, true);
      return apiJson({ rows: result.rows });
    }

    if (warehouseCode === "NETWORK") {
      const filters = normalizeNetworkInventoryFilters(searchParams);
      const result = await getNetworkInventoryForUser(user, { ...filters, page: 1 }, true);
      return apiJson({ rows: result.rows });
    }

    const filters = normalizeWarehouseInventoryFilters(searchParams);
    const result = await getWarehouseInventoryForUser(user, warehouseCode, { ...filters, page: 1 }, true);
    return apiJson({ rows: result.rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to export inventory.";
    return apiJson({ message }, { status: 500 });
  }
}

