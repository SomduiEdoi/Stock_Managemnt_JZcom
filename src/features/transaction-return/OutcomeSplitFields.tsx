"use client";
import { Trash2 } from "lucide-react";
import { AssetStatus } from "@prisma/client";
import { SearchableDropdown } from "@/components/form/searchable-dropdown";
import {
  classifyReturnOutcome,
  getReturnResolutionOptions,
} from "./return-transaction-state";
import type {
  TransactionReturnItem,
  ResolutionState,
} from "./return-transaction-state";
import type { ReturnTransactionController } from "./useReturnTransaction";

export function OutcomeSplitFields({
  view,
  item,
  state,
}: {
  view: Pick<
    ReturnTransactionController,
    | "addResolutionSplit"
    | "allocationMaximum"
    | "isSubmitting"
    | "quantityErrors"
    | "quantityMismatch"
    | "removeResolutionSplit"
    | "resolutionMaximum"
    | "updateResolutionAllocation"
    | "updateResolutionQuantity"
  >;
  item: TransactionReturnItem;
  state: ResolutionState[string] | undefined;
}) {
  const {
    addResolutionSplit,
    allocationMaximum,
    isSubmitting,
    quantityErrors,
    quantityMismatch,
    removeResolutionSplit,
    resolutionMaximum,
    updateResolutionAllocation,
    updateResolutionQuantity,
  } = view;
  return (
    <div className="space-y-2">
      {(
        state?.allocations ?? [
          {
            quantity: item.requestedQuantity,
            toStatus: AssetStatus.READY,
            returnCondition: "NEW",
            note: "",
            soldPrice: "",
          },
        ]
      ).map((allocation, index) => (
        <div
          className="flex flex-wrap items-center gap-2"
          key={`${item.itemId}-${index}`}
        >
          <div className="flex w-full min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <SearchableDropdown
                onChange={(value) =>
                  updateResolutionAllocation(
                    item.itemId,
                    index,
                    classifyReturnOutcome(value, item.isQuantityAsset),
                  )
                }
                options={getReturnResolutionOptions(item.isQuantityAsset)}
                portal
                placeholder="Outcome"
                searchPlaceholder="Search outcome"
                value={
                  allocation.toStatus === AssetStatus.READY &&
                  allocation.returnCondition === "USED"
                    ? "USED"
                    : allocation.toStatus
                }
              />
            </div>
            {(state?.allocations.length ?? 1) > 1 ? (
              <button
                aria-label={`Remove outcome ${index + 1} for ${item.model}`}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-status-fail transition hover:bg-status-fail/10 disabled:opacity-50"
                disabled={isSubmitting}
                onClick={() => removeResolutionSplit(item.itemId, index)}
                title="Remove outcome"
                type="button"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          {item.isQuantityAsset ? (
            <input
              aria-label={`Quantity for ${item.model}`}
              className="h-9 w-20 rounded-md border border-border px-2 text-sm font-bold text-navy"
              max={allocationMaximum(item, index)}
              min={1}
              onChange={(event) =>
                updateResolutionQuantity(
                  item.itemId,
                  index,
                  Number(event.target.value),
                  allocationMaximum(item, index),
                )
              }
              type="number"
              value={allocation.quantity}
            />
          ) : null}
          <input
            aria-label={`Remark for ${item.model} outcome ${index + 1}`}
            className="h-9 min-w-40 flex-1 rounded-md border border-border px-2 text-xs font-medium text-navy"
            onChange={(event) =>
              updateResolutionAllocation(item.itemId, index, {
                note: event.target.value,
              })
            }
            placeholder="Remark"
            value={allocation.note}
          />
          {item.isQuantityAsset && quantityErrors[`${item.itemId}-${index}`] ? (
            <p className="text-xs font-semibold text-status-fail">
              {quantityErrors[`${item.itemId}-${index}`]}
            </p>
          ) : null}
        </div>
      ))}
      {item.isQuantityAsset &&
      resolutionMaximum(item) > 1 &&
      (state?.allocations.length ?? 1) < 10 ? (
        <button
          className="text-xs font-bold text-brand-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          disabled={
            (state?.allocations.reduce(
              (sum, allocation) => sum + allocation.quantity,
              0,
            ) ?? item.requestedQuantity) >= resolutionMaximum(item)
          }
          onClick={() =>
            addResolutionSplit(item.itemId, resolutionMaximum(item))
          }
          type="button"
        >
          + Split outcome
        </button>
      ) : null}
      {quantityMismatch(item) ? (
        <p className="text-xs font-semibold text-status-fail">
          {quantityMismatch(item)}
        </p>
      ) : null}
    </div>
  );
}
