import type { Paise } from "@/lib/money";

/**
 * Financial health score, 0–100, from five pillars. Pillars without data
 * (no income yet, no budgets) are left out and the rest re-weighted, so a new
 * user isn't punished for what the app doesn't know.
 */

export type PillarKey = "savings" | "emergency" | "investing" | "debt" | "budgets";

export type Pillar = {
  key: PillarKey;
  label: string;
  weight: number;
  /** 0–1 how close to full marks. Null when there's no data. */
  ratio: number | null;
  /** The measured value, formatted for people ("24%", "3.1 months"). */
  value: string;
  /** What full marks look like. */
  goal: string;
};

export type HealthInput = {
  income: Paise;
  spent: Paise;
  invested: Paise;
  /** Cash (bank, cash, wallets) plus emergency-fund holdings at month end. */
  liquid: Paise;
  avgEssentialMonthly: Paise;
  emergencyMonthsTarget: number;
  /** Sum of EMIs due that month. */
  emis: Paise;
  budgets: { limit: Paise; spent: Paise }[];
};

export type Health = {
  score: number;
  grade: "A" | "B" | "C" | "D";
  pillars: Pillar[];
  /** Fewer than 3 pillars had data (e.g. no income logged yet): the score is a rough early read. */
  provisional: boolean;
};

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function healthScore(i: HealthInput): Health {
  const hasIncome = i.income > 0;
  const savingsRate = hasIncome ? (i.income - i.spent) / i.income : null;
  const investRate = hasIncome ? Math.max(0, i.invested) / i.income : null;
  const months = i.avgEssentialMonthly > 0 ? i.liquid / i.avgEssentialMonthly : null;
  const emiRatio = hasIncome ? i.emis / i.income : null;
  const kept = i.budgets.filter((b) => b.spent <= b.limit).length;

  const pillars: Pillar[] = [
    {
      key: "savings",
      label: "Savings rate",
      weight: 30,
      ratio: savingsRate === null ? null : clamp(savingsRate / 0.3),
      value: savingsRate === null ? "No income yet" : pct(savingsRate),
      goal: "Save 30% or more of what you earn",
    },
    {
      key: "emergency",
      label: "Emergency cushion",
      weight: 25,
      ratio: months === null ? null : clamp(months / i.emergencyMonthsTarget),
      value: months === null ? "Not enough history" : `${months.toFixed(1)} months`,
      goal: `${i.emergencyMonthsTarget} months of essential spending in cash or your emergency fund`,
    },
    {
      key: "investing",
      label: "Investing",
      weight: 20,
      ratio: investRate === null ? null : clamp(investRate / 0.2),
      value: investRate === null ? "No income yet" : pct(investRate),
      goal: "Invest 20% or more of what you earn",
    },
    {
      key: "debt",
      label: "Debt load",
      weight: 15,
      // Full marks up to 10% of income on EMIs, nothing at 50%+.
      ratio: emiRatio === null ? (i.emis === 0 ? null : 0) : clamp((0.5 - emiRatio) / 0.4),
      value: emiRatio === null ? "No income yet" : i.emis === 0 ? "No EMIs" : `${pct(emiRatio)} of income on EMIs`,
      goal: "EMIs at 10% of income or less",
    },
    {
      key: "budgets",
      label: "Budgets kept",
      weight: 10,
      ratio: i.budgets.length === 0 ? null : kept / i.budgets.length,
      value: i.budgets.length === 0 ? "No budgets set" : `${kept} of ${i.budgets.length}`,
      goal: "Stay within every budget",
    },
  ];

  const counted = pillars.filter((p) => p.ratio !== null);
  const totalWeight = counted.reduce((s, p) => s + p.weight, 0);
  const score =
    totalWeight === 0 ? 0 : Math.round((counted.reduce((s, p) => s + p.weight * p.ratio!, 0) / totalWeight) * 100);
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
  return { score, grade, pillars, provisional: counted.length < 3 };
}
