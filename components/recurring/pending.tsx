"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { confirmRecurring } from "@/lib/actions/recurring";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import { addDays } from "@/lib/month";
import { parseAmount } from "@/lib/parse/amount";
import { formatDue } from "@/lib/recurring";
import type { Category, RecurringRule } from "@/lib/types";

/** "Salary due 1 Oct: ₹1,20,000 · Confirm / Skip" cards for rules that ask before logging. */
export function PendingConfirmations({
  rules,
  categories,
  today,
}: {
  rules: RecurringRule[];
  categories: Category[];
  today: string;
}) {
  if (rules.length === 0) return null;
  return (
    <div className="space-y-3">
      {rules.map((rule) => (
        <PendingCard
          key={`${rule.id}-${rule.next_due}`}
          rule={rule}
          today={today}
          category={categories.find((c) => c.id === rule.category_id)}
        />
      ))}
    </div>
  );
}

function PendingCard({ rule, category, today }: { rule: RecurringRule; category?: Category; today: string }) {
  const toast = useToast();
  const [amountText, setAmountText] = useState(String(rule.amount / 100));
  // Salary that lands on the 3rd instead of the 1st is logged on the 3rd. A long-overdue
  // confirmation keeps its due date, so it stays in the month it belongs to.
  const [date, setDate] = useState(addDays(rule.next_due, 10) >= today ? today : rule.next_due);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isIncome = rule.type === "income";

  function act(skip: boolean) {
    const amount = parseAmount(amountText);
    if (!skip && !amount) return setError("Enter the amount that arrived");
    setError(null);
    startTransition(async () => {
      const result = await confirmRecurring({ ruleId: rule.id, amount: amount ?? undefined, occurredOn: date, skip });
      if (!result.ok) return setError(result.error);
      navigator.vibrate?.(10);
      toast.show({
        message: skip
          ? `Skipped ${rule.name} for ${formatDue(rule.next_due)}`
          : `${rule.name} logged · ${formatINR(amount!)}`,
      });
    });
  }

  return (
    <div
      className={cn(
        "glass flex flex-col gap-3 p-4 lg:flex-row lg:items-center",
        isIncome ? "border-income/30" : "border-save/30",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="bg-glass-hover grid size-10 shrink-0 place-items-center rounded-full text-lg">
          {category?.emoji ?? "🔁"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{isIncome ? `${rule.name} arrived?` : `${rule.name} paid?`}</p>
          <p className="text-muted text-xs">Due {formatDue(rule.next_due)} · check the amount</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-32">
          <span className="text-muted pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm">₹</span>
          <Input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            aria-label={`${rule.name} amount`}
            className="money h-10 pl-7 text-sm tabular-nums"
          />
        </div>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label={isIncome ? `Date ${rule.name} arrived` : `Date ${rule.name} was paid`}
          className="border-line bg-glass text-fg focus:border-save/60 h-10 rounded-2xl border px-3 text-sm [color-scheme:dark] outline-none"
        />
        <Button onClick={() => act(false)} disabled={pending} className="h-10 px-4">
          <Check className="size-4" /> Log
        </Button>
        <Button variant="ghost" onClick={() => act(true)} disabled={pending} className="h-10 px-3">
          Skip
        </Button>
      </div>
      {error && <p className="text-expense text-sm lg:basis-full">{error}</p>}
    </div>
  );
}
