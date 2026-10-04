import type { Paise } from "@/lib/money";

// ─── budgets ─────────────────────────────────────────────────────────────────

export type BudgetStatus = {
  status: "ok" | "pace" | "near" | "over";
  /** spent / limit (can exceed 1). */
  used: number;
  left: Paise;
  /** Month-end spend at the current pace; null early in the month when it's just noise. */
  projected: Paise | null;
};

/**
 * Where a category budget stands. `elapsed` is how far through the financial
 * month we are (0–1). Projection waits until a fifth of the month has passed so
 * one early bill doesn't scream "overspending".
 */
export function budgetStatus(limit: Paise, spent: Paise, elapsed: number): BudgetStatus {
  const used = limit > 0 ? spent / limit : 0;
  const projected = elapsed >= 0.2 && elapsed < 1 ? Math.round(spent / elapsed) : null;
  let status: BudgetStatus["status"] = "ok";
  if (spent > limit) status = "over";
  else if (used >= 0.8) status = "near";
  else if (projected !== null && projected > limit * 1.05) status = "pace";
  return { status, used, left: limit - spent, projected };
}

// ─── goals ───────────────────────────────────────────────────────────────────

function monthsUntil(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + (td >= fd ? 0 : -1);
}

function addMonths(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

export type GoalProgress = {
  reached: boolean;
  /** current / target, capped at 1 for display. */
  share: number;
  remaining: Paise;
  /** With a target date: how much to put aside each month to make it. */
  monthlyNeeded: Paise | null;
  /** First of the month the goal is reached at the given monthly pace (null if no pace). */
  eta: string | null;
  /** Target date already passed without reaching it. */
  overdue: boolean;
};

export function goalProgress({
  target,
  current,
  today,
  targetDate,
  monthlyPace,
}: {
  target: Paise;
  current: Paise;
  today: string;
  targetDate: string | null;
  /** Typical monthly saving to project with (e.g. last 3 months' average). */
  monthlyPace: Paise;
}): GoalProgress {
  const remaining = Math.max(0, target - current);
  const reached = remaining === 0;
  const monthsLeft = targetDate ? monthsUntil(today, targetDate) : null;
  return {
    reached,
    share: target > 0 ? Math.min(1, Math.max(0, current / target)) : 0,
    remaining,
    monthlyNeeded:
      !reached && monthsLeft !== null && monthsLeft >= 0
        ? Math.ceil(remaining / Math.max(1, monthsLeft) / 100) * 100
        : null,
    eta: !reached && monthlyPace > 0 ? addMonths(today, Math.ceil(remaining / monthlyPace)) : null,
    overdue: !reached && targetDate !== null && targetDate < today,
  };
}

/** Emergency fund target: N months of essential spending, rounded up to the next ₹1,000. */
export function emergencyTarget(avgEssentialMonthly: Paise, months: number): Paise {
  const raw = avgEssentialMonthly * months;
  return Math.ceil(raw / 1_000_00) * 1_000_00;
}
