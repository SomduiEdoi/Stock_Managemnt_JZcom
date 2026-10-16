"use client";
import { OutcomeSplitFields } from "./OutcomeSplitFields";
import Link from "next/link";
import { CheckCircle2, Trash2 } from "lucide-react";

import { AssetStatusBadge } from "@/components/status/asset-status-badge";
import {
  clampSaleGroupQuantity,
  normalizeSaleMoney,
} from "@/lib/sale-price-groups";
import { fallback } from "./return-transaction-state";
import type { TransactionReturnRecord } from "./return-transaction-state";
import type { ReturnTransactionController } from "./useReturnTransaction";

export function ReturnItemsTable({
  view,
  transaction,
}: {
  view: Pick<
    ReturnTransactionController,
    | "addResolutionSplit"
    | "allocationMaximum"
    | "confirmIssueSerial"
    | "confirmingSerialId"
    | "isSubmitting"
    | "loadSerialOptions"
    | "openItems"
    | "openQuantity"
    | "priceGroups"
    | "quantityErrors"
    | "quantityMismatch"
    | "removeResolutionSplit"
    | "resolutionMaximum"
    | "resolutions"
    | "salePricing"
    | "savingPriceDraft"
    | "selectedSerials"
    | "serialOptions"
    | "setError"
    | "setPriceDraftSaved"
    | "setPriceGroups"
    | "setSelectedSerials"
    | "toggleResolutionItem"
    | "updateResolutionAllocation"
    | "updateResolutionQuantity"
  >;
  transaction: TransactionReturnRecord;
}) {
  const {
    confirmIssueSerial,
    confirmingSerialId,
    isSubmitting,
    loadSerialOptions,
    openItems,
    openQuantity,
    priceGroups,
    resolutions,
    salePricing,
    savingPriceDraft,
    selectedSerials,
    serialOptions,
    setError,
    setPriceDraftSaved,
    setPriceGroups,
    setSelectedSerials,
    toggleResolutionItem,
  } = view;
  return (
    <section
      className="scroll-mt-6 overflow-hidden rounded-md border border-border bg-white shadow-sm"
      id="sale-pricing"
    >
      <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-navy">
            {transaction.requiresSoldPriceApproval
              ? "Sale Pricing"
              : "Request Items"}
          </h2>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {transaction.canReturn
              ? "Select the final outcome for each open asset."
              : "Review the approval step and requested assets."}
          </p>
        </div>
        <span className="text-sm font-bold text-navy">
          {openItems.length} open / {transaction.items.length} total
          {transaction.items.some((item) => item.requestedQuantity > 1) ? (
            <span className="ml-2 text-xs font-semibold text-muted-foreground">
              ({openQuantity} qty remaining)
            </span>
          ) : null}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed border-collapse text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-[18%] px-5 py-4 font-bold">Asset / Model</th>
              <th className="w-[11%] px-5 py-4 font-bold">Category</th>
              <th className="w-[11%] px-5 py-4 font-bold">Type</th>
              <th className="w-[12%] px-5 py-4 font-bold">Part No.</th>
              <th className="w-[10%] px-5 py-4 font-bold">Brand</th>
              <th className="w-[11%] px-5 py-4 font-bold">Stock Code</th>
              <th className="w-[14%] px-5 py-4 font-bold">Serial No.</th>
              <th className="w-20 px-5 py-4 text-right font-bold">QTY</th>
              <th className="w-[13%] px-5 py-4 font-bold">Current Step</th>
              <th className="w-[16%] px-5 py-4 font-bold">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {transaction.items.map((item) => {
              const isResolved =
                Boolean(item.resolvedAt) &&
                item.resolvedQuantity >= item.requestedQuantity;
              const isAwaitingOutcomeApproval =
                item.hasPendingOutcome &&
                !openItems.some(
                  (candidate) => candidate.itemId === item.itemId,
                );
              const state = resolutions[item.itemId];

              return (
                <tr className="align-middle" key={item.itemId}>
                  <td className="px-5 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                      {!isResolved &&
                      !isAwaitingOutcomeApproval &&
                      transaction.canReturn &&
                      item.availableQuantity > 0 ? (
                        <input
                          aria-label={`Select ${item.model} for return`}
                          checked={state?.selected ?? false}
                          className="mt-1 h-4 w-4 accent-brand-accent"
                          onChange={() => toggleResolutionItem(item.itemId)}
                          type="checkbox"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <Link
                          className="block break-words font-bold text-navy hover:text-brand-accent"
                          href={`/dashboard/assets/${item.assetId}`}
                          title={item.model}
                        >
                          {item.model}
                        </Link>
                        {transaction.requiresSoldPriceApproval ? (
                          <div className="mt-3 w-full min-w-0 space-y-3">
                            {(salePricing.groups[item.itemId] ?? []).map(
                              (group, index) => (
                                <div
                                  key={index}
                                  className="flex min-w-0 items-start gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0"
                                >
                                  <div className="min-w-0 flex-1 space-y-2">
                                    {(
                                      [
                                        "quantity",
                                        "unitPrice",
                                        "total",
                                      ] as const
                                    ).map((field) => (
                                      <label
                                        key={field}
                                        className="block text-xs text-muted-foreground"
                                      >
                                        {field === "quantity"
                                          ? "QTY"
                                          : field === "unitPrice"
                                            ? "Price / unit"
                                            : "Group total"}
                                        <input
                                          aria-label={`${item.model} group ${index + 1} ${field}`}
                                          className={`mt-1 h-9 w-full min-w-0 rounded-md border border-border px-2 font-bold tabular-nums text-navy ${field === "total" ? "bg-surface/50" : "bg-white"}`}
                                          type={
                                            field === "quantity"
                                              ? "number"
                                              : "text"
                                          }
                                          inputMode={
                                            field === "quantity"
                                              ? "numeric"
                                              : "decimal"
                                          }
                                          min={
                                            field === "quantity" ? 1 : undefined
                                          }
                                          max={
                                            field === "quantity"
                                              ? clampSaleGroupQuantity(
                                                  priceGroups[item.itemId],
                                                  index,
                                                  item.requestedQuantity,
                                                  item.requestedQuantity,
                                                  !item.isQuantityAsset,
                                                )
                                              : undefined
                                          }
                                          readOnly={
                                            field === "total" ||
                                            (field === "quantity" &&
                                              (!item.isQuantityAsset ||
                                                item.requestedQuantity === 1))
                                          }
                                          step={
                                            field === "quantity" ? 1 : undefined
                                          }
                                          placeholder={
                                            field === "quantity"
                                              ? undefined
                                              : "0.00"
                                          }
                                          value={group[field]}
                                          onChange={
                                            field === "total"
                                              ? undefined
                                              : (event) => {
                                                  const value =
                                                    event.target.value;
                                                  if (
                                                    field === "unitPrice" &&
                                                    !/^\d*(\.\d{0,2})?$/.test(
                                                      value,
                                                    )
                                                  )
                                                    return;
                                                  setPriceDraftSaved(false);
                                                  setPriceGroups((current) => ({
                                                    ...current,
                                                    [item.itemId]: current[
                                                      item.itemId
                                                    ].map((entry, position) =>
                                                      position === index
                                                        ? {
                                                            ...entry,
                                                            [field]:
                                                              field ===
                                                              "quantity"
                                                                ? clampSaleGroupQuantity(
                                                                    current[
                                                                      item
                                                                        .itemId
                                                                    ],
                                                                    index,
                                                                    item.requestedQuantity,
                                                                    Number(
                                                                      value,
                                                                    ),
                                                                    !item.isQuantityAsset,
                                                                  )
                                                                : value,
                                                          }
                                                        : entry,
                                                    ),
                                                  }));
                                                }
                                          }
                                          onBlur={
                                            field === "unitPrice"
                                              ? () => {
                                                  if (!group.unitPrice.trim())
                                                    return;
                                                  try {
                                                    const unitPrice =
                                                      normalizeSaleMoney(
                                                        group.unitPrice,
                                                      );
                                                    setPriceGroups(
                                                      (current) => ({
                                                        ...current,
                                                        [item.itemId]: current[
                                                          item.itemId
                                                        ].map(
                                                          (entry, position) =>
                                                            position === index
                                                              ? {
                                                                  ...entry,
                                                                  unitPrice,
                                                                }
                                                              : entry,
                                                        ),
                                                      }),
                                                    );
                                                  } catch (cause) {
                                                    setError(
                                                      cause instanceof Error
                                                        ? cause.message
                                                        : "Invalid sale price.",
                                                    );
                                                  }
                                                }
                                              : undefined
                                          }
                                        />
                                      </label>
                                    ))}
                                  </div>
                                  {(priceGroups[item.itemId]?.length ?? 0) >
                                  1 ? (
                                    <button
                                      aria-label={`Remove price group ${index + 1} for ${item.model}`}
                                      className="mt-5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-status-fail transition hover:bg-status-fail/10 disabled:opacity-50"
                                      disabled={
                                        isSubmitting || savingPriceDraft
                                      }
                                      onClick={() => {
                                        setPriceDraftSaved(false);
                                        setPriceGroups((current) => ({
                                          ...current,
                                          [item.itemId]: current[
                                            item.itemId
                                          ].filter(
                                            (_, position) => position !== index,
                                          ),
                                        }));
                                      }}
                                      title="Remove price group"
                                      type="button"
                                    >
                                      <Trash2
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                      />
                                    </button>
                                  ) : null}
                                </div>
                              ),
                            )}
                            {item.isQuantityAsset &&
                            item.requestedQuantity > 1 ? (
                              <button
                                type="button"
                                className="text-xs font-bold text-coral disabled:opacity-40"
                                disabled={
                                  priceGroups[item.itemId].length >=
                                  item.requestedQuantity
                                }
                                onClick={() => {
                                  setPriceDraftSaved(false);
                                  setPriceGroups((current) => {
                                    const groups = current[item.itemId];
                                    const splitIndex = groups.findIndex(
                                      (group) => group.quantity > 1,
                                    );
                                    return {
                                      ...current,
                                      [item.itemId]: [
                                        ...groups.map((group, index) =>
                                          index === splitIndex
                                            ? {
                                                ...group,
                                                quantity: group.quantity - 1,
                                              }
                                            : group,
                                        ),
                                        {
                                          quantity: 1,
                                          unitPrice: "",
                                          total: "",
                                        },
                                      ],
                                    };
                                  });
                                }}
                              >
                                + Split price
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td
                    className="truncate px-5 py-4 font-medium text-ink"
                    title={fallback(item.category)}
                  >
                    {fallback(item.category)}
                  </td>
                  <td
                    className="truncate px-5 py-4 font-medium text-ink"
                    title={fallback(item.typeName)}
                  >
                    {fallback(item.typeName)}
                  </td>
                  <td
                    className="truncate px-5 py-4 font-medium text-ink"
                    title={fallback(item.partNo)}
                  >
                    {fallback(item.partNo)}
                  </td>
                  <td
                    className="truncate px-5 py-4 font-medium text-ink"
                    title={fallback(item.brand)}
                  >
                    {fallback(item.brand)}
                  </td>
                  <td
                    className="truncate px-5 py-4 font-medium text-ink"
                    title={fallback(item.stockCode)}
                  >
                    {fallback(item.stockCode)}
                  </td>
                  <td
                    className="px-5 py-4 font-medium text-ink"
                    title={fallback(item.serialNo)}
                  >
                    {fallback(item.serialNo)}
                    {item.canConfirmSerial ? (
                      <div className="mt-2 space-y-2">
                        <select
                          aria-label={`Serial number for ${item.model}`}
                          className="h-9 w-full min-w-32 rounded-md border border-border bg-white px-2 text-xs text-ink"
                          disabled={Boolean(confirmingSerialId)}
                          onFocus={() => void loadSerialOptions(item)}
                          onPointerDown={() => void loadSerialOptions(item)}
                          onChange={(event) =>
                            setSelectedSerials((current) => ({
                              ...current,
                              [item.itemId]: event.target.value,
                            }))
                          }
                          value={selectedSerials[item.itemId] ?? item.assetId}
                        >
                          <option value={item.assetId}>{item.serialNo}</option>
                          {(serialOptions[item.itemId] ?? [])
                            .filter((option) => option.id !== item.assetId)
                            .map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.serialNo}
                                {option.stockCode
                                  ? ` / ${option.stockCode}`
                                  : ""}
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className="mt-2 flex items-center gap-1 text-xs font-bold text-coral disabled:opacity-50"
                          disabled={Boolean(confirmingSerialId)}
                          onClick={() => confirmIssueSerial(item)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {confirmingSerialId === item.itemId
                            ? "Confirming..."
                            : "Confirm serial"}
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-right font-bold tabular-nums text-ink">
                    {item.requestedQuantity.toLocaleString("en-US")}
                  </td>
                  <td
                    className="truncate px-5 py-4 font-semibold text-ink"
                    title={item.currentStep}
                  >
                    {item.currentStep}
                  </td>
                  <td className="px-5 py-4">
                    {isResolved && item.resolvedStatus ? (
                      <AssetStatusBadge status={item.resolvedStatus} />
                    ) : isAwaitingOutcomeApproval ? (
                      <span className="text-sm font-bold text-muted-foreground">
                        Awaiting approval
                      </span>
                    ) : transaction.canReturn && item.availableQuantity > 0 ? (
                      <OutcomeSplitFields
                        view={view}
                        item={item}
                        state={state}
                      />
                    ) : (
                      <span className="text-sm font-bold text-muted-foreground">
                        {item.currentStep}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
