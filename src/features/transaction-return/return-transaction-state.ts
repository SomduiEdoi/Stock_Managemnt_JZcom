import {
  AssetStatus,
  type TransactionType,
  type TransactionWorkflowStatus,
} from "@prisma/client";
import { availableReturnQuantity } from "./return-quantity";
import { type SalePriceGroup } from "@/lib/sale-price-groups";

export type TransactionReturnItem = {
  assetId: string;
  brand: string | null;
  category: string | null;
  partNo: string | null;
  hasPendingOutcome: boolean;
  pendingBatchIds: (string | null)[];
  isDispatched: boolean;
  canConfirmSerial?: boolean;
  currentStep: string;
  currentStatus: AssetStatus;
  isQuantityAsset: boolean;
  itemId: string;
  kindLabel: string;
  model: string;
  note: string | null;
  requestedQuantity: number;
  availableQuantity: number;
  resolvedAt: string | null;
  resolvedQuantity: number;
  resolvedStatus: AssetStatus | null;
  resolutionNote: string | null;
  soldPrice: string | null;
  serialNo: string | null;
  soldTotal?: string | null;
  salePriceGroups?: SalePriceGroup[];
  stockCode: string | null;
  typeName: string | null;
  warehouseName: string;
};

export type TransactionOutcomeSummary = {
  id: string;
  itemId: string;
  model: string;
  resolutionBatchId: string | null;
  partNo: string | null;
  stockCode: string | null;
  typeName: string | null;
  warehouseName: string;
  serialNo: string | null;
  outcomeStatus: AssetStatus;
  quantity: number;
  returnCondition: "NEW" | "USED" | null;
  returnStockAssetId: string | null;
  returnStockOptions: Array<{
    id: string;
    stockCode: string;
  }>;
  note: string | null;
  soldPrice: string | null;
  approvedAt: string | null;
  soldTotal?: string | null;
  canChooseCondition: boolean;
  canDelete: boolean;
};

export type EditableRequestItem = {
  assetId: string;
  isQuantityAsset: boolean;
  model: string;
  quantity: number;
  availableQuantity: number;
  serialNo: string | null;
  stockCode: string | null;
};

export type TransactionReturnRecord = {
  approvalStep: number | null;
  approvalTag: string | null;
  canApprove: boolean;
  approvalBlockedReason: string | null;
  canExportAnytime: boolean;
  isAcknowledgement: boolean;
  canEditPendingRequest: boolean;
  canReturn: boolean;
  editableReturnBatches: { id: string; requestNo: string; phase: string }[];
  hasSignature: boolean;
  returnBlockedReason: string | null;
  id: string;
  internalRequest: boolean;
  sourceTransactionId: string | null;
  items: TransactionReturnItem[];
  outcomes: TransactionOutcomeSummary[];
  kindLabel: string;
  requestDate: string;
  requisitionerName: string;
  requisitionerPosition: string | null;
  customerName: string | null;
  projectName: string | null;
  projectCode: string | null;
  returnDate: string | null;
  originWarehouse: string;
  leadSupervisorName: string;
  currentApprovalStep: string;
  statusLabel: string;
  note: string | null;
  projectId: string | null;
  projectRequest: boolean;
  purpose: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectReason: string | null;
  rejectBlockedReason: string | null;
  requestedBy: string;
  requiresSoldPriceApproval: boolean;
  soldPrice?: string | null;
  serviceRequest: boolean;
  transactionNo: string;
  type: TransactionType;
  workflowStatus: TransactionWorkflowStatus;
};

export type ResolutionState = Record<
  string,
  {
    selected: boolean;
    toStatus: AssetStatus;
    quantity: number;
    allocations: {
      quantity: number;
      toStatus: AssetStatus;
      returnCondition: "NEW" | "USED" | null;
      note: string;
      soldPrice: string;
    }[];
  }
>;

export const missingSignatureMessage =
  "Please upload your signature before approving the document.";

export function removeResolutionAllocation(
  state: ResolutionState[string],
  index: number,
) {
  if (
    state.allocations.length <= 1 ||
    index < 0 ||
    index >= state.allocations.length
  )
    return state;
  const allocations = state.allocations.filter(
    (_, position) => position !== index,
  );
  return {
    ...state,
    allocations,
    quantity: allocations[0].quantity,
    toStatus: allocations[0].toStatus,
  };
}

