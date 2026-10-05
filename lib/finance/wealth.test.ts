import { describe, expect, it } from "vitest";
import { toPaise } from "@/lib/money";
import { fdValue } from "./fd";
import { isManual, navAt, positionAt, type Holding, type NavHistory } from "./holdings";
import { emiFor, loanStatus } from "./loan";
import { xirr } from "./xirr";

describe("fdValue", () => {
  it("compounds quarterly by default", () => {
    // ₹1L at 7% for exactly one year, quarterly: 1.0175^4
    expect(fdValue(toPaise(100_000), 7, "2025-10-04", "2026-10-04")).toBe(Math.round(toPaise(100_000) * 1.0175 ** 4));
  });

  it("stops growing at maturity and is just the principal before start", () => {
    const atMaturity = fdValue(toPaise(100_000), 7, "2025-01-01", "2026-01-01", "quarterly", "2026-01-01");
    expect(fdValue(toPaise(100_000), 7, "2025-01-01", "2027-06-01", "quarterly", "2026-01-01")).toBe(atMaturity);
    expect(fdValue(toPaise(100_000), 7, "2026-01-01", "2025-12-01")).toBe(toPaise(100_000));
  });

  it("supports simple interest", () => {
    expect(fdValue(toPaise(100_000), 10, "2025-10-04", "2026-10-04", "simple")).toBe(toPaise(110_000));
  });
});

describe("loans", () => {
  it("computes a standard EMI", () => {
    // ₹10L, 9%, 20 years → ≈ ₹8,997
    expect(Math.round(emiFor(toPaise(10_00_000), 9, 240) / 100)).toBe(8997);
    expect(emiFor(toPaise(12_000), 0, 12)).toBe(toPaise(1_000));
  });

  const loan = {
    principal: toPaise(12_000),
    annual_rate: 0,
    tenure_months: 12,
    first_emi_date: "2026-01-05",
    emi: toPaise(1_000),
    outstanding_override: null,
    override_at: null,
  };

  it("counts EMIs paid and what's left", () => {
    expect(loanStatus(loan, "2026-01-04")).toMatchObject({ outstanding: toPaise(12_000), emisPaid: 0, emisLeft: 12 });
    expect(loanStatus(loan, "2026-03-05")).toMatchObject({
      outstanding: toPaise(9_000),
      emisPaid: 3,
      emisLeft: 9,
      payoffDate: "2026-12-05",
    });
    expect(loanStatus(loan, "2027-06-01")).toMatchObject({ outstanding: 0, emisLeft: 0, payoffDate: null });
  });

  it("restarts the schedule from a prepayment override", () => {
    const prepaid = { ...loan, outstanding_override: toPaise(4_000), override_at: "2026-03-10" };
    expect(loanStatus(prepaid, "2026-04-05")).toMatchObject({
      outstanding: toPaise(3_000),
      emisLeft: 3,
      payoffDate: "2026-07-05",
    });
    // Before the override date the normal schedule applies.
    expect(loanStatus(prepaid, "2026-02-05").outstanding).toBe(toPaise(10_000));
  });

  it("accrues interest on the reducing balance", () => {
    const real = {
      ...loan,
      principal: toPaise(10_00_000),
      annual_rate: 9,
      tenure_months: 240,
      emi: emiFor(toPaise(10_00_000), 9, 240),
    };
    const after1 = loanStatus(real, "2026-01-05");
    // First EMI: interest ₹7,500, principal ≈ ₹1,497.
    expect(Math.round(after1.outstanding / 100)).toBe(998_503);
    expect(after1.emisLeft).toBe(239);
  });
});

describe("xirr", () => {
  it("finds a simple annual return", () => {
    expect(
      xirr([
        { date: "2025-01-01", amount: -100 },
        { date: "2026-01-01", amount: 110 },
      ]),
    ).toBeCloseTo(0.1, 3);
  });

  it("handles monthly SIP-like flows", () => {
    const flows = Array.from({ length: 12 }, (_, i) => ({
      date: `2025-${String(i + 1).padStart(2, "0")}-01`,
      amount: -1000,
    }));
    const r = xirr([...flows, { date: "2026-01-01", amount: 12_660 }]);
    expect(r).toBeGreaterThan(0.09);
    expect(r).toBeLessThan(0.12);
  });

  it("returns null without both in and out flows, or with too little history", () => {
    expect(xirr([{ date: "2025-01-01", amount: -100 }])).toBeNull();
    expect(
      xirr([
        { date: "2026-01-01", amount: -100 },
        { date: "2026-01-10", amount: 101 },
      ]),
    ).toBeNull();
  });
});

