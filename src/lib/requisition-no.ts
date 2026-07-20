export const MONTHLY_REQUISITION_LIMIT = 99;
export const MONTHLY_REQUISITION_LIMIT_MESSAGE = "Monthly request number limit reached.";

export class MonthlyRequisitionLimitError extends Error {
  constructor() {
    super(MONTHLY_REQUISITION_LIMIT_MESSAGE);
    this.name = "MonthlyRequisitionLimitError";
  }
}

type RequisitionTransactionCounter = {
  transaction: {
    count: (args: {
      where: { transactionNo: { startsWith: string } };
    }) => Promise<number>;
  };
};

export function formatRequisitionDate(now: Date) {
  return now.toISOString().slice(0, 10).replaceAll("-", "");
}

export function monthlyRequisitionPrefix(now: Date) {
  return `REQ-${formatRequisitionDate(now).slice(0, 6)}`;
}

export async function createMonthlyRequisitionNo(
  tx: RequisitionTransactionCounter,
  now: Date,
) {
  const datePart = formatRequisitionDate(now);
  const count = await tx.transaction.count({
    where: { transactionNo: { startsWith: monthlyRequisitionPrefix(now) } },
  });

  if (count >= MONTHLY_REQUISITION_LIMIT) {
    throw new MonthlyRequisitionLimitError();
  }

  const sequence = String(count + 1).padStart(2, "0");

  return `REQ-${datePart}-${sequence}`;
}