export const resolutionOptions = [
  "READY",
  "SOLD",
  "FAIL",
  "LOST",
] as const satisfies readonly AssetStatus[];

export const resolutionOptionLabels = {
  READY: "RETURN",
  SOLD: "Sold",
  FAIL: "Fail",
  LOST: "Lost",
} as const satisfies Record<(typeof resolutionOptions)[number], string>;

export function canOpenReturnApproval(
  canApprove: boolean,
  approvalTag: string | null,
  mode: "APPROVE" | "REJECT",
) {
  return (
    canApprove &&
    (mode === "REJECT" || !approvalTag?.startsWith("RETURN_CHECK:"))
  );
}

export function hasOpenReturnQuantity(
  workflowStatus: string,
  availableQuantity: number,
) {
  return (
    workflowStatus !== "COMPLETED" &&
    workflowStatus !== "CANCELLED" &&
    availableQuantity > 0
  );
}

export function getReturnResolutionOptions(isQuantityAsset: boolean) {
  return [
    ...resolutionOptions.map((status) => ({
      label: resolutionOptionLabels[status],
      searchText: `${resolutionOptionLabels[status]} ${status}`,
      value: status as string,
    })),
    ...(isQuantityAsset
      ? [{ label: "USED", searchText: "USED", value: "USED" }]
      : []),
  ];
}

export function classifyReturnOutcome(
  value: string,
  isQuantityAsset: boolean,
): {
  toStatus: AssetStatus;
  returnCondition: "NEW" | "USED" | null;
} {
  if (value === "USED" && isQuantityAsset)
    return { toStatus: AssetStatus.READY, returnCondition: "USED" };
  if (!resolutionOptions.some((status) => status === value))
    throw new Error("Invalid return outcome.");
  return {
    toStatus: value as AssetStatus,
    returnCondition: value === "READY" ? "NEW" : null,
  };
}

export type ReturnRevisionItem = Pick<
  TransactionReturnItem,
  "itemId" | "resolvedAt" | "requestedQuantity"
> & { resolvedQuantity?: number };

export function buildInitialState(
  items: ReturnRevisionItem[],
): ResolutionState {
  return Object.fromEntries(
    items
      .filter(
        (item) =>
          !item.resolvedAt ||
          (item.resolvedQuantity !== undefined &&
            item.resolvedQuantity < item.requestedQuantity),
      )
      .map((item) => [
        item.itemId,
        {
          selected: false,
          toStatus: "READY" as AssetStatus,
          quantity: item.requestedQuantity,
          allocations: [
            {
              quantity: item.requestedQuantity,
              toStatus: AssetStatus.READY,
              returnCondition: "NEW",
              note: "",
              soldPrice: "",
            },
          ],
        },
      ]),
  );
}

export function buildReturnBatchRevision(
  items: ReturnRevisionItem[],
  outcomes: Pick<
    TransactionOutcomeSummary,
    | "itemId"
    | "resolutionBatchId"
    | "approvedAt"
    | "quantity"
    | "outcomeStatus"
    | "returnCondition"
    | "note"
    | "soldPrice"
  >[],
  batchId: string,
): ResolutionState {
  const next = buildInitialState(items);
  for (const item of items) {
    const state = next[item.itemId];
    if (!state) continue;
    const quantity = availableReturnQuantity(item, outcomes, batchId);
    state.quantity = quantity;
    state.allocations[0].quantity = quantity;
  }
  if (!batchId) return next;
  for (const item of items) {
    const rows = outcomes.filter(
      (outcome) =>
        outcome.itemId === item.itemId &&
        outcome.resolutionBatchId === batchId &&
        !outcome.approvedAt,
    );
    if (!rows.length || !next[item.itemId]) continue;
    next[item.itemId] = {
      selected: true,
      quantity: rows[0].quantity,
      toStatus: rows[0].outcomeStatus,
      allocations: rows.map((outcome) => ({
        quantity: outcome.quantity,
        toStatus: outcome.outcomeStatus,
        returnCondition: outcome.returnCondition,
        note: outcome.note ?? "",
        soldPrice: outcome.soldPrice ?? "",
      })),
    };
  }
  return next;
}

export function fallback(value: string | null | undefined) {
  return value?.trim() ? value : "-";
}

export function formatReturnDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    calendar: "gregory",
    numberingSystem: "latn",
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export type TransactionProjectOption = {
  customerName?: string;
  id: string;
  name: string;
  projectId: string | null;
};
