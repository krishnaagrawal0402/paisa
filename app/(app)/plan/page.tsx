import { Budgets } from "@/components/plan/budgets";
import { Goals, type SourceOption } from "@/components/plan/goals";
import { Recurring } from "@/components/recurring/recurring";
import { getAccounts, getCategories, getRecurringRules } from "@/lib/data";
import { getPlanData } from "@/lib/plan";
import { getHoldings } from "@/lib/wealth";

export const metadata = { title: "Plan" };

export default async function PlanPage() {
  const [plan, rules, accounts, categories, allHoldings] = await Promise.all([
    getPlanData(),
    getRecurringRules(),
    getAccounts(),
    getCategories(),
    getHoldings(),
  ]);
  const holdings = allHoldings.filter((h) => !h.archived);
  const sources: SourceOption[] = [
    ...accounts
      .filter((a) => a.type !== "credit_card")
      .map((a) => ({ kind: "account" as const, id: a.id, name: a.name, account: a })),
    ...holdings.map((h) => ({ kind: "holding" as const, id: h.id, name: h.name, assetClass: h.asset_class })),
  ];
  const typical = Object.fromEntries([...plan.typicalByCategory].filter(([id]) => id !== null)) as Record<
    string,
    number
  >;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Plan</h1>
      <Goals goals={plan.goals} sources={sources} emergency={plan.emergency} />
      <Budgets budgets={plan.budgets} categories={categories} typical={typical} />
      <Recurring
        rules={rules}
        accounts={accounts}
        categories={categories}
        holdings={holdings.map(({ id, name, asset_class }) => ({ id, name, asset_class }))}
      />
    </div>
  );
}
