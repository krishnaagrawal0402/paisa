import { describe, expect, it } from "vitest";
import { toPaise } from "@/lib/money";
import { safeToSpend } from "./safe-to-spend";

const base = { savingsTargetPct: 20, daysTotal: 30 };

describe("safeToSpend", () => {
  it("keeps the savings target aside and spreads the rest over the days left", () => {
    const r = safeToSpend({ ...base, income: toPaise(100_000), spent: toPaise(20_000), daysLeft: 20 });
    expect(r.spendable).toBe(toPaise(80_000));
    expect(r.remaining).toBe(toPaise(60_000));
    expect(r.perDay).toBe(toPaise(3_000));
    expect(r.status).toBe("on-track");
  });

  it("rounds the daily figure down to whole rupees", () => {
    const r = safeToSpend({ ...base, income: toPaise(1_000), spent: 0, daysLeft: 3 });
    expect(r.perDay).toBe(toPaise(266));
  });

  it("subtracts bills still to come", () => {
    const r = safeToSpend({ ...base, income: toPaise(100_000), spent: 0, committed: toPaise(30_000), daysLeft: 30 });
    expect(r.spendable).toBe(toPaise(50_000));
  });

  it("doesn't panic about rent paid early in the month", () => {
    // Day 6 of 30 (20% through) with half the budget gone on rent: still fine.
    const r = safeToSpend({ ...base, income: toPaise(100_000), spent: toPaise(40_000), daysLeft: 25 });
    expect(r.elapsed).toBeCloseTo(0.2);
    expect(r.status).toBe("on-track");
  });

  it("warns when less than 15% of the budget is left", () => {
    const r = safeToSpend({ ...base, income: toPaise(100_000), spent: toPaise(70_000), daysLeft: 10 });
    expect(r.status).toBe("tight");
  });

  it("reports overspending with a negative remainder and nothing per day", () => {
    const r = safeToSpend({ ...base, income: toPaise(10_000), spent: toPaise(9_000), daysLeft: 5 });
    expect(r.status).toBe("over");
    expect(r.remaining).toBe(-toPaise(1_000));
    expect(r.perDay).toBe(0);
  });

  it("can't say anything before income is logged", () => {
    const r = safeToSpend({ ...base, income: 0, spent: toPaise(500), daysLeft: 10 });
    expect(r.status).toBe("no-income");
    expect(r.used).toBe(Infinity);
  });
});
