import { Accounts } from "@/components/accounts/accounts";
import { Amount } from "@/components/money/amount";
import { Card, CardLabel } from "@/components/ui/card";
import { getAccounts } from "@/lib/data";

export const metadata = { title: "Wealth" };

export default async function WealthPage() {
  const accounts = await getAccounts({ includeArchived: true });
  const assets = accounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);
  const liabilities = accounts.reduce((sum, a) => sum + Math.max(0, -a.balance), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Wealth</h1>

      <Card className="relative overflow-hidden p-6 md:p-8">
        <div aria-hidden className="bg-invest/15 absolute -top-24 -right-16 size-64 rounded-full blur-3xl" />
        <CardLabel>Net worth</CardLabel>
        <p className="glow-income mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
          <Amount paise={assets - liabilities} />
        </p>
        <div className="text-muted mt-3 flex gap-6 text-sm">
          <span>
            Assets{" "}
            <span className="text-income font-medium tabular-nums">
              <Amount paise={assets} compact animated={false} />
            </span>
          </span>
          <span>
            Owed{" "}
            <span className="text-expense font-medium tabular-nums">
              <Amount paise={liabilities} compact animated={false} />
            </span>
          </span>
        </div>
      </Card>

      <Accounts accounts={accounts} />

      <Card>
        <p className="text-save text-xs font-medium tracking-[0.08em] uppercase">Coming in M5</p>
        <p className="text-muted mt-2 text-sm">
          Investments (mutual funds priced daily, FDs, PPF, stocks), loans and EMIs, and a net-worth trend over time.
        </p>
      </Card>
    </div>
  );
}
