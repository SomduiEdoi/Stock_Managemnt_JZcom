import type { TransactionStatus } from "@prisma/client";
import { clsx } from "clsx";
import {
  transactionStatusHexColors,
  transactionStatusLabels,
} from "@/lib/status-style";

type TransactionStatusBadgeProps = {
  className?: string;
  status: TransactionStatus;
};

export function TransactionStatusBadge({
  className,
  status,
}: TransactionStatusBadgeProps) {
  return (
    <span
      style={{ backgroundColor: transactionStatusHexColors[status], color: "#fff" }}
      className={clsx(
        "inline-flex min-w-[104px] items-center justify-center whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold shadow-sm",
        className,
      )}
    >
      {transactionStatusLabels[status]}
    </span>
  );
}
