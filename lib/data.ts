import "server-only";
import { cache } from "react";
import { appConfig } from "@/config/app";
import { financialMonthFor, financialMonthFromKey, shiftMonthKey, todayIn, type FinancialMonth } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";
import type { AccountWithBalance, Category, RecurringRule, Transaction, TransactionType } from "@/lib/types";

/** Read helpers for Server Components. All queries run as the user, under RLS. */

export const getProfile = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, month_start_day, savings_target_pct, emergency_months_target")
    .single();
  return {
    displayName: data?.display_name ?? "",
    monthStartDay: data?.month_start_day ?? 1,
    savingsTargetPct: data?.savings_target_pct ?? 20,
    emergencyMonthsTarget: data?.emergency_months_target ?? 6,
  };
});

export const getToday = () => todayIn(appConfig.timeZone);

/**
 * Posts any recurring entries that fell due while nobody was looking. pg_cron
 * does this every morning too; both are idempotent. Deduped per request.
 */
export const postDueRecurring = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_due_recurring", { p_today: getToday() });
  if (error) console.error("post_due_recurring failed:", error.message);
  return (data as number | null) ?? 0;
});

export const getRecurringRules = cache(async (): Promise<RecurringRule[]> => {
  await postDueRecurring();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recurring_rules")
    .select(
      "id, name, type, amount, account_id, to_account_id, category_id, holding_id, frequency, anchor_date, next_due, end_date, mode, active",
    )
    .order("next_due");
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, amount: Number(r.amount) }));
});

export const getCurrentMonth = cache(async (): Promise<FinancialMonth> => {
  const { monthStartDay } = await getProfile();
  return financialMonthFor(getToday(), monthStartDay);
});

export const getAccounts = cache(async ({ includeArchived = false } = {}): Promise<AccountWithBalance[]> => {
  await postDueRecurring();
  const supabase = await createClient();
  let query = supabase
    .from("accounts")
    .select("id, name, type, opening_balance, archived, sort")
    .order("sort")
    .order("created_at");
  if (!includeArchived) query = query.eq("archived", false);
  const [{ data: accounts, error }, { data: balances }] = await Promise.all([
    query,
    supabase.from("account_balances").select("account_id, balance"),
  ]);
  if (error) throw error;
  const byId = new Map((balances ?? []).map((b) => [b.account_id as string, Number(b.balance)]));
  return (accounts ?? []).map((a) => ({
    ...a,
    opening_balance: Number(a.opening_balance),
    balance: byId.get(a.id) ?? Number(a.opening_balance),
  }));
});

/** Categories, most-used first (last 90 days), then by default order. */
export const getCategories = cache(async ({ includeArchived = false } = {}): Promise<Category[]> => {
  const supabase = await createClient();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  let query = supabase.from("categories").select("id, name, kind, emoji, is_essential, archived, sort").order("sort");
  if (!includeArchived) query = query.eq("archived", false);
  const [{ data: categories, error }, { data: recent }] = await Promise.all([
    query,
    supabase.from("transactions").select("category_id").gte("occurred_on", since).not("category_id", "is", null),
  ]);
  if (error) throw error;
  const uses = new Map<string, number>();
  for (const { category_id } of recent ?? []) uses.set(category_id, (uses.get(category_id) ?? 0) + 1);
  return [...(categories ?? [])].sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.sort - b.sort);
});

