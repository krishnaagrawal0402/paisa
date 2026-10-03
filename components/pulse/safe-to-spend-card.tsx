import { AlertTriangle, CircleCheck, Gauge, OctagonAlert } from "lucide-react";
import { AddTransactionButton } from "@/components/activity/add-button";
import { Amount } from "@/components/money/amount";
import { Card, CardLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { SafeToSpend } from "@/lib/finance/safe-to-spend";
import { formatINR } from "@/lib/money";

const STATUS = {
  "on-track": { icon: CircleCheck, label: "On track", text: "text-save", fill: "bg-save", track: "bg-save/15" },
  tight: { icon: AlertTriangle, label: "Running low", text: "text-warn", fill: "bg-warn", track: "bg-warn/15" },
  over: { icon: OctagonAlert, label: "Over budget", text: "text-expense", fill: "bg-expense", track: "bg-expense/15" },
} as const;

export function SafeToSpendCard({
  result,
  daysLeft,
  savingsTargetPct,
}: {
  result: SafeToSpend;
  daysLeft: number;
  savingsTargetPct: number;
}) {
  if (result.status === "no-income") {
    return (
      <Card className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="bg-save/15 text-save grid size-10 shrink-0 place-items-center rounded-full">
            <Gauge className="size-5" />
          </span>
          <div>
            <p className="font-medium">Safe to spend per day</p>
            <p className="text-muted mt-1 text-sm">
              Log this month&apos;s salary or income, and Paisa will work out a daily budget that still saves{" "}
              {savingsTargetPct}%.
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <AddTransactionButton label="Add income" type="income" />
        </div>
      </Card>
    );
  }

  const status = STATUS[result.status];
  const Icon = status.icon;
  const fillPct = Math.min(100, result.used * 100);

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <CardLabel>Safe to spend</CardLabel>
          <p className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            <Amount paise={result.perDay} />
            <span className="text-muted ml-1.5 text-base font-normal">/ day</span>
          </p>
          <p className="text-muted mt-1 text-sm">
            for the next {daysLeft} {daysLeft === 1 ? "day" : "days"}
          </p>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", status.text)}>
          <Icon className="size-4" /> {status.label}
        </span>
      </div>

      <div>
        <div
          className={cn("relative h-2.5 overflow-hidden rounded-full", status.track)}
          role="meter"
          aria-label="Share of this month's spending budget used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fillPct)}
        >
          <div className={cn("h-full rounded-r-[4px]", status.fill)} style={{ width: `${fillPct}%` }} />
        </div>
        {/* Where spending "should" be by today if spread evenly across the month. */}
        <div className="relative mt-1 h-4">
          <span
            className="text-subtle absolute -translate-x-1/2 text-[11px] whitespace-nowrap"
            style={{ left: `${Math.min(96, Math.max(4, result.elapsed * 100))}%` }}
          >
            ▲ today
          </span>
        </div>
      </div>

      <p className="text-muted text-sm">
        {result.remaining >= 0 ? (
          <>
            <span className="money text-fg font-medium">{formatINR(result.remaining)}</span> left of{" "}
            <span className="money">{formatINR(result.spendable)}</span>
          </>
        ) : (
          <>
            <span className="money text-expense font-medium">{formatINR(-result.remaining)}</span> over your{" "}
            <span className="money">{formatINR(result.spendable)}</span> budget
          </>
        )}{" "}
        after keeping {savingsTargetPct}% aside.
      </p>
    </Card>
  );
}
