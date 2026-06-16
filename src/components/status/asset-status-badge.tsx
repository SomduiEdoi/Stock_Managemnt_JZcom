import type { AssetStatus } from "@prisma/client";
import { clsx } from "clsx";
import {
  assetStatusHexColors,
  assetStatusLabels,
} from "@/lib/status-style";

type AssetStatusBadgeProps = {
  className?: string;
  status: AssetStatus;
};

export function AssetStatusBadge({ className, status }: AssetStatusBadgeProps) {
  return (
    <span
      style={{ backgroundColor: assetStatusHexColors[status], color: "#fff" }}
      className={clsx(
        "inline-flex min-w-[96px] items-center justify-center whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold shadow-sm",
        className,
      )}
    >
      {assetStatusLabels[status]}
    </span>
  );
}
