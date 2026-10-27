"use client";

import Link from "next/link";
import React, { type ReactNode } from "react";

export function DashboardAssetLink({ assetId, isActive, children }: {
  assetId: string;
  isActive: boolean;
  children?: ReactNode;
}) {
  const className = "cursor-pointer text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy";
  if (!isActive) {
    return <button type="button" className={className} onClick={() => window.alert("This asset has been deleted.")}>{children}</button>;
  }
  return <Link className={className} href={`/dashboard/assets/${encodeURIComponent(assetId)}`}>{children}</Link>;
}
