import { ArrowLeftRight, CreditCard } from "lucide-react";
import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import { addDays } from "@/lib/month";
import { formatDue, occurrencesUntil } from "@/lib/recurring";
import type { CardBillWithName } from "@/lib/cards";
import type { Category, RecurringRule } from "@/lib/types";

/** What's coming in the next 7 days: recurring rules, plus card bills due (or overdue). */
export function Upcoming({
  rules,
  categories,
  today,
  bills = [],
}: {
  rules: RecurringRule[];
  categories: Category[];
  today: string;
  bills?: CardBillWithName[];
}) {
  const until = addDays(today, 7);
  const items = rules
    .filter((r) => r.active)
    .flatMap((rule) =>
      occurrencesUntil(rule, until)
        // Pending confirmations (due today or earlier) have their own cards.
        .filter((date) => date > today || (rule.mode === "auto" && date === today))
        .map((date) => ({ rule, date })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const dueBills = bills.filter((b) => (b.status === "due" && b.dueDate <= until) || b.status === "overdue");

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <CardLabel>Next 7 days</CardLabel>
        <Link href="/plan" className="text-save text-xs hover:underline">
          Recurring
        </Link>
      </div>
      {items.length === 0 && dueBills.length === 0 ? (
        <p className="text-muted mt-3 text-sm">Nothing scheduled this week.</p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {dueBills.map((bill) => (
            <li key={bill.accountId} className="flex items-center gap-3 py-2">
              <span className={cn("w-14 shrink-0 text-xs", bill.status === "overdue" ? "text-expense" : "text-muted")}>
                {bill.status === "overdue"
                  ? "Overdue"
                  : bill.dueDate === today
                    ? "Today"
                    : bill.dueDate === addDays(today, 1)
                      ? "Tomorrow"
                      : formatDue(bill.dueDate)}
              </span>
              <CreditCard aria-hidden className="text-muted mx-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm">{bill.name} bill</span>
              <span className="money shrink-0 text-sm font-medium tabular-nums">{formatINR(bill.due)}</span>
            </li>
          ))}
          {items.map(({ rule, date }) => {
            const category = categories.find((c) => c.id === rule.category_id);
            return (
              <li key={`${rule.id}-${date}`} className="flex items-center gap-3 py-2">
                <span className="text-muted w-14 shrink-0 text-xs">
                  {date === addDays(today, 1) ? "Tomorrow" : date === today ? "Today" : formatDue(date)}
                </span>
                <span className="w-5 text-center" aria-hidden>
                  {rule.type === "transfer" ? (
                    <ArrowLeftRight className="text-save mx-auto size-3.5" />
                  ) : (
                    (category?.emoji ?? "🔁")
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{rule.name}</span>
                <span
                  className={cn(
                    "money shrink-0 text-sm font-medium tabular-nums",
                    rule.type === "income" && "text-income",
                    rule.type === "transfer" && "text-muted",
                  )}
                >
                  {rule.type === "income" ? "+" : rule.type === "expense" ? "−" : ""}
                  {formatINR(rule.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
