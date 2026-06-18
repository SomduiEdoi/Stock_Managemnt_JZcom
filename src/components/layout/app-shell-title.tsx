"use client";

import { usePathname, useSearchParams } from "next/navigation";

type AppShellTitleProps = {
  title?: string;
};

type SearchParamReader = {
  get: (name: string) => string | null;
};

function resolveAssetTitle(searchParams: SearchParamReader) {
  const domain = searchParams.get("domain");

  if (domain === "SERVER") {
    return "Server Inventory";
  }

  if (domain === "NETWORK") {
    return "Network Inventory";
  }

  return "Asset Inventory";
}

function resolveTitle(pathname: string, searchParams: SearchParamReader) {
  if (pathname === "/dashboard") {
    return "Dashboard Overview";
  }

  if (pathname === "/dashboard/server") {
    return "Server Inventory";
  }

  if (pathname === "/dashboard/network") {
    return "Network Inventory";
  }

  if (pathname === "/dashboard/assets") {
    return resolveAssetTitle(searchParams);
  }

  if (pathname === "/dashboard/assets/new") {
    return "Add Asset";
  }

  if (pathname.endsWith("/edit") && pathname.startsWith("/dashboard/assets/")) {
    return "Edit Asset";
  }

  if (pathname.startsWith("/dashboard/assets/")) {
    return "Asset Detail";
  }

  if (pathname === "/logs") {
    return "Transaction Log";
  }

  if (pathname === "/request") {
    return "Request";
  }

  if (pathname === "/dashboard/settings") {
    return "Settings";
  }

  if (pathname === "/user") {
    return "User Management";
  }

  return "Stock Management";
}

export function AppShellTitle({ title }: AppShellTitleProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <p className="text-xl font-bold text-navy">
      {title ?? resolveTitle(pathname, searchParams)}
    </p>
  );
}