export type TransactionFilters = {
  from: string;
  to: string;
  type?: TransactionType;
  accountId?: string;
  categoryId?: string;
  search?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

export async function getTransactions(filters: TransactionFilters): Promise<Transaction[]> {
  await postDueRecurring();
  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select(
      "id, type, amount, occurred_on, account_id, to_account_id, category_id, note, recurring_id, holding_id, created_at",
    )
    .gte("occurred_on", filters.from)
    .lte("occurred_on", filters.to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(2000);

  if (filters.type) query = query.eq("type", filters.type);
  // IDs are spliced into PostgREST filter strings below, so only accept real UUIDs.
  if (isUuid(filters.accountId))
    query = query.or(`account_id.eq.${filters.accountId},to_account_id.eq.${filters.accountId}`);
  if (isUuid(filters.categoryId)) query = query.eq("category_id", filters.categoryId);
  if (filters.search) {
    // Match the note, or any category whose name matches.
    const term = filters.search.replace(/[%,()*"\\]/g, " ").trim();
    const { data: matching } = await supabase.from("categories").select("id").ilike("name", `%${term}%`);
    const ids = (matching ?? []).map((c) => c.id);
    query = query.or([`note.ilike.%${term}%`, ...(ids.length ? [`category_id.in.(${ids.join(",")})`] : [])].join(","));
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) }));
}

export type MonthTotals = {
  income: number;
  spent: number;
  saved: number;
  /** Put into investments this month, net of redemptions. Part of "saved", not spending. */
  invested: number;
  savingsRate: number | null;
};

export function totalsOf(transactions: Transaction[]): MonthTotals {
  let income = 0;
  let spent = 0;
  let invested = 0;
  for (const t of transactions) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") spent += t.amount;
    else if (t.type === "invest") invested += t.amount;
    else if (t.type === "redeem") invested -= t.amount;
  }
  const saved = income - spent;
  return { income, spent, saved, invested, savingsRate: income > 0 ? saved / income : null };
}

export type CashflowMonth = { key: string; label: string; income: number; spent: number };

/** Income and spend per financial month, oldest first, ending with the current month. */
export async function getCashflow(months = 6): Promise<CashflowMonth[]> {
  const [{ monthStartDay }, current] = await Promise.all([getProfile(), getCurrentMonth()]);
  const keys = Array.from({ length: months }, (_, i) => shiftMonthKey(current.key, i - (months - 1)));
  const first = financialMonthFromKey(keys[0], monthStartDay);

  await postDueRecurring();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("daily_totals", { p_from: first.start, p_to: current.end });
  if (error) throw error;

  const byKey = new Map(
    keys.map((key) => [
      key,
      {
        key,
        label: new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(
          new Date(`${key}-01T00:00:00Z`),
        ),
        income: 0,
        spent: 0,
      },
    ]),
  );
  for (const day of (data ?? []) as { occurred_on: string; type: string; total: number }[]) {
    const month = byKey.get(financialMonthFor(day.occurred_on, monthStartDay).key);
    if (!month) continue;
    if (day.type === "income") month.income += Number(day.total);
    else month.spent += Number(day.total);
  }
  return [...byKey.values()];
}

export type CategorySpend = { id: string | null; name: string; emoji: string; amount: number };

/** Expenses grouped by category, biggest first; the tail beyond `top` folds into "Other". */
export function spendByCategory(transactions: Transaction[], categories: Category[], top = 6): CategorySpend[] {
  const totals = new Map<string | null, number>();
  for (const t of transactions) {
    if (t.type === "expense") totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + t.amount);
  }
  const rows = [...totals]
    .map(([id, amount]) => {
      const category = categories.find((c) => c.id === id);
      return { id, name: category?.name ?? "Uncategorised", emoji: category?.emoji ?? "❔", amount };
    })
    .sort((a, b) => b.amount - a.amount);
  if (rows.length <= top + 1) return rows;
  const rest = rows.slice(top).reduce((sum, r) => sum + r.amount, 0);
  return [...rows.slice(0, top), { id: null, name: `${rows.length - top} others`, emoji: "…", amount: rest }];
}

/** Learned "keyword → category" rules, used by typed entry and statement import. */
export const getCategoryRules = cache(async (): Promise<{ pattern: string; category_id: string }[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("category_rules").select("pattern, category_id");
  if (error) throw error;
  return data ?? [];
});

export type ImportBatch = { id: string; account_id: string; filename: string; row_count: number; created_at: string };

/** The last few imports, so any of them can be undone later. */
export async function getRecentImports(): Promise<ImportBatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, account_id, filename, row_count, created_at")
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) throw error;
  return data ?? [];
}
