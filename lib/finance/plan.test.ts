import { describe, expect, it } from "vitest";
import { toPaise } from "@/lib/money";
import { budgetStatus, emergencyTarget, goalProgress } from "./plan";

describe("budgetStatus", () => {
  const limit = toPaise(10_000);

  it("is ok well under the limit", () => {
    expect(budgetStatus(limit, toPaise(3_000), 0.5)).toMatchObject({
      status: "ok",
      left: toPaise(7_000),
      projected: toPaise(6_000),
    });
  });

  it("warns at 80% and past 100%", () => {
    expect(budgetStatus(limit, toPaise(8_000), 0.9).status).toBe("near");
    expect(budgetStatus(limit, toPaise(10_500), 0.9)).toMatchObject({ status: "over", left: -toPaise(500) });
  });

  it("flags spending on pace to overshoot, but not in the first fifth of the month", () => {
    expect(budgetStatus(limit, toPaise(5_000), 0.3).status).toBe("pace");
    expect(budgetStatus(limit, toPaise(5_000), 0.1)).toMatchObject({ status: "ok", projected: null });
  });
});

describe("goalProgress", () => {
  const base = { target: toPaise(1_20_000), today: "2026-10-04", targetDate: null, monthlyPace: 0 };

  it("works out what to save each month to hit a date", () => {
    const g = goalProgress({ ...base, current: toPaise(60_000), targetDate: "2027-04-04" });
    expect(g).toMatchObject({
      reached: false,
      share: 0.5,
      remaining: toPaise(60_000),
      monthlyNeeded: toPaise(10_000),
      overdue: false,
    });
  });

  it("projects an ETA from the recent saving pace", () => {
    expect(goalProgress({ ...base, current: toPaise(20_000), monthlyPace: toPaise(25_000) }).eta).toBe("2027-02-01");
  });

  it("knows when it's reached or overdue", () => {
    expect(goalProgress({ ...base, current: toPaise(1_30_000) })).toMatchObject({
      reached: true,
      share: 1,
      remaining: 0,
      eta: null,
    });
    expect(goalProgress({ ...base, current: toPaise(10_000), targetDate: "2026-09-01" }).overdue).toBe(true);
  });
});

describe("emergencyTarget", () => {
  it("rounds months × essential spend up to the next ₹1,000", () => {
    expect(emergencyTarget(toPaise(41_234), 6)).toBe(toPaise(2_48_000));
  });
});
