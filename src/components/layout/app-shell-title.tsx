"use client";

import { usePathname } from "next/navigation";

type AppShellTitleProps = {
  title?: string;
};

function resolveAssetTitle() {
  return "Problem Items";
}

function resolveTitle(pathname: string) {
  if (pathname === "/dashboard") {
    return "Dashboard Overview";
  }

  if (pathname === "/dashboard/server") {
    return "Server Warehouses";
  }

  if (pathname === "/dashboard/network") {
    return "Network Warehouses";
  }

  if (pathname.startsWith("/dashboard/inventory/")) {
    return "Warehouses";
  }

  if (pathname === "/dashboard/assets") {
    return resolveAssetTitle();
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

  if (pathname === "/project") {
    return "Project Management";
  }

  return "Warehouse Management";
}

export function AppShellTitle({ title }: AppShellTitleProps) {
  const pathname = usePathname();

  return (
    <p className="text-xl font-bold text-navy">
      {title ?? resolveTitle(pathname)}
    </p>
  );
}

