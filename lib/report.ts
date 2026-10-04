import "server-only";
import { cache } from "react";
import {
  getAccounts,
  getCashflow,
  getCategories,
  getProfile,
  getRecurringRules,
  getToday,
  getTransactions,
  totalsOf,
  type MonthTotals,
} from "@/lib/data";
import { healthScore, type Health } from "@/lib/finance/health";
import { insights, type Insight } from "@/lib/finance/insights";
import { loanStatus } from "@/lib/finance/loan";
import type { Paise } from "@/lib/money";
import {
  addDays,
  daysLeft,
  financialMonthFor,
  financialMonthFromKey,
  shiftMonthKey,
  type FinancialMonth,
} from "@/lib/month";
import { getPlanData } from "@/lib/plan";
import { monthlyEquivalent } from "@/lib/recurring";
import { createClient } from "@/lib/supabase/server";
import type { Transaction } from "@/lib/types";
import { getLoans, getWealth } from "@/lib/wealth";

export type Report = {
  month: FinancialMonth;
  /** True while the month is still running (numbers are "so far"). */
  inProgress: boolean;
  hasData: boolean;
  totals: MonthTotals;
  health: Health;
  previousScore: number | null;
  topCategories: { name: string; emoji: string; amount: Paise; share: number }[];
  biggestExpense: { note: string; emoji: string; amount: Paise; date: string } | null;
  noSpendDays: number;
  daysCounted: number;
  budgets: { kept: number; total: number };
  insights: Insight[];
};

async function spendBy(from: string, to: string): Promise<Map<string | null, Paise>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("category_spend", { p_from: from, p_to: to });
  if (error) throw error;
  return new Map(
    ((data ?? []) as { category_id: string | null; total: number }[]).map((r) => [r.category_id, Number(r.total)]),
  );
}

async function liquidAt(date: string, accountIds: Set<string>): Promise<Paise> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("account_balances_at", { p_dates: [date] });
  if (error) throw error;
  return ((data ?? []) as { account_id: string; balance: number }[])
    .filter((r) => accountIds.has(r.account_id))
    .reduce((s, r) => s + Math.max(0, Number(r.balance)), 0);
}

/** Score + numbers for one financial month (YYYY-MM). */
async function monthHealth(key: string) {
  const [profile, categories, accounts, loans, plan, wealth] = await Promise.all([
    getProfile(),
    getCategories({ includeArchived: true }),
    getAccounts({ includeArchived: true }),
    getLoans(),
    getPlanData(),
    getWealth({ withHistory: false }),
  ]);
  const month = financialMonthFromKey(key, profile.monthStartDay);
  const today = getToday();
  const asOf = month.end < today ? month.end : today;
  const before = {
    start: financialMonthFromKey(shiftMonthKey(key, -3), profile.monthStartDay).start,
    end: addDays(month.start, -1),
  };

  const [transactions, spend, prior] = await Promise.all([
    getTransactions({ from: month.start, to: month.end }),
    spendBy(month.start, month.end),
    spendBy(before.start, before.end),
  ]);
  const totals = totalsOf(transactions);

  // Emergency cushion: cash-like accounts at month end, plus investments linked to the emergency fund (current value).
  const cashIds = new Set(accounts.filter((a) => a.type !== "credit_card").map((a) => a.id));
  const emergency = plan.goals.find((g) => g.kind === "emergency");
  const emergencyHoldings = (emergency?.sources ?? [])
    .filter((s) => s.holding_id)
    .reduce((sum, s) => sum + (wealth.holdings.find((h) => h.id === s.holding_id)?.position.value ?? 0), 0);
  const liquid = (await liquidAt(asOf, cashIds)) + emergencyHoldings;

  const essential = new Set(categories.filter((c) => c.is_essential).map((c) => c.id));
  const avgEssentialMonthly = Math.round(
    [...prior].reduce((s, [id, v]) => s + (id && essential.has(id) ? v : 0), 0) / 3,
  );

  // EMIs due in the month for loans not yet paid off at its start.
  const emis = loans
    .filter(
      (l) => !l.archived && l.first_emi_date <= month.end && loanStatus(l, addDays(month.start, -1)).outstanding > 0,
    )
    .reduce((s, l) => s + l.emi, 0);

  const budgets = plan.budgets.map((b) => ({ limit: b.limit, spent: spend.get(b.category.id) ?? 0 }));
  const health = healthScore({
    income: totals.income,
    spent: totals.spent,
    invested: totals.invested,
    liquid,
    avgEssentialMonthly,
    emergencyMonthsTarget: profile.emergencyMonthsTarget,
    emis,
    budgets,
  });

  return { month, today, transactions, totals, spend, prior, health, budgets, categories };
}

