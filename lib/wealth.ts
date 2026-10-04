import "server-only";
import { cache } from "react";
import { getAccounts, getToday, postDueRecurring } from "@/lib/data";
import { positionAt, type Holding, type HoldingFlow, type NavHistory, type Position } from "@/lib/finance/holdings";
import { loanStatus, type LoanStatus, type LoanTerms } from "@/lib/finance/loan";
import { navHistories } from "@/lib/mf";
import { addDays } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";
import type { AccountWithBalance } from "@/lib/types";

export type Loan = LoanTerms & { id: string; name: string; lender: string | null; archived: boolean };

export const getHoldings = cache(async (): Promise<Holding[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("holdings")
    .select(
      "id, name, asset_class, scheme_code, opening_units, opening_cost, opening_date, manual_value, manual_value_at, fd_rate, fd_start, fd_maturity, fd_compounding, platform, archived",
    )
    .order("sort")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((h) => ({
    ...h,
    opening_units: Number(h.opening_units),
    opening_cost: Number(h.opening_cost),
    manual_value: h.manual_value === null ? null : Number(h.manual_value),
    fd_rate: h.fd_rate === null ? null : Number(h.fd_rate),
  }));
});

export const getHoldingFlows = cache(async (): Promise<HoldingFlow[]> => {
  await postDueRecurring(); // SIPs post as invest transactions
  const supabase = await createClient();
  const flows: HoldingFlow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("transactions")
      .select("holding_id, type, amount, occurred_on, units")
      .in("type", ["invest", "redeem"])
      .order("occurred_on")
      .range(offset, offset + 999);
    if (error) throw error;
    flows.push(
      ...(data ?? []).map((f) => ({
        holding_id: f.holding_id as string,
        type: f.type as "invest" | "redeem",
        amount: Number(f.amount),
        occurred_on: f.occurred_on,
        units: f.units === null ? null : Number(f.units),
      })),
    );
    if (!data || data.length < 1000) break;
  }
  return flows;
});

export const getLoans = cache(async (): Promise<Loan[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("loans")
    .select(
      "id, name, lender, principal, annual_rate, tenure_months, first_emi_date, emi, outstanding_override, override_at, archived",
    )
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((l) => ({
    ...l,
    principal: Number(l.principal),
    annual_rate: Number(l.annual_rate),
    emi: Number(l.emi),
    outstanding_override: l.outstanding_override === null ? null : Number(l.outstanding_override),
  }));
});

export type HoldingView = Holding & { position: Position };
export type LoanView = Loan & { status: LoanStatus };
export type WealthPoint = { date: string; assets: number; liabilities: number; net: number };

export type Wealth = {
  accounts: AccountWithBalance[];
  holdings: HoldingView[];
  loans: LoanView[];
  totals: { cash: number; cardsDue: number; investments: number; invested: number; loans: number; net: number };
  history: WealthPoint[];
};

function totalsFor(
  balances: number[],
  positions: Position[],
  loanBalances: number[],
): Pick<Wealth["totals"], "cash" | "cardsDue" | "investments" | "invested" | "loans" | "net"> {
  const cash = balances.reduce((s, b) => s + Math.max(0, b), 0);
  const cardsDue = balances.reduce((s, b) => s + Math.max(0, -b), 0);
  const investments = positions.reduce((s, p) => s + p.value, 0);
  const invested = positions.reduce((s, p) => s + p.invested, 0);
  const loans = loanBalances.reduce((s, b) => s + b, 0);
  return { cash, cardsDue, investments, invested, loans, net: cash + investments - cardsDue - loans };
}

const monthEnd = (date: string, back: number) => {
  const [y, m] = date.split("-").map(Number);
  return addDays(`${new Date(Date.UTC(y, m - back, 1)).toISOString().slice(0, 7)}-01`, -1);
};

/**
 * Everything the Wealth page needs. History (12 month-ends + today) is rebuilt
 * from transactions, NAV history, FD maths and loan schedules.
 */
export const getWealth = cache(async ({ withHistory = true }: { withHistory?: boolean } = {}): Promise<Wealth> => {
  const today = getToday();
  const [accounts, holdings, flows, loans] = await Promise.all([
    getAccounts({ includeArchived: true }),
    getHoldings(),
    getHoldingFlows(),
    getLoans(),
  ]);
  const navs = await navHistories(holdings.filter((h) => h.scheme_code !== null).map((h) => h.scheme_code!));
  const nav = (h: Holding): NavHistory | undefined => (h.scheme_code ? navs.get(h.scheme_code) : undefined);

  const holdingViews = holdings.map((h) => ({ ...h, position: positionAt(h, flows, today, nav(h)) }));
  const loanViews = loans.map((l) => ({ ...l, status: loanStatus(l, today) }));
  const totals = totalsFor(
    accounts.map((a) => a.balance),
    holdingViews.map((h) => h.position),
    loanViews.filter((l) => !l.archived).map((l) => l.status.outstanding),
  );

  let history: WealthPoint[] = [];
  if (withHistory) {
    const dates = [...Array.from({ length: 12 }, (_, i) => monthEnd(today, 11 - i)), today];
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("account_balances_at", { p_dates: dates });
    if (error) throw error;
    const rows = (data ?? []) as { on_date: string; balance: number }[];
    history = dates.map((date) => {
      const t = totalsFor(
        rows.filter((r) => r.on_date === date).map((r) => Number(r.balance)),
        holdings.map((h) => positionAt(h, flows, date, nav(h))),
        loans
          .filter((l) => !l.archived)
          .map((l) => (l.first_emi_date > addDays(date, 31) ? 0 : loanStatus(l, date).outstanding)),
      );
      return { date, assets: t.cash + t.investments, liabilities: t.cardsDue + t.loans, net: t.net };
    });
  }

  return { accounts, holdings: holdingViews, loans: loanViews, totals, history };
});