describe("positionAt", () => {
  const base: Holding = {
    id: "h",
    name: "Fund",
    asset_class: "mutual_fund",
    scheme_code: 1,
    opening_units: 100,
    opening_cost: toPaise(5_000),
    opening_date: "2025-01-01",
    manual_value: null,
    manual_value_at: null,
    fd_rate: null,
    fd_start: null,
    fd_maturity: null,
    fd_compounding: null,
    platform: null,
    isin: null,
    ticker: null,
    archived: false,
  };
  const nav: NavHistory = [
    ["2025-01-01", 50],
    ["2025-07-01", 50],
    ["2026-01-01", 60],
  ];

  it("finds the NAV on or before a date", () => {
    expect(navAt(nav, "2025-12-31")).toBe(50);
    expect(navAt(nav, "2026-02-01")).toBe(60);
    expect(navAt(nav, "2024-12-31")).toBeNull();
  });

  it("values funds from units × NAV, buying units at that day's NAV", () => {
    const p = positionAt(
      base,
      [{ holding_id: "h", type: "invest", amount: toPaise(5_000), occurred_on: "2025-07-01", units: null }],
      "2026-01-01",
      nav,
    );
    expect(p.units).toBeCloseTo(200);
    expect(p.invested).toBe(toPaise(10_000));
    expect(p.value).toBe(toPaise(12_000));
    expect(p.gain).toBe(toPaise(2_000));
    expect(p.xirr).toBeGreaterThan(0.15);
    expect(p.estimated).toBe(false);
  });

  it("uses the last manual value plus later top-ups, and flags stale values", () => {
    const ppf: Holding = {
      ...base,
      asset_class: "ppf",
      scheme_code: null,
      opening_units: 0,
      manual_value: toPaise(2_00_000),
      manual_value_at: "2026-04-01",
    };
    const flows = [
      { holding_id: "h", type: "invest" as const, amount: toPaise(10_000), occurred_on: "2026-05-01", units: null },
    ];
    expect(positionAt(ppf, flows, "2026-05-10").value).toBe(toPaise(2_10_000));
    expect(positionAt(ppf, flows, "2026-05-10").estimated).toBe(false);
    expect(positionAt(ppf, flows, "2026-08-10").estimated).toBe(true);
  });

  it("values FDs from rate and start date", () => {
    const fd: Holding = {
      ...base,
      asset_class: "fd",
      scheme_code: null,
      opening_units: 0,
      opening_cost: toPaise(1_00_000),
      fd_rate: 7,
      fd_start: "2025-10-04",
      fd_compounding: "quarterly",
      opening_date: "2025-10-04",
    };
    expect(positionAt(fd, [], "2026-10-04").value).toBe(fdValue(toPaise(1_00_000), 7, "2025-10-04", "2026-10-04"));
  });

  it("is empty before the holding was opened", () => {
    expect(positionAt(base, [], "2024-06-01", nav)).toMatchObject({ units: 0, invested: 0, value: 0 });
  });

  it("prices a stock with an ISIN as shares × close, including shares bought later", () => {
    const stock: Holding = {
      ...base,
      asset_class: "stock",
      scheme_code: null,
      isin: "INE154A01025",
      ticker: "ITC",
      opening_units: 10,
      opening_cost: toPaise(4_000),
    };
    const prices: NavHistory = [
      ["2025-01-01", 400],
      ["2026-03-02", 300],
      ["2026-10-05", 267.8],
    ];
    // Bought ₹3,000 more on 2 Mar 2026 at ₹300 = 10 shares (worked out from the price).
    const buy = [
      { holding_id: "h", type: "invest" as const, amount: toPaise(3_000), occurred_on: "2026-03-02", units: null },
    ];
    const p = positionAt(stock, buy, "2026-10-05", prices);
    expect(p.units).toBe(20);
    expect(p.value).toBe(toPaise(5_356));
    expect(p.invested).toBe(toPaise(7_000));
    expect(isManual(stock)).toBe(false);
    expect(isManual({ ...stock, isin: null })).toBe(true);
  });
});
