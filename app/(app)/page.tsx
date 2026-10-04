import { ArrowDownLeft, ArrowRight, ArrowUpRight, PiggyBank, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { AddTransactionButton } from "@/components/activity/add-button";
import { TransactionList } from "@/components/activity/transaction-list";
import { CashflowChart } from "@/components/charts/cashflow-chart";
import { Amount } from "@/components/money/amount";
import { BudgetWatch } from "@/components/pulse/budget-watch";
import { HealthCard } from "@/components/pulse/health-card";
import { ReportReady } from "@/components/pulse/report-ready";
import { CategoryBreakdown } from "@/components/pulse/category-breakdown";
import { PendingConfirmations } from "@/components/recurring/pending";
import { Upcoming } from "@/components/recurring/upcoming";
import { SafeToSpendCard } from "@/components/pulse/safe-to-spend-card";
import { Card, CardLabel } from "@/components/ui/card";
import {
  getAccounts,
  getCashflow,
  getCategories,
  getCurrentMonth,
  getProfile,
  getRecurringRules,
  getToday,
  getTransactions,
  spendByCategory,
  totalsOf,
} from "@/lib/data";
import { safeToSpend } from "@/lib/finance/safe-to-spend";
import { daysLeft as daysLeftIn } from "@/lib/month";
import { occurrencesUntil } from "@/lib/recurring";
import { formatCompactINR } from "@/lib/money";
import { getPlanData } from "@/lib/plan";
import { getReport } from "@/lib/report";
import { shiftMonthKey } from "@/lib/month";
import { getWealth } from "@/lib/wealth";
import { getCardBills } from "@/lib/cards";

export default async function PulsePage() {
  const [profile, month, accounts, categories, cashflow, rules, wealth, plan, bills] = await Promise.all([
    getProfile(),
    getCurrentMonth(),
    getAccounts({ includeArchived: true }),
    getCategories({ includeArchived: true }),
    getCashflow(6),
    getRecurringRules(),
    getWealth({ withHistory: false }),
    getPlanData(),
    getCardBills(),
  ]);
  const today = getToday();
  const [transactions, report, lastReport] = await Promise.all([
    getTransactions({ from: month.start, to: month.end }),
    getReport(month.key),
    getReport(shiftMonthKey(month.key, -1)),
  ]);
  // Nudge about last month's report during the first days of a new month.
  const showLastReport = lastReport.hasData && daysLeftIn(month, month.start) - daysLeftIn(month, today) < 10;
  const totals = totalsOf(transactions);
  // Bank + cash + investments − cards − loans.
  const netWorth = wealth.totals.net;
  const activeAccounts = accounts.filter((a) => !a.archived).length;
  const hasAccounts = activeAccounts > 0;
  const savingsRate = totals.savingsRate === null ? null : Math.round(totals.savingsRate * 100);

  const activeRules = rules.filter((r) => r.active);
  const pending = activeRules.filter((r) => r.mode === "confirm" && r.next_due <= today);
  // Bills still to come this month (including unconfirmed ones) come out of the daily budget now.
  const committed = activeRules
    .filter((r) => r.type === "expense")
    .reduce((sum, r) => sum + occurrencesUntil(r, month.end).length * r.amount, 0);
  // Salary (or other recurring income) due this month but not logged yet: budget with it until it arrives.
  const expectedIncome = activeRules
    .filter((r) => r.type === "income")
    .reduce((sum, r) => sum + occurrencesUntil(r, month.end).filter((d) => d >= month.start).length * r.amount, 0);

  const daysLeft = daysLeftIn(month, today);
  const budget = safeToSpend({
    income: totals.income,
    expectedIncome,
    spent: totals.spent,
    committed,
    savingsTargetPct: profile.savingsTargetPct,
    daysTotal: daysLeftIn(month, month.start),
    daysLeft,
  });

  return (
    <div className="space-y-5">
      <header>
        <p className="text-muted text-sm">
          {month.label} ·{" "}
          <Link
            href={`/report/${month.key}`}
            className="text-save decoration-save/40 hover:decoration-save underline underline-offset-4"
          >
            Report card
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          Hey {profile.displayName || "there"} 👋
        </h1>
      </header>

      <PendingConfirmations rules={pending} categories={categories} today={today} />
      {showLastReport && (
        <ReportReady monthKey={lastReport.month.key} monthName={lastReport.month.label.replace(/ \d{4}$/, "")} />
      )}

      <Card className="relative overflow-hidden p-6 md:p-8">
        <div aria-hidden className="bg-income/10 absolute -top-24 -right-16 size-64 rounded-full blur-3xl" />
        <CardLabel>Net worth</CardLabel>
        <p className="glow-income mt-2 text-5xl font-semibold tracking-tight md:text-6xl">
          <Amount paise={netWorth} />
        </p>
        <p className="text-muted mt-2 text-sm">
          {hasAccounts ? (
            <>
              <span className="money">{formatCompactINR(wealth.totals.cash)}</span> cash
              {wealth.totals.investments > 0 && (
                <>
                  {" · "}
                  <span className="money">{formatCompactINR(wealth.totals.investments)}</span> invested
                </>
              )}
              {wealth.totals.cardsDue + wealth.totals.loans > 0 && (
                <>
                  {" · "}
                  <span className="money">{formatCompactINR(wealth.totals.cardsDue + wealth.totals.loans)}</span> owed
                </>
              )}
              {" · "}
              <Link href="/wealth" className="text-save underline-offset-4 hover:underline">
                Details
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
          paise={totals.invested}
          hint={wealth.totals.investments > 0 ? `${formatCompactINR(wealth.totals.investments)} in total` : undefined}
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
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <SafeToSpendCard
                result={budget}
                daysLeft={daysLeft}
                savingsTargetPct={profile.savingsTargetPct}
                committed={committed}
              />
            </div>
            <Upcoming rules={rules} categories={categories} today={today} bills={bills} />
          </div>

          {/* An early-month score from 1–2 pillars would mislead; wait until income is in. */}
          {report.hasData && !report.health.provisional && (
            <HealthCard health={report.health} monthKey={month.key} monthLabel={month.label} />
          )}
          <BudgetWatch budgets={plan.budgets} />

          <div className="grid gap-5 lg:grid-cols-2">
            <CashflowChart months={cashflow} />
            <CategoryBreakdown rows={spendByCategory(transactions, categories)} monthKey={month.key} />
          </div>

          {transactions.length === 0 ? (
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
                headingLevel={3}
                transactions={transactions.slice(0, 5)}
                today={today}
                accounts={accounts}
                categories={categories}
              />
            </section>
          )}
        </>
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
