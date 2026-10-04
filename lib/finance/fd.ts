import type { Paise } from "@/lib/money";

export type Compounding = "monthly" | "quarterly" | "half_yearly" | "yearly" | "simple";

const PERIODS: Record<Exclude<Compounding, "simple">, number> = {
  monthly: 12,
  quarterly: 4,
  half_yearly: 2,
  yearly: 1,
};

const days = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

/**
 * Value of a fixed deposit on `asOf`. Indian bank FDs usually compound
 * quarterly. After maturity the value stays at the maturity amount.
 */
export function fdValue(
  principal: Paise,
  ratePct: number,
  start: string,
  asOf: string,
  compounding: Compounding = "quarterly",
  maturity?: string | null,
): Paise {
  const end = maturity && maturity < asOf ? maturity : asOf;
  if (end <= start) return principal;
  const years = days(start, end) / 365;
  const r = ratePct / 100;
  const factor =
    compounding === "simple" ? 1 + r * years : (1 + r / PERIODS[compounding]) ** (PERIODS[compounding] * years);
  return Math.round(principal * factor);
}
