import { Card, CardLabel } from "@/components/ui/card";
import type { AssetClass } from "@/lib/finance/holdings";
import { formatCompactINR } from "@/lib/money";
import type { Wealth } from "@/lib/wealth";

const GROUPS: { label: string; classes: AssetClass[] }[] = [
  { label: "Mutual funds", classes: ["mutual_fund"] },
  { label: "Fixed deposits", classes: ["fd"] },
  { label: "PPF, EPF & NPS", classes: ["ppf", "epf", "nps"] },
  { label: "Stocks", classes: ["stock"] },
  { label: "Gold", classes: ["gold"] },
  { label: "Crypto", classes: ["crypto"] },
  { label: "Other", classes: ["other"] },
];

/** Where the money sits: a ranked bar list (one hue), every value printed. */
export function Allocation({ wealth }: { wealth: Wealth }) {
  const live = wealth.holdings.filter((h) => !h.archived);
  const rows = [
    { label: "Bank & cash", value: wealth.totals.cash },
    ...GROUPS.map((g) => ({
      label: g.label,
      value: live.filter((h) => g.classes.includes(h.asset_class)).reduce((s, h) => s + h.position.value, 0),
    })),
  ]
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const assets = rows.reduce((s, r) => s + r.value, 0);
  const owed = wealth.totals.cardsDue + wealth.totals.loans;
  if (assets === 0 && owed === 0) return null;
  const max = rows[0]?.value ?? 1;

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <CardLabel>Where it is</CardLabel>
        <span className="money text-muted text-sm tabular-nums">{formatCompactINR(assets)} assets</span>
      </div>
      <ul className="mt-3 space-y-3">
        {rows.map((r) => (
          <li key={r.label}>
            <div className="flex items-baseline gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <span className="money font-medium tabular-nums">{formatCompactINR(r.value)}</span>
              <span className="text-subtle w-9 text-right text-xs tabular-nums">
                {Math.round((r.value / assets) * 100)}%
              </span>
            </div>
            <div className="mt-1.5 h-2" aria-hidden>
              <div
                className="bg-chart-in h-full rounded-r-[4px]"
                style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {owed > 0 && (
        <div className="border-line mt-4 flex items-baseline justify-between border-t pt-3 text-sm">
          <span className="text-muted">
            Owed
            {wealth.totals.cardsDue > 0 && wealth.totals.loans > 0
              ? " (cards + loans)"
              : wealth.totals.loans > 0
                ? " (loans)"
                : " (cards)"}
          </span>
          <span className="money text-expense font-medium tabular-nums">−{formatCompactINR(owed)}</span>
        </div>
      )}
    </Card>
  );
}
