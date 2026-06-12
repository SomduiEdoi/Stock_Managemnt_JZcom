import {
  AssetActionType,
  AssetStatus,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  canReturnTransactionStatus,
  canTransitionAssetStatus,
  getInitialTransactionStatus,
  getManualStatusAction,
  getTransactionAssetStatus,
  isReturnableTransaction,
} from "./workflow-rules";

describe("asset status transitions", () => {
  it("allows ready assets to enter the request workflow", () => {
    expect(
      canTransitionAssetStatus(AssetStatus.READY, AssetStatus.REQUEST),
    ).toBe(true);
  });

  it("keeps sold assets terminal", () => {
    expect(canTransitionAssetStatus(AssetStatus.SOLD, AssetStatus.READY)).toBe(
      false,
    );
  });

  it("allows borrowed and using assets to return to ready", () => {
    expect(canTransitionAssetStatus(AssetStatus.BORROW, AssetStatus.READY)).toBe(
      true,
    );
    expect(canTransitionAssetStatus(AssetStatus.USING, AssetStatus.READY)).toBe(
      true,
    );
  });
});

describe("transaction workflow mapping", () => {
  it("maps transaction types to asset statuses", () => {
    expect(getTransactionAssetStatus(TransactionType.BORROW)).toBe(
      AssetStatus.BORROW,
    );
    expect(getTransactionAssetStatus(TransactionType.USING)).toBe(
      AssetStatus.USING,
    );
    expect(getTransactionAssetStatus(TransactionType.SOLD)).toBe(
      AssetStatus.SOLD,
    );
  });

  it("maps transaction types to initial transaction statuses", () => {
    expect(getInitialTransactionStatus(TransactionType.BORROW)).toBe(
      TransactionStatus.BORROWED,
    );
    expect(getInitialTransactionStatus(TransactionType.USING)).toBe(
      TransactionStatus.ACTIVE,
    );
    expect(getInitialTransactionStatus(TransactionType.SOLD)).toBe(
      TransactionStatus.COMPLETED,
    );
  });

  it("only borrow and using transactions are returnable", () => {
    expect(isReturnableTransaction(TransactionType.BORROW)).toBe(true);
    expect(isReturnableTransaction(TransactionType.USING)).toBe(true);
    expect(isReturnableTransaction(TransactionType.SOLD)).toBe(false);
  });
});

describe("return and history action rules", () => {
  it("allows open and overdue transactions to be returned", () => {
    expect(canReturnTransactionStatus(TransactionStatus.BORROWED)).toBe(true);
    expect(canReturnTransactionStatus(TransactionStatus.OVERDUE)).toBe(true);
    expect(canReturnTransactionStatus(TransactionStatus.RETURNED)).toBe(false);
  });

  it("uses explicit action types for operational manual statuses", () => {
    expect(getManualStatusAction(AssetStatus.READY, AssetStatus.FAIL)).toBe(
      AssetActionType.MARK_FAIL,
    );
    expect(getManualStatusAction(AssetStatus.BORROW, AssetStatus.READY)).toBe(
      AssetActionType.RETURN,
    );
  });
});
