import { describe, expect, it } from "vitest";
import {
  createMonthlyRequisitionNo,
  MonthlyRequisitionLimitError,
  monthlyRequisitionPrefix,
} from "./requisition-no";

function mockCounter(count: number) {
  const calls: unknown[] = [];

  return {
    calls,
    tx: {
      transaction: {
        count: async (args: unknown) => {
          calls.push(args);
          return count;
        },
      },
    },
  };
}

describe("monthly requisition number", () => {
  it("formats request numbers as REQ-YYYYMMDD-XX", async () => {
    const { tx } = mockCounter(0);

    await expect(
      createMonthlyRequisitionNo(tx, new Date("2026-07-20T09:30:00.000Z")),
    ).resolves.toBe("REQ-20260720-01");
  });

  it("counts every request in the same month", async () => {
    const { calls, tx } = mockCounter(14);

    await expect(
      createMonthlyRequisitionNo(tx, new Date("2026-07-20T09:30:00.000Z")),
    ).resolves.toBe("REQ-20260720-15");
    expect(calls).toEqual([
      { where: { transactionNo: { startsWith: "REQ-202607" } } },
    ]);
  });

  it("resets the sequence when the month changes", async () => {
    expect(monthlyRequisitionPrefix(new Date("2026-07-31T23:59:00.000Z"))).toBe(
      "REQ-202607",
    );
    expect(monthlyRequisitionPrefix(new Date("2026-08-01T00:00:00.000Z"))).toBe(
      "REQ-202608",
    );

    const { tx } = mockCounter(0);

    await expect(
      createMonthlyRequisitionNo(tx, new Date("2026-08-01T00:00:00.000Z")),
    ).resolves.toBe("REQ-20260801-01");
  });

  it("stops after 99 request numbers in a month", async () => {
    const { tx } = mockCounter(99);

    await expect(
      createMonthlyRequisitionNo(tx, new Date("2026-07-20T09:30:00.000Z")),
    ).rejects.toBeInstanceOf(MonthlyRequisitionLimitError);
  });
});
