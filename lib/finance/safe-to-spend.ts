import type { Paise } from "@/lib/money";

export type SafeToSpendInput = {
  /** Income received so far this financial month. */
  income: Paise;
  /** Expenses so far this financial month. */
  spent: Paise;
  /** Share of income to keep aside, 0–100. */
  savingsTargetPct: number;
  /** Bills still due this month (recurring, from M3). */
  committed?: Paise;
  /** Days in the financial month, and days left including today. */
  daysTotal: number;
  daysLeft: number;
};

export type SafeToSpend = {
  status: "no-income" | "on-track" | "tight" | "over";
  /** What can be spent this month after savings and commitments. */
  spendable: Paise;
  /** spendable − spent (negative when over). */
  remaining: Paise;
  /** remaining spread over the days left; 0 when over. */
  perDay: Paise;
  /** spent / spendable, for the meter (can exceed 1). */
  used: number;
  /** How far through the month we are, 0–1, for the pace marker. */
  elapsed: number;
};

/**
 * "How much can I spend per day and still hit my savings target?"
 * spendable = income − savings target − commitments; perDay = (spendable − spent) / days left.
 */
export function safeToSpend({
  income,
  spent,
  savingsTargetPct,
  committed = 0,
  daysTotal,
  daysLeft,
}: SafeToSpendInput): SafeToSpend {
  const elapsed = daysTotal > 0 ? Math.min(1, Math.max(0, (daysTotal - daysLeft + 1) / daysTotal)) : 1;
  const spendable = Math.max(0, income - Math.round((income * savingsTargetPct) / 100) - committed);
  const remaining = spendable - spent;
  const perDay = remaining > 0 && daysLeft > 0 ? Math.floor(remaining / daysLeft / 100) * 100 : 0;
  const used = spendable > 0 ? spent / spendable : spent > 0 ? Infinity : 0;

  let status: SafeToSpend["status"];
  if (income <= 0) status = "no-income";
  else if (remaining < 0) status = "over";
  // Pace vs the calendar would misfire on rent paid early in the month, so until
  // recurring bills are known (M3) only warn when the budget is nearly gone.
  else if (remaining < spendable * 0.15) status = "tight";
  else status = "on-track";

  return { status, spendable, remaining, perDay, used, elapsed };
}
