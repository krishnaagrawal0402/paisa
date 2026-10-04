"use client";

import { ArrowLeftRight, Repeat, TrendingUp } from "lucide-react";
import { useQuickAdd } from "@/components/quick-add/quick-add";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import { addDays } from "@/lib/month";
import type { Account, Category, Transaction } from "@/lib/types";

type Lookups = { accounts: Account[]; categories: Category[] };

function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** Transactions grouped by day. Tapping a row opens it in the edit sheet. */
export function TransactionList({
  transactions,
  today,
  accounts,
  categories,
  headingLevel = 2,
}: Lookups & { transactions: Transaction[]; today: string; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const days = new Map<string, Transaction[]>();
  for (const t of transactions) days.set(t.occurred_on, [...(days.get(t.occurred_on) ?? []), t]);

  return (
    <div className="space-y-5">
      {[...days].map(([date, rows]) => {
        const spent = rows.reduce((sum, t) => sum + (t.type === "expense" ? t.amount : 0), 0);
        return (
          <section key={date}>
            <div className="text-muted mb-2 flex items-baseline justify-between px-1 text-xs font-medium tracking-[0.06em] uppercase">
              <Heading>{dayLabel(date, today)}</Heading>
              {spent > 0 && <span className="money tabular-nums">−{formatINR(spent)}</span>}
            </div>
            <ul className="glass divide-line divide-y overflow-hidden">
              {rows.map((t) => (
                <TransactionRow key={t.id} transaction={t} accounts={accounts} categories={categories} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function TransactionRow({ transaction: t, accounts, categories }: Lookups & { transaction: Transaction }) {
  const { openEdit, holdings } = useQuickAdd();
  const category = categories.find((c) => c.id === t.category_id);
  const account = accounts.find((a) => a.id === t.account_id);
  const toAccount = accounts.find((a) => a.id === t.to_account_id);

  const isTransfer = t.type === "transfer";
  const isHoldingFlow = t.type === "invest" || t.type === "redeem";
  const holding = holdings.find((h) => h.id === t.holding_id);
  const title =
    t.note ||
    (isTransfer ? "Transfer" : isHoldingFlow ? (holding?.name ?? "Investment") : (category?.name ?? "Uncategorised"));
  const subtitle = isTransfer
    ? `${account?.name ?? "?"} → ${toAccount?.name ?? "?"}`
    : isHoldingFlow
      ? t.type === "invest"
        ? `${account?.name ?? "?"} → ${t.note ? (holding?.name ?? "investment") : "invested"}`
        : `${t.note ? (holding?.name ?? "investment") : "Redeemed"} → ${account?.name ?? "?"}`
      : [t.note ? category?.name : null, account?.name].filter(Boolean).join(" · ");

  return (
    <li>
      <button
        type="button"
        onClick={() => openEdit(t)}
        className="hover:bg-glass-hover flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
      >
        <span className="bg-glass-hover grid size-10 shrink-0 place-items-center rounded-full text-lg">
          {isTransfer ? (
            <ArrowLeftRight className="text-save size-4" />
          ) : isHoldingFlow ? (
            <TrendingUp className="text-invest size-4" />
          ) : (
            (category?.emoji ?? "❔")
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 truncate text-sm font-medium">
            {title}
            {t.recurring_id && <Repeat className="text-subtle size-3 shrink-0" aria-label="Recurring" />}
          </span>
          <span className="text-muted block truncate text-xs">{subtitle}</span>
        </span>
        <span
          className={cn(
            "money shrink-0 text-sm font-semibold tabular-nums",
            t.type === "income" && "text-income",
            t.type === "expense" && "text-fg",
            isTransfer && "text-muted",
            isHoldingFlow && "text-invest",
          )}
        >
          {t.type === "income" ? "+" : t.type === "expense" ? "−" : ""}
          {formatINR(t.amount)}
        </span>
      </button>
    </li>
  );
}
