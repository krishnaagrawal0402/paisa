import { Accounts } from "@/components/accounts/accounts";
import { Amount } from "@/components/money/amount";
import { Card, CardLabel } from "@/components/ui/card";
import { Allocation } from "@/components/wealth/allocation";
import { Investments } from "@/components/wealth/investments";
import { Loans } from "@/components/wealth/loans";
import { NetWorthChart } from "@/components/wealth/net-worth-chart";
import { getCardBills } from "@/lib/cards";
import { getWealth } from "@/lib/wealth";

export const metadata = { title: "Wealth" };

export default async function WealthPage() {
  const [wealth, bills] = await Promise.all([getWealth(), getCardBills()]);
  const { totals } = wealth;
  const activeAccounts = wealth.accounts.filter((a) => !a.archived);
  const hasAnything = wealth.accounts.length > 0 || wealth.holdings.length > 0 || wealth.loans.length > 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Wealth</h1>

      <Card className="relative overflow-hidden p-6 md:p-8">
        <div aria-hidden className="bg-invest/15 absolute -top-24 -right-16 size-64 rounded-full blur-3xl" />
        <CardLabel>Net worth</CardLabel>
        <p className="glow-income mt-2 text-5xl font-semibold tracking-tight md:text-6xl">
          <Amount paise={totals.net} />
        </p>
        <div className="text-muted mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            Cash{" "}
            <span className="text-fg font-medium">
              <Amount paise={totals.cash} compact animated={false} />
            </span>
          </span>
          <span>
            Investments{" "}
            <span className="text-invest font-medium">
              <Amount paise={totals.investments} compact animated={false} />
            </span>
          </span>
          <span>
            Owed{" "}
            <span className="text-expense font-medium">
              <Amount paise={totals.cardsDue + totals.loans} compact animated={false} />
            </span>
          </span>
        </div>
      </Card>

      {hasAnything && (
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <NetWorthChart points={wealth.history} />
          </div>
          <div className="lg:col-span-2">
            <Allocation wealth={wealth} />
          </div>
        </div>
      )}

      <Investments holdings={wealth.holdings} accounts={activeAccounts} />
      <Loans loans={wealth.loans} accounts={activeAccounts} />
      <Accounts accounts={wealth.accounts} bills={bills} />
    </div>
  );
}
