import "server-only";
import { cache } from "react";
import { getCashflow, getCategories, getCurrentMonth, getProfile, getToday, postDueRecurring } from "@/lib/data";
import { budgetStatus, emergencyTarget, goalProgress, type BudgetStatus, type GoalProgress } from "@/lib/finance/plan";
import type { Paise } from "@/lib/money";
import { daysLeft, financialMonthFromKey, shiftMonthKey } from "@/lib/month";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";
import { getWealth } from "@/lib/wealth";

export type GoalSource = { account_id: string | null; holding_id: string | null };

export type Goal = {
  id: string;
  name: string;
  emoji: string;
  kind: "custom" | "emergency";
  target_amount: Paise;
  target_date: string | null;
  manual_saved: Paise;
  achieved_at: string | null;
  sources: GoalSource[];
};

export type BudgetView = {
  id: string;
  category: Category;
  limit: Paise;
  spent: Paise;
  /** Average monthly spend in this category over the last 3 full months. */
  typical: Paise;
} & BudgetStatus;

export type GoalView = Goal & { current: Paise } & GoalProgress;

export type PlanData = {
  budgets: BudgetView[];
  goals: GoalView[];
  /** Typical spend per expense category (last 3 full months), to suggest budgets. */
  typicalByCategory: Map<string | null, Paise>;
  emergency: {
    avgEssentialMonthly: Paise;
    months: number;
    suggestedTarget: Paise;
    /** How many months of essentials the emergency fund covers today. */
    covered: number | null;
  };
  /** Average monthly saving (income − spending) over the last 3 full months. */
  monthlyPace: Paise;
};

async function categorySpend(from: string, to: string): Promise<Map<string | null, Paise>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("category_spend", { p_from: from, p_to: to });
  if (error) throw error;
  return new Map(
    ((data ?? []) as { category_id: string | null; total: number }[]).map((r) => [r.category_id, Number(r.total)]),
  );
}

export const getPlanData = cache(async (): Promise<PlanData> => {
  await postDueRecurring();
  const supabase = await createClient();
  const [profile, month, categories, wealth, cashflow, budgetsRes, goalsRes] = await Promise.all([
    getProfile(),
    getCurrentMonth(),
    getCategories({ includeArchived: true }),
    getWealth({ withHistory: false }),
    getCashflow(4),
    supabase.from("budgets").select("id, category_id, monthly_limit"),
    supabase
      .from("goals")
      .select(
        "id, name, emoji, kind, target_amount, target_date, manual_saved, achieved_at, goal_sources(account_id, holding_id)",
      )
      .order("kind", { ascending: false })
      .order("sort")
      .order("created_at"),
  ]);
  if (budgetsRes.error) throw budgetsRes.error;
  if (goalsRes.error) throw goalsRes.error;

  const today = getToday();
  const prevStart = financialMonthFromKey(shiftMonthKey(month.key, -3), profile.monthStartDay).start;
  const prevEnd = financialMonthFromKey(shiftMonthKey(month.key, -1), profile.monthStartDay).end;
  const [thisMonth, lastThree] = await Promise.all([
    categorySpend(month.start, month.end),
    categorySpend(prevStart, prevEnd),
  ]);
  const typicalByCategory = new Map([...lastThree].map(([id, total]) => [id, Math.round(total / 3)]));

  const total = daysLeft(month, month.start);
  const elapsed = Math.min(1, (total - daysLeft(month, today) + 1) / total);
  const byId = new Map(categories.map((c) => [c.id, c]));

  const budgets: BudgetView[] = (budgetsRes.data ?? [])
    .filter((b) => byId.has(b.category_id))
    .map((b) => {
      const limit = Number(b.monthly_limit);
      const spent = thisMonth.get(b.category_id) ?? 0;
      return {
        id: b.id,
        category: byId.get(b.category_id)!,
        limit,
        spent,
        typical: typicalByCategory.get(b.category_id) ?? 0,
        ...budgetStatus(limit, spent, elapsed),
      };
    })
    .sort((a, b) => b.used - a.used);

  // Saving pace: the last three complete months (the current one is partial).
  const complete = cashflow.slice(0, -1).slice(-3);
  const monthlyPace = complete.length
    ? Math.max(0, Math.round(complete.reduce((s, m) => s + m.income - m.spent, 0) / complete.length))
    : 0;

  const valueOf = (src: GoalSource) =>
    src.account_id
      ? Math.max(0, wealth.accounts.find((a) => a.id === src.account_id)?.balance ?? 0)
      : (wealth.holdings.find((h) => h.id === src.holding_id)?.position.value ?? 0);

  const goals: GoalView[] = (goalsRes.data ?? []).map((g) => {
    const sources = (g.goal_sources ?? []) as GoalSource[];
    const target = Number(g.target_amount);
    const current = Number(g.manual_saved) + sources.reduce((s, src) => s + valueOf(src), 0);
    return {
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      kind: g.kind as Goal["kind"],
      target_amount: target,
      target_date: g.target_date,
      manual_saved: Number(g.manual_saved),
      achieved_at: g.achieved_at,
      sources,
      current,
      ...goalProgress({ target, current, today, targetDate: g.target_date, monthlyPace }),
    };
  });

  const essentialIds = new Set(categories.filter((c) => c.is_essential).map((c) => c.id));
  const avgEssentialMonthly = [...typicalByCategory].reduce(
    (s, [id, v]) => s + (id && essentialIds.has(id) ? v : 0),
    0,
  );
  const emergencyGoal = goals.find((g) => g.kind === "emergency");

  return {
    budgets,
    goals,
    typicalByCategory,
    monthlyPace,
    emergency: {
      avgEssentialMonthly,
      months: profile.emergencyMonthsTarget,
      suggestedTarget: emergencyTarget(avgEssentialMonthly, profile.emergencyMonthsTarget),
      covered: emergencyGoal && avgEssentialMonthly > 0 ? emergencyGoal.current / avgEssentialMonthly : null,
    },
  };
});
