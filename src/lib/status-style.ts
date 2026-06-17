import { AssetStatus, TransactionStatus } from "@prisma/client";

export const assetStatusLabels = {
  [AssetStatus.BORROW]: "Borrow",
  [AssetStatus.FAIL]: "Fail",
  [AssetStatus.LOST]: "Lost",
  [AssetStatus.NEED_CHECK]: "Need Check",
  [AssetStatus.READY]: "Ready",
  [AssetStatus.REQUEST]: "Request",
  [AssetStatus.SOLD]: "Sold",
  [AssetStatus.USING]: "Using",
} as const satisfies Record<AssetStatus, string>;

export const assetStatusHexColors = {
  [AssetStatus.BORROW]: "#06B6D4",
  [AssetStatus.FAIL]: "#DC2626",
  [AssetStatus.LOST]: "#4B5563",
  [AssetStatus.NEED_CHECK]: "#F97316",
  [AssetStatus.READY]: "#16A34A",
  [AssetStatus.REQUEST]: "#EAB308",
  [AssetStatus.SOLD]: "#7C3AED",
  [AssetStatus.USING]: "#2563EB",
} as const satisfies Record<AssetStatus, string>;

export const assetStatusBadgeClasses = {
  [AssetStatus.BORROW]: "bg-status-borrow text-white",
  [AssetStatus.FAIL]: "bg-status-fail text-white",
  [AssetStatus.LOST]: "bg-status-lost text-white",
  [AssetStatus.NEED_CHECK]: "bg-status-need-check text-white",
  [AssetStatus.READY]: "bg-status-ready text-white",
  [AssetStatus.REQUEST]: "bg-status-request text-white",
  [AssetStatus.SOLD]: "bg-status-sold text-white",
  [AssetStatus.USING]: "bg-status-using text-white",
} as const satisfies Record<AssetStatus, string>;

export const transactionStatusLabels = {
  [TransactionStatus.ACTIVE]: "Active",
  [TransactionStatus.BORROWED]: "Borrowed",
  [TransactionStatus.COMPLETED]: "Completed",
  [TransactionStatus.OVERDUE]: "Overdue",
  [TransactionStatus.RETURNED]: "Returned",
} as const satisfies Record<TransactionStatus, string>;

export const transactionStatusHexColors = {
  [TransactionStatus.ACTIVE]: "#FE7743",
  [TransactionStatus.BORROWED]: "#06B6D4",
  [TransactionStatus.COMPLETED]: "#273F4F",
  [TransactionStatus.OVERDUE]: "#DC2626",
  [TransactionStatus.RETURNED]: "#16A34A",
} as const satisfies Record<TransactionStatus, string>;

export const systemPaletteHexColors = {
  accent: "#FE7743",
  ink: "#000000",
  navy: "#273F4F",
  surface: "#EFEEEA",
} as const;
