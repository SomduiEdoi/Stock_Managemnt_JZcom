import {
  AssetActionType,
  AssetStatus,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  canTransitionAssetStatus,
  getInitialTransactionStatus,
  getManualStatusAction,
  getTransactionAssetStatus,
  isTransactionItemResolutionStatus,
  isReturnableTransaction,
} from "./workflow-rules";

describe("asset status transitions", () => {
  const allStatuses = Object.values(AssetStatus);

  function expectAllowedOnly(from: AssetStatus, allowed: AssetStatus[]) {
    for (const to of allStatuses) {
      expect(canTransitionAssetStatus(from, to), `${from} -> ${to}`).toBe(
        allowed.includes(to),
      );
    }
  }

  it("allows ready assets to move to every other status", () => {
    expectAllowedOnly(
      AssetStatus.READY,
      allStatuses.filter((status) => status !== AssetStatus.READY),
    );
  });

  it("keeps request, borrow, using, and sold assets locked from manual changes", () => {
    expectAllowedOnly(AssetStatus.REQUEST, []);
    expectAllowedOnly(AssetStatus.BORROW, []);
    expectAllowedOnly(AssetStatus.USING, []);
    expectAllowedOnly(AssetStatus.SOLD, []);
  });

  it("allows need check assets to become ready, fail, or lost", () => {
    expectAllowedOnly(AssetStatus.NEED_CHECK, [
      AssetStatus.READY,
      AssetStatus.FAIL,
      AssetStatus.LOST,
    ]);
  });

  it("allows fail and lost assets to become ready or need check", () => {
    expectAllowedOnly(AssetStatus.FAIL, [
      AssetStatus.READY,
      AssetStatus.NEED_CHECK,
    ]);
    expectAllowedOnly(AssetStatus.LOST, [
      AssetStatus.READY,
      AssetStatus.NEED_CHECK,
    ]);
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
  it("limits transaction item outcomes to operational final states", () => {
    expect(isTransactionItemResolutionStatus(AssetStatus.READY)).toBe(true);
    expect(isTransactionItemResolutionStatus(AssetStatus.SOLD)).toBe(true);
    expect(isTransactionItemResolutionStatus(AssetStatus.LOST)).toBe(false);
    expect(isTransactionItemResolutionStatus(AssetStatus.FAIL)).toBe(false);
    expect(isTransactionItemResolutionStatus(AssetStatus.NEED_CHECK)).toBe(false);
    expect(isTransactionItemResolutionStatus(AssetStatus.REQUEST)).toBe(false);
    expect(isTransactionItemResolutionStatus(AssetStatus.BORROW)).toBe(false);
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