export const getReport = cache(async (key: string): Promise<Report> => {
  const [current, previous, cashflow, rules] = await Promise.all([
    monthHealth(key),
    monthHealth(shiftMonthKey(key, -1)),
    getCashflow(6),
    getRecurringRules(),
  ]);
  const { month, today, transactions, totals, spend, prior, health, budgets, categories } = current;
  const byId = new Map(categories.map((c) => [c.id, c]));

  const topCategories = [...spend]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, amount]) => ({
      name: (id && byId.get(id)?.name) || "Uncategorised",
      emoji: (id && byId.get(id)?.emoji) || "❔",
      amount,
      share: totals.spent > 0 ? amount / totals.spent : 0,
    }));

  const expenses = transactions.filter((t): t is Transaction => t.type === "expense");
  const biggest = expenses.reduce<Transaction | null>((max, t) => (!max || t.amount > max.amount ? t : max), null);

  const inProgress = month.end >= today;
  const lastDay = inProgress ? today : month.end;
  const daysCounted = Math.max(0, daysLeft(month, month.start) - daysLeft(month, lastDay) + 1);
  const spendDays = new Set(expenses.filter((t) => t.occurred_on <= lastDay).map((t) => t.occurred_on));
  const noSpendDays = Math.max(0, daysCounted - spendDays.size);

  const subscriptionsId = categories.find((c) => c.name === "Subscriptions")?.id;
  const subscriptionsMonthly = rules
    .filter((r) => r.active && r.type === "expense" && r.category_id === subscriptionsId)
    .reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0);

  const rateOf = (m: { income: number; spent: number }) => (m.income > 0 ? (m.income - m.spent) / m.income : null);
  const upTo = cashflow.filter((m) => m.key <= month.key);

  return {
    month,
    inProgress,
    hasData: transactions.length > 0,
    totals,
    health,
    previousScore: previous.transactions.length > 0 ? previous.health.score : null,
    topCategories,
    biggestExpense: biggest
      ? {
          note: biggest.note || (biggest.category_id && byId.get(biggest.category_id)?.name) || "Expense",
          emoji: (biggest.category_id && byId.get(biggest.category_id)?.emoji) || "💸",
          amount: biggest.amount,
          date: biggest.occurred_on,
        }
      : null,
    noSpendDays,
    daysCounted,
    budgets: { kept: budgets.filter((b) => b.spent <= b.limit).length, total: budgets.length },
    insights: insights({
      categories: [...spend]
        .filter(([id]) => id)
        .map(([id, spent]) => ({
          name: byId.get(id!)?.name ?? "",
          emoji: byId.get(id!)?.emoji ?? "",
          spent,
          typical: Math.round((prior.get(id) ?? 0) / 3),
        })),
      savingsRates: upTo.map(rateOf),
      subscriptionsMonthly,
      noSpendDays,
      daysInMonth: daysCounted,
    }),
  };
});

/** The month whose report to nudge about: the last finished one, if it has any data. */
export async function lastFinishedMonthKey(): Promise<string> {
  const { monthStartDay } = await getProfile();
  return shiftMonthKey(financialMonthFor(getToday(), monthStartDay).key, -1);
}
