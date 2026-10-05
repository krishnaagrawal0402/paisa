import "server-only";
import { gunzipSync } from "node:zlib";
import { appConfig } from "@/config/app";
import { getServerEnv } from "@/lib/env";
import type { NavHistory } from "@/lib/finance/holdings";
import { addDays, todayIn } from "@/lib/month";
import { mergeHistory, parseUpstoxCandles, parseYahooChart, rankStocks, type StockListing } from "@/lib/stock-prices";

/**
 * Stock prices for individual holdings, fetched by this server for its own
 * users. No key needed. Sources (STOCK_PRICES env var):
 *   upstox (default): Upstox's open daily-candle endpoints, keyed by ISIN; Yahoo as a fallback.
 *   yahoo: Yahoo Finance's chart endpoint, keyed by NSE symbol.
 *   off: no fetching; stocks show the value you last entered, or what you put in.
 * Neither is a licensed market-data feed: prices are for the user's own tracking, and can lag or fail.
 */

const UPSTOX = "https://api.upstox.com/v3/historical-candle";
const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";
const LIST_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";
const SIX_HOURS = 6 * 60 * 60;
// Yahoo rejects requests without a browser-like user agent.
const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; Paisa)" };

// ─── search ──────────────────────────────────────────────────────────────────

let listCache: { at: number; rows: StockListing[] } | null = null;

/** Every NSE equity (about 2,700), from Upstox's public instrument file. Kept in memory for a day. */
async function stockList(): Promise<StockListing[]> {
  if (listCache && Date.now() - listCache.at < 24 * 3600 * 1000) return listCache.rows;
  // The file is ~2 MB gzipped / 36 MB of JSON: too big for Next's data cache, so it's fetched fresh and trimmed.
  const res = await fetch(LIST_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Stock list unavailable (${res.status})`);
  const all = JSON.parse(gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8")) as {
    segment: string;
    instrument_type: string;
    isin: string;
    trading_symbol: string;
    name: string;
  }[];
  const rows = all
    .filter((r) => r.segment === "NSE_EQ" && r.instrument_type === "EQ" && r.isin)
    .map((r) => ({ isin: r.isin, symbol: r.trading_symbol, name: r.name }));
  listCache = { at: Date.now(), rows };
  return rows;
}

export async function searchStocks(query: string): Promise<StockListing[] | null> {
  try {
    return rankStocks(await stockList(), query);
  } catch (error) {
    console.error("Stock search failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

// ─── prices ──────────────────────────────────────────────────────────────────

async function getJson(url: string, revalidate: number, headers?: HeadersInit): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers, next: { revalidate } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** About 13 months of daily closes plus today's price, from Upstox. */
async function upstoxHistory(isin: string): Promise<NavHistory | null> {
  const key = encodeURIComponent(`NSE_EQ|${isin}`);
  const today = todayIn(appConfig.timeZone);
  const from = addDays(today, -400);
  const [daily, intraday] = await Promise.all([
    getJson(`${UPSTOX}/${key}/days/1/${today}/${from}`, SIX_HOURS),
    getJson(`${UPSTOX}/intraday/${key}/days/1`, 30 * 60),
  ]);
  const history = mergeHistory(parseUpstoxCandles(daily), parseUpstoxCandles(intraday));
  return history.length > 0 ? history : null;
}

async function yahooHistory(ticker: string): Promise<NavHistory | null> {
  const body = await getJson(
    `${YAHOO}/${encodeURIComponent(`${ticker}.NS`)}?range=2y&interval=1d`,
    SIX_HOURS,
    YAHOO_HEADERS,
  );
  const history = parseYahooChart(body);
  return history.length > 0 ? history : null;
}

/** Daily price history for one stock, oldest first, or null if no source answered. */
export async function stockHistory(stock: { isin: string | null; ticker: string | null }): Promise<NavHistory | null> {
  const source = getServerEnv().stockPrices;
  if (source === "off") return null;
  if (source === "upstox" && stock.isin) {
    const history = await upstoxHistory(stock.isin);
    if (history) return history;
  }
  return stock.ticker ? yahooHistory(stock.ticker) : null;
}

/** Histories for several stocks at once, keyed by ISIN. */
export async function stockHistories(
  stocks: { isin: string | null; ticker: string | null }[],
): Promise<Map<string, NavHistory>> {
  const unique = [...new Map(stocks.filter((s) => s.isin).map((s) => [s.isin!, s])).values()];
  const results = await Promise.all(unique.map(async (s) => [s.isin!, await stockHistory(s)] as const));
  return new Map(results.filter((r): r is [string, NavHistory] => r[1] !== null));
}
