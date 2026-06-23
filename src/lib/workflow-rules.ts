import {
  AssetActionType,
  AssetStatus,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";

export const assetStatusTransitions = {
  [AssetStatus.READY]: [
    AssetStatus.REQUEST,
    AssetStatus.BORROW,
    AssetStatus.USING,
    AssetStatus.SOLD,
    AssetStatus.FAIL,
    AssetStatus.LOST,
    AssetStatus.NEED_CHECK,
  ],
  [AssetStatus.REQUEST]: [
    AssetStatus.READY,
    AssetStatus.BORROW,
    AssetStatus.USING,
    AssetStatus.SOLD,
  ],
  [AssetStatus.BORROW]: [
    AssetStatus.READY,
    AssetStatus.FAIL,
    AssetStatus.LOST,
    AssetStatus.NEED_CHECK,
  ],
  [AssetStatus.USING]: [
    AssetStatus.READY,
    AssetStatus.FAIL,
    AssetStatus.LOST,
    AssetStatus.NEED_CHECK,
  ],
  [AssetStatus.SOLD]: [],
  [AssetStatus.FAIL]: [AssetStatus.READY, AssetStatus.NEED_CHECK],
  [AssetStatus.LOST]: [AssetStatus.READY, AssetStatus.NEED_CHECK],
  [AssetStatus.NEED_CHECK]: [
    AssetStatus.READY,
    AssetStatus.FAIL,
    AssetStatus.LOST,
  ],
} as const satisfies Record<AssetStatus, readonly AssetStatus[]>;

export function canTransitionAssetStatus(
  fromStatus: AssetStatus,
  toStatus: AssetStatus,
) {
  return (assetStatusTransitions[fromStatus] as readonly AssetStatus[]).includes(
    toStatus,
  );
}

export function getTransactionAssetStatus(type: TransactionType) {
  if (type === TransactionType.BORROW) {
    return AssetStatus.BORROW;
  }

  if (type === TransactionType.USING) {
    return AssetStatus.USING;
  }

  return AssetStatus.SOLD;
}

export function getInitialTransactionStatus(type: TransactionType) {
  if (type === TransactionType.BORROW) {
    return TransactionStatus.BORROWED;
  }

  if (type === TransactionType.USING) {
    return TransactionStatus.ACTIVE;
  }

  return TransactionStatus.COMPLETED;
}

export function isReturnableTransaction(type: TransactionType) {
  return type === TransactionType.BORROW || type === TransactionType.USING;
}

export const transactionItemResolutionStatuses = [
  AssetStatus.READY,
  AssetStatus.SOLD,
] as const satisfies readonly AssetStatus[];

export function isTransactionItemResolutionStatus(status: AssetStatus) {
  return (transactionItemResolutionStatuses as readonly AssetStatus[]).includes(
    status,
  );
}

export function canReturnTransactionStatus(status: TransactionStatus) {
  return (
    [
      TransactionStatus.ACTIVE,
      TransactionStatus.BORROWED,
      TransactionStatus.OVERDUE,
    ] as readonly TransactionStatus[]
  ).includes(status);
}

export function getManualStatusAction(
  fromStatus: AssetStatus,
  toStatus: AssetStatus,
) {
  if (toStatus === AssetStatus.FAIL) {
    return AssetActionType.MARK_FAIL;
  }

  if (toStatus === AssetStatus.LOST) {
    return AssetActionType.MARK_LOST;
  }

  if (toStatus === AssetStatus.NEED_CHECK) {
    return AssetActionType.MARK_NEED_CHECK;
  }

  if (
    toStatus === AssetStatus.READY &&
    ([AssetStatus.BORROW, AssetStatus.USING] as readonly AssetStatus[]).includes(
      fromStatus,
    )
  ) {
    return AssetActionType.RETURN;
  }

  return AssetActionType.STATUS_CHANGE;
}
