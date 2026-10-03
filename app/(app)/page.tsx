import { ArrowDownLeft, ArrowRight, ArrowUpRight, PiggyBank, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { AddTransactionButton } from "@/components/activity/add-button";
import { TransactionList } from "@/components/activity/transaction-list";
import { Amount } from "@/components/money/amount";
import { Card, CardLabel } from "@/components/ui/card";
import {
  getAccounts,
  getCategories,
  getCurrentMonth,
  getProfile,
  getToday,
  getTransactions,
  totalsOf,
} from "@/lib/data";

export default async function PulsePage() {
  const [profile, month, accounts, categories] = await Promise.all([
    getProfile(),
    getCurrentMonth(),
    getAccounts({ includeArchived: true }),
    getCategories({ includeArchived: true }),
  ]);
  const transactions = await getTransactions({ from: month.start, to: month.end });
  const totals = totalsOf(transactions);
  const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0);
  const hasAccounts = accounts.some((a) => !a.archived);
  const savingsRate = totals.savingsRate === null ? null : Math.round(totals.savingsRate * 100);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-muted text-sm">{month.label}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          Hey {profile.displayName || "there"} 👋
        </h1>
      </header>

      <Card className="relative overflow-hidden p-6 md:p-8">
        <div aria-hidden className="bg-income/10 absolute -top-24 -right-16 size-64 rounded-full blur-3xl" />
        <CardLabel>Net worth</CardLabel>
        <p className="glow-income mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
          <Amount paise={netWorth} />
        </p>
        <p className="text-muted mt-2 text-sm">
          {hasAccounts ? (
            <>
              Across {accounts.filter((a) => !a.archived).length} accounts.{" "}
              <Link href="/wealth" className="text-save underline-offset-4 hover:underline">
                See all
              </Link>
            </>
          ) : (
            "Add your accounts and current balances to see this come alive."
          )}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Stat label="Income" icon={<ArrowDownLeft className="size-4" />} tone="text-income" paise={totals.income} />
        <Stat label="Spent" icon={<ArrowUpRight className="size-4" />} tone="text-expense" paise={totals.spent} />
        <Stat
          label="Invested"
          icon={<TrendingUp className="size-4" />}
          tone="text-invest"
          paise={0}
          hint="Coming soon"
        />
        <Stat
          label="Saved"
          icon={<PiggyBank className="size-4" />}
          tone="text-save"
          paise={totals.saved}
          hint={savingsRate === null ? undefined : `${savingsRate}% of income`}
        />
      </div>

      {!hasAccounts ? (
        <Card className="flex items-start gap-4">
          <div className="bg-save/15 text-save grid size-10 shrink-0 place-items-center rounded-full">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="font-medium">Start with your accounts</p>
            <p className="text-muted mt-1 text-sm">
              Add your bank accounts, cards and cash with today&apos;s balances. Then log spends from the + button.
            </p>
            <Link href="/wealth" className="text-save mt-3 inline-flex items-center gap-1.5 text-sm font-medium">
              Add accounts <ArrowRight className="size-4" />
            </Link>
          </div>
        </Card>
      ) : transactions.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="font-medium">Nothing logged this month yet</p>
          <p className="text-muted mt-1 text-sm">Your salary, rent, that coffee. It all counts.</p>
          <div className="mt-5">
            <AddTransactionButton label="Log your first one" />
          </div>
        </Card>
      ) : (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-lg font-semibold tracking-tight">Recent</h2>
            <Link href="/activity" className="text-save text-sm hover:underline">
              See all
            </Link>
          </div>
          <TransactionList
            transactions={transactions.slice(0, 5)}
            today={getToday()}
            accounts={accounts}
            categories={categories}
          />
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  icon,
  tone,
  paise,
  hint,
}: {
  label: string;
  icon: React.ReactNode;
  tone: string;
  paise: number;
  hint?: string;
}) {
  return (
    <Card className="p-4 md:p-5">
      <div className={`flex items-center gap-1.5 ${tone}`}>
        {icon}
        <CardLabel className="text-inherit">{label}</CardLabel>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight md:text-2xl">
        <Amount paise={paise} compact />
      </p>
      {hint && <p className="text-subtle mt-1 text-xs">{hint}</p>}
    </Card>
  );
}
