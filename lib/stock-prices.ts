import type { NavHistory } from "@/lib/finance/holdings";

/** Pure helpers for stock prices: turning provider responses into a price history, and ranking search results. */

export type StockListing = { isin: string; symbol: string; name: string };

/** Upstox candles are [timestamp(+05:30), open, high, low, close, volume, oi], newest first. */
export function parseUpstoxCandles(body: unknown): NavHistory {
  const candles = (body as { data?: { candles?: unknown[][] } })?.data?.candles ?? [];
  return candles
    .map((c): [string, number] => [String(c[0]).slice(0, 10), Number(c[4])])
    .filter(([date, close]) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(close) && close > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/** Yahoo chart: parallel arrays of unix times and closes (holidays come back as null), plus the latest price. */
export function parseYahooChart(body: unknown): NavHistory {
  const result = (
    body as {
      chart?: {
        result?: {
          meta?: { regularMarketPrice?: number; regularMarketTime?: number };
          timestamp?: number[];
          indicators?: { quote?: { close?: (number | null)[] }[] };
        }[];
      };
    }
  )?.chart?.result?.[0];
  if (!result) return [];
  const istDate = (unix: number) => new Date((unix + 5.5 * 3600) * 1000).toISOString().slice(0, 10);
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const rows: NavHistory = (result.timestamp ?? [])
    .map((t, i): [string, number] => [istDate(t), Number(closes[i])])
    .filter(([, close]) => Number.isFinite(close) && close > 0);
  const { regularMarketPrice: price, regularMarketTime: time } = result.meta ?? {};
  if (price && time) rows.push([istDate(time), price]);
  return mergeHistory(rows, []);
}

/** Combine histories (e.g. daily closes + today's intraday price); a later source wins on the same date. */
export function mergeHistory(base: NavHistory, newer: NavHistory): NavHistory {
  const byDate = new Map(base);
  for (const [date, price] of newer) byDate.set(date, price);
  return [...byDate].sort((a, b) => a[0].localeCompare(b[0]));
}

const ISIN = /^IN[A-Z0-9]{9}[0-9]$/;

/** Best matches for what someone typed: an exact ISIN or symbol first, then symbol prefixes, then name matches. */
export function rankStocks(list: StockListing[], query: string, limit = 12): StockListing[] {
  const q = query.trim().toUpperCase();
  if (q.length < 2) return [];
  if (ISIN.test(q)) return list.filter((s) => s.isin === q);
  const words = q.split(/\s+/);
  const score = (s: StockListing) => {
    if (s.symbol === q) return 0;
    if (s.symbol.startsWith(q)) return 1;
    if (s.name.startsWith(q)) return 2;
    if (words.every((w) => s.name.includes(w) || s.symbol.includes(w))) return 3;
    return -1;
  };
  return list
    .map((s) => ({ s, rank: score(s) }))
    .filter((x) => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.s.symbol.length - b.s.symbol.length)
    .slice(0, limit)
    .map((x) => x.s);
}
