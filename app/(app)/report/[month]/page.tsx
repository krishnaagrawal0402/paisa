import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Amount } from "@/components/money/amount";
import { ScoreRing } from "@/components/report/score-ring";
import { ShareButton } from "@/components/report/share-button";
import { StoryButton } from "@/components/report/story";
import { Card, CardLabel } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { getCurrentMonth } from "@/lib/data";
import { formatCompactINR, formatINR } from "@/lib/money";
import { shiftMonthKey } from "@/lib/month";
import { getReport } from "@/lib/report";

export async function generateMetadata({ params }: PageProps<"/report/[month]">) {
  return { title: `Report · ${(await params).month}` };
}

const dayMonth = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

export default async function ReportPage({ params }: PageProps<"/report/[month]">) {
  const { month: key } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) notFound();
  const [report, current] = await Promise.all([getReport(key), getCurrentMonth()]);
  const { totals, health } = report;
  const delta = report.previousScore === null ? null : health.score - report.previousScore;
  const savingsRate = totals.savingsRate === null ? null : Math.round(totals.savingsRate * 100);
  const isLatest = key >= current.key;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-muted text-sm">Report card</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{report.month.label}</h1>
        </div>
        <nav aria-label="Month" className="glass flex items-center gap-1 !rounded-full p-1">
          <Link
            href={`/report/${shiftMonthKey(key, -1)}`}
            aria-label="Previous month"
            className="text-muted hover:bg-glass-hover hover:text-fg grid size-8 place-items-center rounded-full"
          >
            <ChevronLeft className="size-4" />
          </Link>
          {isLatest ? (
            <span className="text-subtle/40 grid size-8 place-items-center">
              <ChevronRight className="size-4" />
            </span>
          ) : (
            <Link
              href={`/report/${shiftMonthKey(key, 1)}`}
              aria-label="Next month"
              className="text-muted hover:bg-glass-hover hover:text-fg grid size-8 place-items-center rounded-full"
            >
              <ChevronRight className="size-4" />
            </Link>
          )}
        </nav>
      </header>

      {!report.hasData ? (
        <Card className="py-12 text-center">
          <p className="text-4xl">🗓️</p>
          <p className="mt-3 font-medium">Nothing logged in {report.month.label}</p>
          <p className="text-muted mt-1 text-sm">
            Reports fill in from your transactions. Import a statement to see past months.
          </p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col items-center gap-6 p-6 sm:flex-row md:p-8">
            <ScoreRing score={health.score} grade={health.grade} />
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <CardLabel>Financial health{report.inProgress && " · so far"}</CardLabel>
              <p className="mt-2 text-lg font-medium">
                {health.provisional
                  ? "Too early to call this month."
                  : health.grade === "A"
                    ? "Excellent. You're doing the things that build wealth."
                    : health.grade === "B"
                      ? "Solid month. A couple of pillars to push on."
                      : health.grade === "C"
                        ? "Okay, with clear room to improve."
                        : "A tough month. The pillars below show where to start."}
              </p>
              {health.provisional && (
                <p className="text-warn mt-2 text-sm">
                  Early read: only {health.pillars.filter((p) => p.ratio !== null).length} of 5 pillars have data so
                  far.
                  {totals.income === 0 && " Log this month's income for the full score."}
                </p>
              )}
              {delta !== null && !health.provisional && (
                <p
                  className={cn(
                    "mt-2 inline-flex items-center gap-1 text-sm",
                    delta >= 0 ? "text-income" : "text-expense",
                  )}
                >
                  {delta >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                  {delta >= 0 ? "+" : ""}
                  {delta} vs last month
                </p>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                <StoryButton report={report} />
                <ShareButton monthKey={key} />
              </div>
            </div>
          </Card>

          <Card>
            <CardLabel>The five pillars</CardLabel>
            <ul className="mt-4 space-y-4">
              {health.pillars.map((p) => (
                <li key={p.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-muted text-xs tabular-nums">
                      {p.ratio === null ? "not counted" : `${Math.round(p.ratio * p.weight)}/${p.weight}`}
                    </span>
                  </div>
                  <div className="bg-save/15 mt-1.5 h-2 overflow-hidden rounded-full" aria-hidden>
                    <div className="bg-save h-full rounded-r-[4px]" style={{ width: `${(p.ratio ?? 0) * 100}%` }} />
                  </div>
                  <p className="text-muted mt-1 text-xs">
                    <span className="text-fg">{p.value}</span> · {p.goal}
                  </p>
                </li>
              ))}
            </ul>
            <details className="text-muted mt-5 text-xs">
              <summary className="hover:text-fg cursor-pointer">How is this calculated?</summary>
              <p className="mt-2 leading-relaxed">
                Each pillar scores from 0 to its weight (30 + 25 + 20 + 15 + 10 = 100). Savings and investing are shares
                of the month&apos;s income. The cushion is cash in your bank, cash and wallet accounts at month end,
                plus investments linked to your emergency fund, divided by your average essential spending over the
                previous 3 months. Debt load is EMIs due ÷ income: full marks at 10% or less, none at 50%+. Pillars
                without data aren&apos;t counted and the rest are re-weighted. A is 85+, B 70+, C 55+.
              </p>
            </details>
          </Card>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Figure label="Earned" paise={totals.income} tone="text-income" />
            <Figure label="Spent" paise={totals.spent} tone="text-expense" />
            <Figure label="Invested" paise={totals.invested} tone="text-invest" />
            <Figure
              label="Saved"
              paise={totals.saved}
              tone="text-save"
              hint={savingsRate === null ? undefined : `${savingsRate}% of income`}
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardLabel>Where it went</CardLabel>
              <ul className="mt-3 space-y-3">
                {report.topCategories.map((c) => (
                  <li key={c.name}>
                    <div className="flex items-baseline gap-2 text-sm">
                      <span aria-hidden>{c.emoji}</span>
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="money font-medium tabular-nums">{formatCompactINR(c.amount)}</span>
                      <span className="text-subtle w-9 text-right text-xs tabular-nums">
                        {Math.round(c.share * 100)}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-2" aria-hidden>
                      <div
                        className="bg-chart-out h-full rounded-r-[4px]"
                        style={{ width: `${Math.max(2, c.share * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
                {report.topCategories.length === 0 && <li className="text-muted text-sm">No spending this month.</li>}
              </ul>
            </Card>

            <div className="grid grid-cols-2 gap-3 self-start">
              {report.biggestExpense && (
                <Card className="col-span-2 p-4">
                  <CardLabel>Biggest spend</CardLabel>
                  <p className="mt-2 flex items-center gap-2">
                    <span className="text-xl">{report.biggestExpense.emoji}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{report.biggestExpense.note}</span>
                    <span className="money font-semibold tabular-nums">{formatINR(report.biggestExpense.amount)}</span>
                  </p>
                  <p className="text-muted mt-1 text-xs">{dayMonth(report.biggestExpense.date)}</p>
                </Card>
              )}
              <Card className="p-4">
                <CardLabel>No-spend days</CardLabel>
                <p className="mt-2 text-2xl font-semibold">
                  {report.noSpendDays}
                  <span className="text-muted text-sm font-normal"> / {report.daysCounted}</span>
                </p>
              </Card>
              <Card className="p-4">
                <CardLabel>Budgets kept</CardLabel>
                <p className="mt-2 text-2xl font-semibold">
                  {report.budgets.total === 0 ? (
                    <Link href="/plan" className="text-save text-sm font-medium">
                      Set budgets →
                    </Link>
                  ) : (
                    <>
                      {report.budgets.kept}
                      <span className="text-muted text-sm font-normal"> / {report.budgets.total}</span>
                    </>
                  )}
                </p>
              </Card>
            </div>
          </div>

          {report.insights.length > 0 && (
            <Card>
              <CardLabel>Worth knowing</CardLabel>
              <ul className="mt-3 space-y-2.5">
                {report.insights.map((i) => (
                  <li key={i.text} className="flex gap-3 text-sm">
                    <span aria-hidden>{i.emoji}</span>
                    <span className={cn("money", i.tone === "watch" && "text-warn")}>{i.text}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Figure({ label, paise, tone, hint }: { label: string; paise: number; tone: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className={cn("text-xs font-medium tracking-[0.08em] uppercase", tone)}>{label}</p>
      <p className="mt-2 text-xl font-semibold">
        <Amount paise={paise} compact />
      </p>
      {hint && <p className="text-subtle mt-1 text-xs">{hint}</p>}
    </Card>
  );
}
