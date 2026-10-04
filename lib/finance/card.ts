import type { Paise } from "@/lib/money";

/**
 * Credit card billing cycle. Each month the bank closes a statement on the
 * statement day; what you owed then is the bill, due on the next due day.
 * Payments made after the statement reduce what's left to pay. Spending after
 * the statement belongs to the next bill. Days 29–31 mean the month's last day
 * in shorter months.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Day `day` of month `m` (1-based, may overflow into other years), clamped to that month's length. */
function dayOf(y: number, m: number, day: number): string {
  const first = new Date(Date.UTC(y, m - 1, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(day, last))}`;
}

/** The most recent statement date on or before `today`. */
export function lastStatementDate(today: string, statementDay: number): string {
  const [y, m] = today.split("-").map(Number);
  const thisMonth = dayOf(y, m, statementDay);
  return thisMonth <= today ? thisMonth : dayOf(y, m - 1, statementDay);
}

/** When a statement must be paid: the first due day after the statement date. */
export function dueDateAfter(statementDate: string, dueDay: number): string {
  const [y, m] = statementDate.split("-").map(Number);
  const sameMonth = dayOf(y, m, dueDay);
  return sameMonth > statementDate ? sameMonth : dayOf(y, m + 1, dueDay);
}

export type CardBill = {
  statementDate: string;
  dueDate: string;
  /** What the last statement asked for (0 if nothing was owed). */
  billed: Paise;
  /** Still to pay on that statement. */
  due: Paise;
  status: "none" | "paid" | "due" | "overdue";
};

export function cardBill({
  today,
  statementDay,
  dueDay,
  owedAtStatement,
  paidSince,
}: {
  today: string;
  statementDay: number;
  dueDay: number;
  /** Amount owed on the statement date (positive = you owe). */
  owedAtStatement: Paise;
  /** Payments and refunds credited to the card after the statement date. */
  paidSince: Paise;
}): CardBill {
  const statementDate = lastStatementDate(today, statementDay);
  const dueDate = dueDateAfter(statementDate, dueDay);
  const billed = Math.max(0, owedAtStatement);
  const due = Math.max(0, billed - Math.max(0, paidSince));
  const status = billed === 0 ? "none" : due === 0 ? "paid" : dueDate < today ? "overdue" : "due";
  return { statementDate, dueDate, billed, due, status };
}

/** Share of the credit limit in use, 0–1+ (null without a limit). Above 30% can weigh on a credit score. */
export function utilisation(owed: Paise, limit: Paise | null): number | null {
  if (!limit || limit <= 0) return null;
  return Math.max(0, owed) / limit;
}
