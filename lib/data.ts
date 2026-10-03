import "server-only";
import { cache } from "react";
import { appConfig } from "@/config/app";
import { financialMonthFor, todayIn, type FinancialMonth } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";
import type { AccountWithBalance, Category, Transaction, TransactionType } from "@/lib/types";

/** Read helpers for Server Components. All queries run as the user, under RLS. */

export const getProfile = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("display_name, month_start_day").single();
  return { displayName: data?.display_name ?? "", monthStartDay: data?.month_start_day ?? 1 };
});

export const getToday = () => todayIn(appConfig.timeZone);

export const getCurrentMonth = cache(async (): Promise<FinancialMonth> => {
  const { monthStartDay } = await getProfile();
  return financialMonthFor(getToday(), monthStartDay);
});

export const getAccounts = cache(async ({ includeArchived = false } = {}): Promise<AccountWithBalance[]> => {
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
  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select("id, type, amount, occurred_on, account_id, to_account_id, category_id, note, created_at")
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

export type MonthTotals = { income: number; spent: number; saved: number; savingsRate: number | null };

export function totalsOf(transactions: Transaction[]): MonthTotals {
  let income = 0;
  let spent = 0;
  for (const t of transactions) {
    if (t.type === "income") income += t.amount;
    else if (t.type === "expense") spent += t.amount;
  }
  const saved = income - spent;
  return { income, spent, saved, savingsRate: income > 0 ? saved / income : null };
}
