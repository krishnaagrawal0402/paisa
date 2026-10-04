import { Recurring } from "@/components/recurring/recurring";
import { Card } from "@/components/ui/card";
import { getAccounts, getCategories, getRecurringRules } from "@/lib/data";
import { getHoldings } from "@/lib/wealth";

export const metadata = { title: "Plan" };

export default async function PlanPage() {
  const [rules, accounts, categories, allHoldings] = await Promise.all([
    getRecurringRules(),
    getAccounts(),
    getCategories(),
    getHoldings(),
  ]);
  const holdings = allHoldings
    .filter((h) => !h.archived)
    .map(({ id, name, asset_class }) => ({ id, name, asset_class }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Plan</h1>
      <Recurring rules={rules} accounts={accounts} categories={categories} holdings={holdings} />
      <Card>
        <p className="text-save text-xs font-medium tracking-[0.08em] uppercase">Coming in M6</p>
        <p className="text-muted mt-2 text-sm">
          Monthly budgets per category, savings goals that track themselves, and an emergency fund.
        </p>
      </Card>
    </div>
  );
}
