import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AddTransactionButton } from "@/components/activity/add-button";
import { ActivityFilters } from "@/components/activity/filters";
import { TransactionList } from "@/components/activity/transaction-list";
import { Card } from "@/components/ui/card";
import { getAccounts, getCategories, getProfile, getToday, getTransactions, totalsOf } from "@/lib/data";
import { formatINR } from "@/lib/money";
import { financialMonthFor, financialMonthFromKey, shiftMonthKey } from "@/lib/month";
import type { TransactionType } from "@/lib/types";

export const metadata = { title: "Activity" };

const TYPES = ["income", "expense", "transfer"];
const param = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const params = await searchParams;
  const { monthStartDay } = await getProfile();
  const today = getToday();
  const current = financialMonthFor(today, monthStartDay);
  const monthKey = param(params.month);
  const month = monthKey && /^\d{4}-\d{2}$/.test(monthKey) ? financialMonthFromKey(monthKey, monthStartDay) : current;
  const type = param(params.type);

  const [transactions, accounts, categories] = await Promise.all([
    getTransactions({
      from: month.start,
      to: month.end,
      type: type && TYPES.includes(type) ? (type as TransactionType) : undefined,
      accountId: param(params.account),
      categoryId: param(params.category),
      search: param(params.q)?.slice(0, 50),
    }),
    getAccounts({ includeArchived: true }),
    getCategories({ includeArchived: true }),
  ]);
  const totals = totalsOf(transactions);

  const monthHref = (key: string) => {
    const next = new URLSearchParams(
      Object.entries(params).filter(([, v]) => typeof v === "string") as [string, string][],
    );
    next.set("month", key);
    return `/activity?${next}`;
  };
  const isCurrent = month.key === current.key;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Activity</h1>
        <nav aria-label="Month" className="glass flex items-center gap-1 !rounded-full p-1">
          <Link
            href={monthHref(shiftMonthKey(month.key, -1))}
            aria-label="Previous month"
            className="text-muted hover:bg-glass-hover hover:text-fg grid size-8 place-items-center rounded-full"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-32 px-1 text-center text-sm font-medium">{month.label}</span>
          {isCurrent ? (
            <span className="text-subtle/40 grid size-8 place-items-center">
              <ChevronRight className="size-4" />
            </span>
          ) : (
            <Link
              href={monthHref(shiftMonthKey(month.key, 1))}
              aria-label="Next month"
              className="text-muted hover:bg-glass-hover hover:text-fg grid size-8 place-items-center rounded-full"
            >
              <ChevronRight className="size-4" />
            </Link>
          )}
        </nav>
      </header>

      <Suspense>
        <ActivityFilters accounts={accounts} categories={categories.filter((c) => !c.archived)} />
      </Suspense>

      <div className="grid grid-cols-3 gap-3">
        <Total label="In" value={formatINR(totals.income)} className="text-income" />
        <Total label="Out" value={formatINR(totals.spent)} className="text-expense" />
        <Total
          label="Net"
          value={formatINR(totals.saved, { sign: true })}
          className={totals.saved >= 0 ? "text-save" : "text-expense"}
        />
      </div>

      {transactions.length > 0 ? (
        <TransactionList transactions={transactions} today={today} accounts={accounts} categories={categories} />
      ) : (
        <Card className="py-12 text-center">
          <p className="text-4xl">🧾</p>
          <p className="mt-3 font-medium">Nothing here yet</p>
          <p className="text-muted mt-1 text-sm">
            {Object.keys(params).some((k) => k !== "month")
              ? "No transactions match these filters."
              : "Log your first spend or income for this month."}
          </p>
          <div className="mt-5">
            <AddTransactionButton />
          </div>
        </Card>
      )}
    </div>
  );
}

function Total({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <Card className="p-3 md:p-4">
      <p className="text-muted text-[11px] font-medium tracking-[0.08em] uppercase">{label}</p>
      <p className={`money mt-1 truncate text-base font-semibold tabular-nums md:text-lg ${className}`}>{value}</p>
    </Card>
  );
}
