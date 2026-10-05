import { describe, expect, it } from "vitest";
import { mergeHistory, parseUpstoxCandles, parseYahooChart, rankStocks } from "./stock-prices";

describe("parseUpstoxCandles", () => {
  it("keeps date and close, oldest first, and drops junk", () => {
    const body = {
      status: "success",
      data: {
        candles: [
          ["2026-10-01T00:00:00+05:30", 1180.1, 1183.9, 1160.8, 1167.7, 16771221, 0],
          ["2026-09-30T00:00:00+05:30", 1182.0, 1196.5, 1181.7, 1187.0, 16376789, 0],
          ["garbage", 1, 1, 1, 0, 0, 0],
        ],
      },
    };
    expect(parseUpstoxCandles(body)).toEqual([
      ["2026-09-30", 1187],
      ["2026-10-01", 1167.7],
    ]);
    expect(parseUpstoxCandles({ status: "error" })).toEqual([]);
  });
});

describe("parseYahooChart", () => {
  it("converts unix times to India dates, skips holiday nulls, and adds the latest price", () => {
    const body = {
      chart: {
        result: [
          {
            meta: { regularMarketPrice: 1188.3, regularMarketTime: 1791190527 }, // 5 Oct 2026, 14:25 IST
            timestamp: [1790821800, 1790908200, 1791167400], // 1, 2 and 5 Oct 2026, 08:00 IST
            indicators: { quote: [{ close: [1167.7, null, 1185.0] }] },
          },
        ],
      },
    };
    expect(parseYahooChart(body)).toEqual([
      ["2026-10-01", 1167.7],
      ["2026-10-05", 1188.3],
    ]);
    expect(parseYahooChart({ chart: { result: null } })).toEqual([]);
  });
});

describe("mergeHistory", () => {
  it("lets newer prices replace the same day", () => {
    expect(mergeHistory([["2026-10-05", 260]], [["2026-10-05", 267.8]])).toEqual([["2026-10-05", 267.8]]);
  });
});

describe("rankStocks", () => {
  const list = [
    { isin: "INE002A01018", symbol: "RELIANCE", name: "RELIANCE INDUSTRIES LTD" },
    { isin: "INE467B01029", symbol: "TCS", name: "TATA CONSULTANCY SERV LT" },
    { isin: "INE155A01022", symbol: "TATAMOTORS", name: "TATA MOTORS LIMITED" },
    { isin: "INE154A01025", symbol: "ITC", name: "ITC LTD" },
  ];

  it("puts exact symbols first, then prefixes, then name words", () => {
    expect(rankStocks(list, "tcs").map((s) => s.symbol)).toEqual(["TCS"]);
    expect(rankStocks(list, "tata").map((s) => s.symbol)).toEqual(["TATAMOTORS", "TCS"]);
    expect(rankStocks(list, "reliance ind").map((s) => s.symbol)).toEqual(["RELIANCE"]);
  });

  it("finds a stock by ISIN, and ignores one-letter queries", () => {
    expect(rankStocks(list, "ine154a01025").map((s) => s.symbol)).toEqual(["ITC"]);
    expect(rankStocks(list, "t")).toEqual([]);
  });
});
