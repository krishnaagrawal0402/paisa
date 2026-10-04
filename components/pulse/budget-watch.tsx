import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/money";
import type { BudgetView } from "@/lib/plan";

/** Budgets that need attention (close, over, or on pace to go over). Hidden when all is calm. */
export function BudgetWatch({ budgets }: { budgets: BudgetView[] }) {
  const watch = budgets.filter((b) => b.status !== "ok").slice(0, 3);
  if (watch.length === 0) return null;
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <CardLabel>Budgets to watch</CardLabel>
        <Link href="/plan" className="text-save text-xs hover:underline">
          All budgets
        </Link>
      </div>
      <ul className="mt-3 space-y-3">
        {watch.map((b) => (
          <li key={b.id}>
            <div className="flex items-baseline gap-2 text-sm">
              <span aria-hidden>{b.category.emoji}</span>
              <span className="min-w-0 flex-1 truncate">{b.category.name}</span>
              <span className={cn("text-xs", b.status === "over" ? "text-expense" : "text-warn")}>
                {b.status === "over"
                  ? "Over"
                  : b.status === "near"
                    ? `${Math.round(b.used * 100)}% used`
                    : "On pace to go over"}
              </span>
            </div>
            <div
              className={cn(
                "mt-1.5 h-1.5 overflow-hidden rounded-full",
                b.status === "over" ? "bg-expense/15" : "bg-warn/15",
              )}
            >
              <div
                className={cn(
                  "h-full rounded-r-[4px]",
                  b.status === "over" ? "bg-expense" : b.status === "near" ? "bg-warn" : "bg-save",
                )}
                style={{ width: `${Math.min(100, b.used * 100)}%` }}
              />
            </div>
            <p className="text-muted mt-1 text-xs">
              <span className="money">{formatRupees(b.spent)}</span> of{" "}
              <span className="money">{formatRupees(b.limit)}</span>
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
