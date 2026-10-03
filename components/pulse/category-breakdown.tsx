import Link from "next/link";
import { Card, CardLabel } from "@/components/ui/card";
import type { CategorySpend } from "@/lib/data";
import { formatCompactINR, formatINR } from "@/lib/money";

/**
 * Where this month's money went: a ranked bar list (one series, one hue).
 * Every value is printed beside its bar, so nothing hides behind hover.
 */
export function CategoryBreakdown({ rows, monthKey }: { rows: CategorySpend[]; monthKey: string }) {
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const max = rows[0]?.amount ?? 0;

  return (
    <Card className="flex flex-col">
      <div className="flex items-baseline justify-between">
        <CardLabel>Where it went</CardLabel>
        {total > 0 && <span className="money text-muted text-sm tabular-nums">{formatINR(total)}</span>}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted flex flex-1 items-center justify-center py-10 text-sm">
          No spending logged this month.
        </p>
      ) : (
        <ul className="-mx-2 mt-3 space-y-1">
          {rows.map((row) => {
            const share = Math.round((row.amount / total) * 100);
            const content = (
              <>
                <div className="flex items-baseline gap-2 text-sm">
                  <span aria-hidden>{row.emoji}</span>
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="money font-medium tabular-nums">{formatCompactINR(row.amount)}</span>
                  <span className="text-subtle w-9 text-right text-xs tabular-nums">{share}%</span>
                </div>
                <div className="mt-1.5 h-2" aria-hidden>
                  <div
                    className="bg-chart-out h-full rounded-r-[4px]"
                    style={{ width: `${Math.max(1.5, (row.amount / max) * 100)}%` }}
                  />
                </div>
              </>
            );
            return (
              <li key={row.id ?? row.name}>
                {row.id ? (
                  <Link
                    href={`/activity?month=${monthKey}&category=${row.id}`}
                    title={`${row.name}: ${formatINR(row.amount)} (${share}%)`}
                    className="hover:bg-glass-hover block rounded-xl px-2 py-2 transition-colors"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="px-2 py-2" title={`${row.name}: ${formatINR(row.amount)} (${share}%)`}>
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
