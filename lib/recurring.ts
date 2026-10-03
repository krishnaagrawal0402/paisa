import type { Paise } from "@/lib/money";
import type { RecurringFrequency } from "@/lib/types";

/**
 * Date maths for recurring rules. Mirrors private.next_occurrence() in
 * supabase/migrations/20261004030000_recurring.sql: steps count from the
 * anchor, so a 31st rule clamps to 30th/28th and returns to the 31st.
 */

function parts(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function fmt(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The k-th occurrence after the anchor (k = 0 is the anchor itself). */
export function occurrence(frequency: RecurringFrequency, anchor: string, k: number): string {
  const { y, m, d } = parts(anchor);
  if (frequency === "weekly") {
    const date = new Date(Date.UTC(y, m - 1, d + 7 * k));
    return date.toISOString().slice(0, 10);
  }
  const months = frequency === "monthly" ? k : 12 * k;
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return fmt(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

/** First occurrence strictly after `after` (or the anchor, if it's later). */
export function nextOccurrence(frequency: RecurringFrequency, anchor: string, after: string): string {
  if (anchor > after) return anchor;
  for (let k = 1; ; k++) {
    const date = occurrence(frequency, anchor, k);
    if (date > after) return date;
  }
}

/** Occurrences from `from` (inclusive, must itself be an occurrence or the next due) up to `to` (inclusive). */
export function occurrencesUntil(
  rule: { frequency: RecurringFrequency; anchor_date: string; next_due: string; end_date: string | null },
  to: string,
): string[] {
  const dates: string[] = [];
  let due = rule.next_due;
  while (due <= to && (!rule.end_date || due <= rule.end_date) && dates.length < 400) {
    dates.push(due);
    due = nextOccurrence(rule.frequency, rule.anchor_date, due);
  }
  return dates;
}

/** What a rule costs (or earns) per month on average. */
export function monthlyEquivalent(amount: Paise, frequency: RecurringFrequency): Paise {
  if (frequency === "weekly") return Math.round((amount * 52) / 12);
  if (frequency === "yearly") return Math.round(amount / 12);
  return amount;
}

/** "1 Oct" */
export function formatDue(date: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
