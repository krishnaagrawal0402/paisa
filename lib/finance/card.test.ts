import { describe, expect, it } from "vitest";
import { toPaise } from "@/lib/money";
import { cardBill, dueDateAfter, lastStatementDate, utilisation } from "./card";

describe("billing cycle dates", () => {
  it("finds the last statement date, looking back a month when needed", () => {
    expect(lastStatementDate("2026-10-05", 20)).toBe("2026-09-20");
    expect(lastStatementDate("2026-10-20", 20)).toBe("2026-10-20");
    expect(lastStatementDate("2026-01-05", 20)).toBe("2025-12-20");
  });

  it("treats days 29–31 as the last day of shorter months", () => {
    expect(lastStatementDate("2026-03-05", 31)).toBe("2026-02-28");
    expect(dueDateAfter("2026-01-31", 30)).toBe("2026-02-28");
  });

  it("puts the due date after the statement, in the same or the next month", () => {
    expect(dueDateAfter("2026-09-20", 7)).toBe("2026-10-07");
    expect(dueDateAfter("2026-10-05", 25)).toBe("2026-10-25");
    expect(dueDateAfter("2026-12-15", 3)).toBe("2027-01-03");
  });
});

describe("cardBill", () => {
  const base = { today: "2026-10-05", statementDay: 20, dueDay: 7 };

  it("shows what's left of the last statement and when it's due", () => {
    const bill = cardBill({ ...base, owedAtStatement: toPaise(18_400), paidSince: toPaise(5_000) });
    expect(bill).toEqual({
      statementDate: "2026-09-20",
      dueDate: "2026-10-07",
      billed: toPaise(18_400),
      due: toPaise(13_400),
      status: "due",
    });
  });

  it("is paid once payments cover the statement, even with new spending since", () => {
    expect(cardBill({ ...base, owedAtStatement: toPaise(18_400), paidSince: toPaise(20_000) }).status).toBe("paid");
  });

  it("is overdue after the due date, and has nothing to show when nothing was owed", () => {
    expect(cardBill({ ...base, today: "2026-10-09", owedAtStatement: 100, paidSince: 0 }).status).toBe("overdue");
    expect(cardBill({ ...base, owedAtStatement: -500, paidSince: 0 }).status).toBe("none");
  });
});

describe("utilisation", () => {
  it("is owed ÷ limit, and null without a limit", () => {
    expect(utilisation(toPaise(60_000), toPaise(2_00_000))).toBeCloseTo(0.3);
    expect(utilisation(-100, toPaise(1_000))).toBe(0);
    expect(utilisation(100, null)).toBeNull();
  });
});
