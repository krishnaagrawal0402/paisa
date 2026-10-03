/**
 * Money helpers. All amounts in the app are integer **paise** (₹1 = 100 paise).
 * Postgres stores them as bigint; JSON gives us numbers, which are exact up to
 * ₹90 trillion, so plain `number` is safe here.
 */
export type Paise = number;

export function toPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

export function toRupees(paise: Paise): number {
  return paise / 100;
}

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrExact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type FormatOptions = {
  /** Prefix positive amounts with "+" (for deltas and income rows). */
  sign?: boolean;
  /** Always show paise. By default paise are shown only when non-zero. */
  exact?: boolean;
};

/** ₹1,50,000 · ₹1,250.50 · -₹12,34,567 (Indian digit grouping). */
export function formatINR(paise: Paise, { sign = false, exact = false }: FormatOptions = {}): string {
  const rupees = paise / 100;
  const formatter = exact || paise % 100 !== 0 ? inrExact : inrWhole;
  const text = formatter.format(rupees);
  return sign && paise > 0 ? `+${text}` : text;
}

const COMPACT_UNITS = [
  { min: 1_00_00_000, suffix: "Cr" },
  { min: 1_00_000, suffix: "L" },
  { min: 1_000, suffix: "K" },
] as const;

/** ₹2.1Cr · ₹1.5L · ₹12K · ₹950. For tight spots like chart axes and chips. */
export function formatCompactINR(paise: Paise, { sign = false }: Pick<FormatOptions, "sign"> = {}): string {
  const rupees = Math.abs(paise) / 100;
  const prefix = paise < 0 ? "-" : sign && paise > 0 ? "+" : "";
  const unit = COMPACT_UNITS.find((u) => rupees >= u.min);
  if (!unit) return `${prefix}₹${Math.round(rupees)}`;
  // Divide by a tenth of the unit first so 2.15Cr rounds to 2.2, not 2.1 (float drift).
  const value = Math.round(rupees / (unit.min / 10)) / 10;
  return `${prefix}₹${value.toString()}${unit.suffix}`;
}
