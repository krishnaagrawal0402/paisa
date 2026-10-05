import { fdValue, type Compounding } from "@/lib/finance/fd";
import { xirr } from "@/lib/finance/xirr";
import type { Paise } from "@/lib/money";

export type AssetClass = "mutual_fund" | "stock" | "fd" | "ppf" | "epf" | "nps" | "gold" | "crypto" | "other";

export type Holding = {
  id: string;
  name: string;
  asset_class: AssetClass;
  scheme_code: number | null;
  opening_units: number;
  opening_cost: Paise;
  opening_date: string | null;
  manual_value: Paise | null;
  manual_value_at: string | null;
  fd_rate: number | null;
  fd_start: string | null;
  fd_maturity: string | null;
  fd_compounding: Compounding | null;
  /** Where it's held: "Kotak Neo", "ICICI iMobile". Free text, optional. */
  platform: string | null;
  /** Individual stocks: priced automatically when set (opening_units = shares). */
  isin: string | null;
  ticker: string | null;
  archived: boolean;
};

export type HoldingFlow = {
  holding_id: string;
  type: "invest" | "redeem";
  amount: Paise;
  occurred_on: string;
  units: number | null;
};

/** Price history, oldest first: [YYYY-MM-DD, price in rupees]. A fund's NAV or a stock's close. */
export type NavHistory = [string, number][];

/** Latest NAV on or before `date` (binary search), or null before the fund existed. */
export function navAt(history: NavHistory | undefined, date: string): number | null {
  if (!history?.length || history[0][0] > date) return null;
  let lo = 0;
  let hi = history.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (history[mid][0] <= date) lo = mid;
    else hi = mid - 1;
  }
  return history[lo][1];
}

export type Position = {
  units: number;
  /** Net money put in: opening cost + investments − redemptions. */
  invested: Paise;
  value: Paise;
  gain: Paise;
  /** Annualised return, or null when there isn't enough history. */
  xirr: number | null;
  /** True when the value is an estimate (no price yet, or a stale manual value). */
  estimated: boolean;
};

export const ASSET_CLASSES: Record<AssetClass, { label: string; emoji: string; manual: boolean }> = {
  mutual_fund: { label: "Mutual fund", emoji: "📈", manual: false },
  stock: { label: "Stocks", emoji: "📊", manual: true },
  fd: { label: "Fixed deposit", emoji: "🏦", manual: false },
  ppf: { label: "PPF", emoji: "🛡️", manual: true },
  epf: { label: "EPF", emoji: "🧾", manual: true },
  nps: { label: "NPS", emoji: "🧓", manual: true },
  gold: { label: "Gold", emoji: "🪙", manual: true },
  crypto: { label: "Crypto", emoji: "🪙", manual: true },
  other: { label: "Other", emoji: "💼", manual: true },
};

/** Mutual funds and individual stocks are worth units × market price; everything else is computed or typed in. */
export function isPriced(holding: Pick<Holding, "asset_class" | "isin">): boolean {
  return holding.asset_class === "mutual_fund" || (holding.asset_class === "stock" && Boolean(holding.isin));
}

/** Whose value you update by hand (a stock portfolio total, PPF, EPF, gold…). */
export function isManual(holding: Pick<Holding, "asset_class" | "isin">): boolean {
  return ASSET_CLASSES[holding.asset_class].manual && !isPriced(holding);
}

/** What a holding is worth on `asOf`, from its opening position, flows, and prices. */
export function positionAt(holding: Holding, flows: HoldingFlow[], asOf: string, nav?: NavHistory): Position {
  const opened = !holding.opening_date || holding.opening_date <= asOf;
  const mine = flows.filter((f) => f.holding_id === holding.id && f.occurred_on <= asOf);
  const priced = isPriced(holding);

  let units = opened ? holding.opening_units : 0;
  let invested = opened ? holding.opening_cost : 0;
  let estimated = false;
  const cashflows: { date: string; amount: number }[] = [];
  if (opened && holding.opening_cost > 0) {
    cashflows.push({ date: holding.opening_date ?? holding.fd_start ?? asOf, amount: -holding.opening_cost });
  }

  for (const f of mine) {
    const sign = f.type === "invest" ? 1 : -1;
    invested += sign * f.amount;
    cashflows.push({ date: f.occurred_on, amount: -sign * f.amount });
    if (priced) {
      // Units entered by hand win; otherwise use that day's price.
      const price = navAt(nav, f.occurred_on);
      const u = f.units ?? (price ? f.amount / 100 / price : 0);
      if (!f.units && !price) estimated = true;
      units += sign * u;
    }
  }

  let value: Paise;
  if (priced) {
    const price = navAt(nav, asOf);
    if (price) value = Math.round(Math.max(0, units) * price * 100);
    else {
      value = Math.max(0, invested);
      estimated = true;
    }
  } else if (holding.asset_class === "fd" && holding.fd_rate !== null && holding.fd_start) {
    value =
      holding.fd_start <= asOf
        ? fdValue(
            Math.max(0, invested),
            holding.fd_rate,
            holding.fd_start,
            asOf,
            holding.fd_compounding ?? "quarterly",
            holding.fd_maturity,
          )
        : 0;
  } else if (holding.manual_value !== null && holding.manual_value_at && holding.manual_value_at <= asOf) {
    // Later investments are added on top of the last known value.
    const after = mine.filter((f) => f.occurred_on > holding.manual_value_at!);
    value = holding.manual_value + after.reduce((s, f) => s + (f.type === "invest" ? f.amount : -f.amount), 0);
    estimated = Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${holding.manual_value_at}T00:00:00Z`) > 45 * 86_400_000;
  } else {
    value = Math.max(0, invested);
    estimated = true;
  }

  value = Math.max(0, value);
  return {
    units,
    invested,
    value,
    gain: value - invested,
    xirr: value > 0 ? xirr([...cashflows, { date: asOf, amount: value }]) : null,
    estimated,
  };
}
