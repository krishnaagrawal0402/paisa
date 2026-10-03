"use client";

import { useState } from "react";
import { Card, CardLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import type { CashflowMonth } from "@/lib/data";
import { niceTicks } from "@/lib/finance/scale";
import { formatCompactINR, formatINR } from "@/lib/money";

/** Height of the month-label row under the plot; the y-axis column stops above it. */
const X_AXIS_BAND = "1.625rem";

const SERIES = [
  { key: "income", label: "Income", swatch: "bg-chart-in", line: "bg-chart-in" },
  { key: "spent", label: "Spent", swatch: "bg-chart-out", line: "bg-chart-out" },
] as const;

/**
 * Income vs spend per month: grouped columns on one axis. Hover or focus a
 * month for its values; "Table" shows them all without hovering.
 */
export function CashflowChart({ months }: { months: CashflowMonth[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(0, ...months.flatMap((m) => [m.income, m.spent]));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const empty = max === 0;

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <CardLabel>Cash flow · 6 months</CardLabel>
        {!empty && (
          <button
            type="button"
            onClick={() => setAsTable(!asTable)}
            aria-pressed={asTable}
            className="text-muted hover:text-fg text-xs font-medium"
          >
            {asTable ? "Chart" : "Table"}
          </button>
        )}
      </div>

      {empty ? (
        <p className="text-muted flex flex-1 items-center justify-center py-10 text-center text-sm">
          Your monthly trend fills in as you log income and spending.
        </p>
      ) : asTable ? (
        <table className="mt-3 w-full text-sm">
          <thead className="text-muted text-xs">
            <tr>
              <th className="py-1.5 text-left font-medium">Month</th>
              <th className="py-1.5 text-right font-medium">Income</th>
              <th className="py-1.5 text-right font-medium">Spent</th>
              <th className="py-1.5 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y tabular-nums">
            {months.map((m) => (
              <tr key={m.key}>
                <td className="py-2">{m.label}</td>
                <td className="money py-2 text-right">{formatINR(m.income)}</td>
                <td className="money py-2 text-right">{formatINR(m.spent)}</td>
                <td className="money py-2 text-right font-medium">{formatINR(m.income - m.spent, { sign: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <ul className="text-muted mt-3 flex gap-4 text-xs" aria-label="Legend">
            {SERIES.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-[2px]", s.swatch)} />
                {s.label}
              </li>
            ))}
          </ul>

          {/* Fills the card's height (it sits beside "Where it went"); mt-5 leaves room for the top tick label. */}
          <div className="mt-5 flex min-h-[180px] flex-1">
            {/* y-axis labels */}
            <div
              className="text-subtle relative w-11 shrink-0 text-[10px] tabular-nums"
              style={{ marginBottom: X_AXIS_BAND }}
            >
              {ticks.map((t) => (
                <span
                  key={t}
                  className="money absolute right-2 -translate-y-1/2"
                  style={{ bottom: `${(t / top) * 100}%` }}
                >
                  {t === 0 ? "0" : formatCompactINR(t).replace("₹", "")}
                </span>
              ))}
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="relative flex-1">
                {ticks.map((t) => (
                  <div
                    key={t}
                    className="bg-chart-grid absolute inset-x-0 h-px"
                    style={{ bottom: `${(t / top) * 100}%` }}
                  />
                ))}

                <div className="absolute inset-0 flex">
                  {months.map((m, i) => (
                    <div
                      key={m.key}
                      tabIndex={0}
                      aria-label={`${m.label}: income ${formatINR(m.income)}, spent ${formatINR(m.spent)}`}
                      onPointerEnter={() => setActive(i)}
                      onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive((a) => (a === i ? null : a))}
                      className={cn(
                        "relative flex flex-1 items-end justify-center gap-0.5 rounded-t-lg outline-none",
                        active === i && "bg-glass-hover",
                      )}
                    >
                      <div
                        className="bg-chart-in w-3 rounded-t-[4px] md:w-4"
                        style={{ height: `${(m.income / top) * 100}%` }}
                      />
                      <div
                        className="bg-chart-out w-3 rounded-t-[4px] md:w-4"
                        style={{ height: `${(m.spent / top) * 100}%` }}
                      />
                      {active === i && (
                        <Tooltip month={m} align={i === 0 ? "left" : i === months.length - 1 ? "right" : "center"} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-subtle flex items-end text-[11px]" style={{ height: X_AXIS_BAND }}>
                {months.map((m, i) => (
                  <span
                    key={m.key}
                    className={cn("flex-1 text-center", i === months.length - 1 && "text-fg font-medium")}
                  >
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function Tooltip({ month, align }: { month: CashflowMonth; align: "left" | "center" | "right" }) {
  const net = month.income - month.spent;
  return (
    <div
      role="tooltip"
      className={cn(
        "border-line bg-bg-raised/95 pointer-events-none absolute bottom-full z-10 mb-2 w-40 rounded-xl border p-3 text-xs shadow-[0_10px_30px_rgb(0_0_0/0.5)] backdrop-blur-xl",
        align === "center" && "left-1/2 -translate-x-1/2",
        align === "left" && "left-0",
        align === "right" && "right-0",
      )}
    >
      <p className="text-muted mb-2 font-medium">{month.label}</p>
      {SERIES.map((s) => (
        <div key={s.key} className="flex items-center gap-2 py-0.5">
          <span className={cn("h-0.5 w-3 rounded-full", s.line)} />
          <span className="money text-fg flex-1 font-semibold tabular-nums">{formatINR(month[s.key])}</span>
          <span className="text-muted">{s.label}</span>
        </div>
      ))}
      <div className="border-line mt-1.5 flex items-center gap-2 border-t pt-1.5">
        <span className="w-3" />
        <span className="money text-fg flex-1 font-semibold tabular-nums">{formatINR(net, { sign: true })}</span>
        <span className="text-muted">Net</span>
      </div>
    </div>
  );
}
