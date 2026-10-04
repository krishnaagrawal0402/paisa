/**
 * Financial months follow payday. With month_start_day = 28, "October 2026"
 * runs 28 Sep → 27 Oct. Dates are plain YYYY-MM-DD strings (no time zones).
 */

export type FinancialMonth = {
  /** Calendar month the period is named after, as YYYY-MM. */
  key: string;
  /** First day, inclusive. */
  start: string;
  /** Last day, inclusive. */
  end: string;
  label: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};
const monthName = (y: number, m: number, style: "long" | "short") =>
  new Intl.DateTimeFormat("en-IN", { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));

/** The financial month named `key` (YYYY-MM). */
export function financialMonthFromKey(key: string, startDay: number): FinancialMonth {
  const [y, m] = key.split("-").map(Number);
  if (startDay <= 1) {
    return { key, start: iso(y, m, 1), end: iso(y, m + 1, 0), label: `${monthName(y, m, "long")} ${y}` };
  }
  // Named after the month it ends in: starts on startDay of the previous month.
  const start = iso(y, m - 1, startDay);
  const end = iso(y, m, startDay - 1);
  const [sy, sm, sd] = start.split("-").map(Number);
  const label = `${sd} ${monthName(sy, sm, "short")} – ${startDay - 1} ${monthName(y, m, "short")} ${y}`;
  return { key, start, end, label };
}

/** The financial month containing `date` (YYYY-MM-DD). */
export function financialMonthFor(date: string, startDay: number): FinancialMonth {
  const [y, m, d] = date.split("-").map(Number);
  const key = startDay > 1 && d >= startDay ? iso(y, m + 1, 1).slice(0, 7) : `${y}-${pad(m)}`;
  return financialMonthFromKey(key, startDay);
}

/** Shift a YYYY-MM key by `delta` months. */
export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  return iso(y, m + delta, 1).slice(0, 7);
}

/** Today's date as YYYY-MM-DD in the given IANA time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Days remaining in the month, including `today`. */
export function daysLeft(month: FinancialMonth, today: string): number {
  const ms = Date.parse(`${month.end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}

/** Add `days` to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return iso(y, m, d + days);
}

/** The next date on or after `today` that falls on `day` (1–28) of a month. */
export function nextDayOfMonth(today: string, day: number): string {
  const [y, m, d] = today.split("-").map(Number);
  return d <= day ? iso(y, m, day) : iso(y, m + 1, day);
}

/** 1 → "1st", 22 → "22nd". */
export function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
}
