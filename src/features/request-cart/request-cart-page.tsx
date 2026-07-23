import { ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import type { RequestCartAsset } from "@/lib/request-cart";
import { RequestCartClient, type RequestCartAssetClient } from "./request-cart-client";

type RequestCartPageProps = {
  assets: RequestCartAsset[];
  user: CurrentUser;
};

function toClientAsset(asset: RequestCartAsset): RequestCartAssetClient {
  return {
    ...asset,
    requestLockedAt: asset.requestLockedAt?.toISOString() ?? null,
  };
}

export async function RequestCartPage({ assets, user }: RequestCartPageProps) {
  void user;
  const projects = await db.project.findMany({
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, projectId: true },
    where: { status: "ACTIVE" },
  });

  return (
    <RequestCartClient
      initialAssets={assets.map(toClientAsset)}
      projects={projects}
    />
  );
}

export function RequestCartForbidden() {
  return (
    <section className="rounded-md border border-border bg-white p-8 text-center shadow-sm">
      <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
      <h2 className="mt-4 text-xl font-bold text-navy">No request access</h2>
      <p className="mt-2 text-sm font-medium text-muted-foreground">
        Your account cannot create asset requests.
      </p>
    </section>
  );
}
