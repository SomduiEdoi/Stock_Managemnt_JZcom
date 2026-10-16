export const MONTHLY_REQUISITION_LIMIT = 99;
export const MONTHLY_REQUISITION_LIMIT_MESSAGE = "Monthly request number limit reached.";

export class MonthlyRequisitionLimitError extends Error {
  constructor() {
    super(MONTHLY_REQUISITION_LIMIT_MESSAGE);
    this.name = "MonthlyRequisitionLimitError";
  }
}

type RequisitionTransactionCounter = {
  $executeRawUnsafe?: (query: string) => Promise<number>;
  returnBatch?: {
    count: (args: { where: { requestNo: { startsWith: string } } }) => Promise<number>;
  };
  transaction: {
    count: (args: {
      where: { transactionNo: { startsWith: string } };
    }) => Promise<number>;
  };
};

export function formatRequisitionDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok", calendar: "gregory", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value ?? "").join("");
}

export function monthlyRequisitionPrefix(now: Date) {
  return `REQ-${formatRequisitionDate(now).slice(0, 6)}`;
}

export async function createMonthlyRequisitionNo(
  tx: RequisitionTransactionCounter,
  now: Date,
) {
  const datePart = formatRequisitionDate(now);
  // All request types allocate under one transaction-scoped monthly lock.
  if (tx.$executeRawUnsafe) await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(53002026)");
  const count = await tx.transaction.count({
    where: { transactionNo: { startsWith: monthlyRequisitionPrefix(now) } },
  });
  const returnCount = tx.returnBatch ? await tx.returnBatch.count({
    where: { requestNo: { startsWith: monthlyRequisitionPrefix(now) } },
  }) : 0;
  const total = count + returnCount;

  if (total >= MONTHLY_REQUISITION_LIMIT) {
    throw new MonthlyRequisitionLimitError();
  }

  const sequence = String(total + 1).padStart(2, "0");

  return `REQ-${datePart}-${sequence}`;
}
