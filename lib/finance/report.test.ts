import { describe, expect, it } from "vitest";
import { toPaise } from "@/lib/money";
import { healthScore } from "./health";
import { insights } from "./insights";

const base = {
  income: toPaise(1_00_000),
  spent: toPaise(70_000),
  invested: toPaise(10_000),
  liquid: toPaise(1_50_000),
  avgEssentialMonthly: toPaise(25_000),
  emergencyMonthsTarget: 6,
  emis: 0,
  budgets: [] as { limit: number; spent: number }[],
};

describe("healthScore", () => {
  it("weights the pillars and re-normalises when some have no data", () => {
    // savings 30% → 1.0, emergency 6 months → 1.0, investing 10% → 0.5, debt none → 1.0; budgets excluded.
    const h = healthScore(base);
    expect(h.pillars.find((p) => p.key === "budgets")?.ratio).toBeNull();
    expect(h.score).toBe(Math.round(((30 + 25 + 10 + 15) / 90) * 100));
    expect(h.grade).toBe("A");
    expect(h.provisional).toBe(false);
  });

  it("scores debt load linearly between 10% and 50% of income", () => {
    const ratio = (emis: number) =>
      healthScore({ ...base, emis: toPaise(emis) }).pillars.find((p) => p.key === "debt")!.ratio;
    expect(ratio(10_000)).toBe(1);
    expect(ratio(30_000)).toBeCloseTo(0.5);
    expect(ratio(60_000)).toBe(0);
  });

  it("counts budgets kept and never goes below zero on overspending", () => {
    const h = healthScore({
      ...base,
      spent: toPaise(1_20_000),
      budgets: [
        { limit: 100, spent: 50 },
        { limit: 100, spent: 150 },
      ],
    });
    expect(h.pillars.find((p) => p.key === "savings")!.ratio).toBe(0);
    expect(h.pillars.find((p) => p.key === "budgets")!.value).toBe("1 of 2");
  });

  it("handles a brand-new user with no data", () => {
    const h = healthScore({ ...base, income: 0, spent: 0, invested: 0, liquid: 0, avgEssentialMonthly: 0 });
    expect(h.score).toBe(0);
    expect(h.pillars.every((p) => p.ratio === null)).toBe(true);
    expect(h.provisional).toBe(true);
  });

  it("marks an early-month score with no income as provisional", () => {
    const h = healthScore({
      ...base,
      income: 0,
      spent: toPaise(1_000),
      invested: 0,
      budgets: [{ limit: 100, spent: 50 }],
    });
    // Only the cushion and budgets can be scored.
    expect(h.pillars.filter((p) => p.ratio !== null).map((p) => p.key)).toEqual(["emergency", "budgets"]);
    expect(h.provisional).toBe(true);
  });

  it("is provisional before the salary lands, even with EMIs and budgets scored", () => {
    const h = healthScore({
      ...base,
      income: 0,
      invested: 0,
      emis: toPaise(12_000),
      budgets: [{ limit: 100, spent: 50 }],
    });
    expect(h.pillars.filter((p) => p.ratio !== null).length).toBe(3);
    expect(h.provisional).toBe(true);
  });

  it("grades at the documented thresholds", () => {
    const grade = (spent: number) => healthScore({ ...base, invested: toPaise(20_000), spent: toPaise(spent) }).grade;
    expect(grade(70_000)).toBe("A");
    expect(grade(100_000)).not.toBe("A");
  });
});

describe("insights", () => {
  const input = {
    categories: [
      { name: "Food & Dining", emoji: "🍔", spent: toPaise(11_000), typical: toPaise(8_000) },
      { name: "Shopping", emoji: "🛍️", spent: toPaise(2_000), typical: toPaise(6_000) },
      { name: "Chai", emoji: "☕", spent: toPaise(900), typical: toPaise(300) },
    ],
    savingsRates: [0.1, 0.35, 0.32, 0.4],
    subscriptionsMonthly: toPaise(1_200),
    noSpendDays: 7,
    daysInMonth: 31,
  };

  it("spots big jumps (not tiny ones), drops, streaks and subscriptions", () => {
    const texts = insights(input).map((i) => i.text);
    expect(texts[0]).toBe("Food & Dining is 38% above your usual (₹11K vs ₹8K).");
    expect(texts).toContain("You spent ₹4K less than usual on Shopping.");
    expect(texts).toContain("3 months in a row saving 30% or more.");
    expect(texts.some((t) => t.startsWith("Subscriptions cost ₹1.2K a month"))).toBe(true);
    expect(texts.join(" ")).not.toContain("Chai");
    expect(texts.length).toBeLessThanOrEqual(4);
  });

  it("warns when spending beat income", () => {
    const texts = insights({
      ...input,
      savingsRates: [0.2, -0.1],
      categories: [],
      subscriptionsMonthly: 0,
      noSpendDays: 0,
    }).map((i) => i.text);
    expect(texts).toEqual(["You spent more than you earned this month."]);
  });
});
