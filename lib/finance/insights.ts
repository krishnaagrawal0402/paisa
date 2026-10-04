import { formatCompactINR, type Paise } from "@/lib/money";

export type Insight = { tone: "good" | "watch" | "info"; emoji: string; text: string };

export type InsightInput = {
  /** This month's spend per category, with the 3-month average before it. */
  categories: { name: string; emoji: string; spent: Paise; typical: Paise }[];
  /** Savings rate per month, oldest first, ending with this month (null = no income). */
  savingsRates: (number | null)[];
  subscriptionsMonthly: Paise;
  noSpendDays: number;
  daysInMonth: number;
};

/**
 * A few plain-language observations about the month. Rule-based: every
 * sentence can be traced to a number on the page.
 */
export function insights(i: InsightInput): Insight[] {
  const out: Insight[] = [];

  // Biggest jump vs usual (ignoring small amounts, which swing wildly).
  const jumps = i.categories
    .filter((c) => c.typical >= 1_000_00 && c.spent > c.typical * 1.25)
    .map((c) => ({ ...c, change: c.spent / c.typical - 1 }))
    .sort((a, b) => b.spent - b.typical - (a.spent - a.typical));
  if (jumps[0]) {
    const j = jumps[0];
    out.push({
      tone: "watch",
      emoji: j.emoji,
      text: `${j.name} is ${Math.round(j.change * 100)}% above your usual (${formatCompactINR(j.spent)} vs ${formatCompactINR(j.typical)}).`,
    });
  }

  const drops = i.categories
    .filter((c) => c.typical >= 2_000_00 && c.spent < c.typical * 0.7)
    .sort((a, b) => b.typical - b.spent - (a.typical - a.spent));
  if (drops[0]) {
    const d = drops[0];
    out.push({
      tone: "good",
      emoji: d.emoji,
      text: `You spent ${formatCompactINR(d.typical - d.spent)} less than usual on ${d.name}.`,
    });
  }

  // Streak of months saving 30%+ (counting back from this month).
  let streak = 0;
  for (let k = i.savingsRates.length - 1; k >= 0; k--) {
    const r = i.savingsRates[k];
    if (r !== null && r >= 0.3) streak++;
    else break;
  }
  if (streak >= 2) out.push({ tone: "good", emoji: "🔥", text: `${streak} months in a row saving 30% or more.` });
  else {
    const latest = i.savingsRates[i.savingsRates.length - 1];
    if (latest !== null && latest !== undefined && latest < 0)
      out.push({ tone: "watch", emoji: "⚠️", text: "You spent more than you earned this month." });
  }

  if (i.subscriptionsMonthly > 0) {
    out.push({
      tone: "info",
      emoji: "📺",
      text: `Subscriptions cost ${formatCompactINR(i.subscriptionsMonthly)} a month (${formatCompactINR(i.subscriptionsMonthly * 12)} a year).`,
    });
  }

  if (i.noSpendDays >= 5) {
    out.push({ tone: "good", emoji: "🧘", text: `${i.noSpendDays} no-spend days out of ${i.daysInMonth}.` });
  }

  return out.slice(0, 4);
}
