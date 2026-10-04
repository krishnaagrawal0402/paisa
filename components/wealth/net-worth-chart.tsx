"use client";

import { useState } from "react";
import { Card, CardLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { domainTicks } from "@/lib/finance/scale";
import { formatCompactINR, formatRupees } from "@/lib/money";
import type { WealthPoint } from "@/lib/wealth";

const HEIGHT = 170;

const label = (date: string, last: boolean) =>
  last
    ? "Now"
    : new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

/** Net worth at each month-end for a year, plus today. One series, so no legend: the title names it. */
export function NetWorthChart({ points }: { points: WealthPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  if (points.length < 2) return null;

  const values = points.map((p) => p.net);
  const ticks = domainTicks(Math.min(...values), Math.max(...values));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const y = (v: number) => 100 - ((v - lo) / (hi - lo || 1)) * 100; // % from top
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.net)}`).join(" ");
  const area = `${line} L100,${y(Math.max(lo, 0))} L0,${y(Math.max(lo, 0))} Z`;
  const first = points[0].net;
  const last = points[points.length - 1].net;
  const shown = active ?? points.length - 1;

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <CardLabel>Net worth · 12 months</CardLabel>
          <p className="text-muted mt-1 text-sm">
            <span className={cn("money font-medium", last >= first ? "text-income" : "text-expense")}>
              {formatRupees(last - first, { sign: true })}
            </span>{" "}
            since {label(points[0].date, false)} {points[0].date.slice(0, 4)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable(!asTable)}
          aria-pressed={asTable}
          className="text-muted hover:text-fg text-xs font-medium"
        >
          {asTable ? "Chart" : "Table"}
        </button>
      </div>

      {asTable ? (
        <table className="w-full text-sm">
          <thead className="text-muted text-xs">
            <tr>
              <th className="py-1.5 text-left font-medium">Month end</th>
              <th className="py-1.5 text-right font-medium">Assets</th>
              <th className="py-1.5 text-right font-medium">Owed</th>
              <th className="py-1.5 text-right font-medium">Net worth</th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y tabular-nums">
            {points.map((p, i) => (
              <tr key={p.date}>
                <td className="py-2">
                  {label(p.date, i === points.length - 1)} {i === points.length - 1 ? "" : p.date.slice(0, 4)}
                </td>
                <td className="money py-2 text-right">{formatCompactINR(p.assets)}</td>
                <td className="money py-2 text-right">{formatCompactINR(p.liabilities)}</td>
                <td className="money py-2 text-right font-medium">{formatRupees(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex">
          <div className="text-subtle relative w-11 shrink-0 text-[10px] tabular-nums" style={{ height: HEIGHT }}>
            {ticks.map((t) => (
              <span key={t} className="money absolute right-2 -translate-y-1/2" style={{ top: `${y(t)}%` }}>
                {t === 0 ? "0" : formatCompactINR(t).replace("₹", "")}
              </span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="relative" style={{ height: HEIGHT }}>
              {ticks.map((t) => (
                <div key={t} className="bg-chart-grid absolute inset-x-0 h-px" style={{ top: `${y(t)}%` }} />
              ))}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 size-full overflow-visible"
                aria-hidden
              >
                <path d={area} className="fill-chart-in/10" />
                <path
                  d={line}
                  className="stroke-chart-in fill-none"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
              {/* crosshair + end dot */}
              <div className="bg-fg/25 pointer-events-none absolute inset-y-0 w-px" style={{ left: `${x(shown)}%` }} />
              <div
                className="bg-chart-in ring-bg-raised pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                style={{ left: `${x(shown)}%`, top: `${y(points[shown].net)}%` }}
              />
              {/* hit areas: one per point, wider than the mark */}
              <div className="absolute inset-0 flex">
                {points.map((p, i) => (
                  <div
                    key={p.date}
                    tabIndex={0}
                    aria-label={`${label(p.date, i === points.length - 1)}: net worth ${formatRupees(p.net)}`}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive((a) => (a === i ? null : a))}
                    className="flex-1 outline-none"
                  />
                ))}
              </div>
              {active !== null && (
                <div
                  role="tooltip"
                  className={cn(
                    "border-line bg-bg-raised/95 pointer-events-none absolute -top-2 z-10 w-44 -translate-y-full rounded-xl border p-3 text-xs shadow-[0_10px_30px_rgb(0_0_0/0.5)] backdrop-blur-xl",
                    x(active) < 25 ? "left-0" : x(active) > 75 ? "right-0" : "-translate-x-1/2",
                  )}
                  style={x(active) >= 25 && x(active) <= 75 ? { left: `${x(active)}%` } : undefined}
                >
                  <p className="text-muted mb-1.5 font-medium">
                    {label(points[active].date, active === points.length - 1)}{" "}
                    {active === points.length - 1 ? "" : points[active].date.slice(0, 4)}
                  </p>
                  <p className="money text-fg text-sm font-semibold tabular-nums">{formatRupees(points[active].net)}</p>
                  <p className="text-muted mt-1">
                    <span className="money tabular-nums">{formatCompactINR(points[active].assets)}</span> assets ·{" "}
                    <span className="money tabular-nums">{formatCompactINR(points[active].liabilities)}</span> owed
                  </p>
                </div>
              )}
            </div>
            <div className="text-subtle mt-1.5 flex justify-between text-[10px]">
              {points.map((p, i) => (
                <span
                  key={p.date}
                  className={cn(
                    "w-0 text-center whitespace-nowrap",
                    i % 2 === 1 && i !== points.length - 1 && "max-sm:invisible",
                    i === points.length - 1 && "text-fg font-medium",
                  )}
                >
                  {label(p.date, i === points.length - 1)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
