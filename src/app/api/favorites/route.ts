import { NextRequest } from "next/server";
import { z } from "zod";
import { apiErrorResponse, readJsonBody, requireApiUser, apiJson } from "@/lib/api";
import { db } from "@/lib/db";

const toggleSchema = z.object({ assetId: z.string().uuid() });

export async function GET(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const warehouse = request.nextUrl.searchParams.get("warehouse")?.trim();
    const favorites = await db.userFavorite.findMany({
      where: {
        userId: user.id,
        asset: {
          isActive: true,
          ...(warehouse ? { warehouse: { code: warehouse } } : {}),
        },
      },
      select: { assetId: true },
    });
    return apiJson({ assetIds: favorites.map((favorite) => favorite.assetId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireApiUser(request);
    const { assetId } = toggleSchema.parse(await readJsonBody(request));
    const asset = await db.asset.findFirst({ where: { id: assetId, isActive: true }, select: { id: true } });
    if (!asset) return apiJson({ message: "Asset not found." }, { status: 404 });

    const existing = await db.userFavorite.findUnique({ where: { userId_assetId: { userId: user.id, assetId } } });
    if (existing) {
      await db.userFavorite.delete({ where: { id: existing.id } });
      return apiJson({ assetId, favorite: false });
    }

    await db.userFavorite.create({ data: { userId: user.id, assetId } });
    return apiJson({ assetId, favorite: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

