import type { Paise } from "@/lib/money";

/** Standard reducing-balance EMI. */
export function emiFor(principal: Paise, annualRatePct: number, months: number): Paise {
  const r = annualRatePct / 1200;
  if (r === 0) return Math.ceil(principal / months);
  const f = (1 + r) ** months;
  return Math.round((principal * r * f) / (f - 1));
}

export type LoanTerms = {
  principal: Paise;
  annual_rate: number;
  tenure_months: number;
  first_emi_date: string;
  emi: Paise;
  outstanding_override: Paise | null;
  override_at: string | null;
};

export type LoanStatus = {
  outstanding: Paise;
  emisPaid: number;
  emisLeft: number;
  /** Date of the last EMI at the current pace (null if already paid off). */
  payoffDate: string | null;
  interestLeft: Paise;
};

function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const dim = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, "0")}-${String(Math.min(d, dim)).padStart(2, "0")}`;
}

/** EMIs falling due on or before `asOf`, counting from `first`. */
function emisBy(first: string, asOf: string): number {
  if (asOf < first) return 0;
  let n = 0;
  while (addMonths(first, n) <= asOf) n++;
  return n;
}

/**
 * Where a loan stands on `asOf`, assuming every EMI was paid on its date.
 * A prepayment is recorded as an override (the outstanding on a date); the
 * schedule continues from there with the same EMI.
 */
export function loanStatus(loan: LoanTerms, asOf: string): LoanStatus {
  const r = loan.annual_rate / 1200;
  const useOverride = loan.outstanding_override !== null && loan.override_at !== null && loan.override_at <= asOf;
  let balance = useOverride ? loan.outstanding_override! : loan.principal;
  // Next EMI after the anchor point.
  const anchorPaid = useOverride ? emisBy(loan.first_emi_date, loan.override_at!) : 0;
  const totalPaid = emisBy(loan.first_emi_date, asOf);

  for (let i = anchorPaid; i < totalPaid && balance > 0; i++) {
    balance = Math.max(0, Math.round(balance * (1 + r)) - loan.emi);
  }

  // Remaining schedule.
  let remaining = balance;
  let left = 0;
  let interest = 0;
  while (remaining > 0 && left < 1200) {
    const due = Math.round(remaining * r);
    interest += due;
    remaining = Math.max(0, remaining + due - loan.emi);
    left++;
  }
  return {
    outstanding: balance,
    emisPaid: totalPaid,
    emisLeft: left,
    payoffDate: left > 0 ? addMonths(loan.first_emi_date, totalPaid + left - 1) : null,
    interestLeft: interest,
  };
}
