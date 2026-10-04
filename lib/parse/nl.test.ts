import { describe, expect, it } from "vitest";
import { parseNatural, type NLContext } from "./nl";
import type { Account, Category } from "@/lib/types";

const account = (id: string, name: string, type: Account["type"]): Account => ({
  id,
  name,
  type,
  opening_balance: 0,
  archived: false,
  sort: 0,
});
const category = (id: string, name: string, kind: "income" | "expense" = "expense"): Category => ({
  id,
  name,
  kind,
  emoji: "",
  is_essential: false,
  archived: false,
  sort: 0,
});

// Sunday 4 Oct 2026.
const ctx: NLContext = {
  today: "2026-10-04",
  accounts: [
    account("hdfc", "HDFC Savings", "bank"),
    account("icici", "ICICI Bank", "bank"),
    account("cash", "Cash", "cash"),
    account("card", "Amex Card", "credit_card"),
    account("zerodha", "Zerodha", "wallet"),
  ],
  categories: [
    category("food", "Food & Dining"),
    category("rent", "Rent"),
    category("transport", "Transport"),
    category("salary", "Salary", "income"),
    category("refund", "Refund", "income"),
  ],
  rules: [],
};

describe("parseNatural", () => {
  it("450 swiggy dinner", () => {
    expect(parseNatural("450 swiggy dinner", ctx)).toEqual({
      type: "expense",
      amount: 45000,
      categoryId: "food",
      accountId: null,
      toAccountId: null,
      date: null,
      note: "Swiggy dinner",
    });
  });

  it("got salary 1.2L", () => {
    expect(parseNatural("got salary 1.2L", ctx)).toMatchObject({
      type: "income",
      amount: 1_20_000_00,
      categoryId: "salary",
      note: "Salary",
    });
  });

  it("12k rent yesterday hdfc", () => {
    expect(parseNatural("12k rent yesterday hdfc", ctx)).toMatchObject({
      type: "expense",
      amount: 12_000_00,
      categoryId: "rent",
      accountId: "hdfc",
      date: "2026-10-03",
      note: "Rent",
    });
  });

  it("moved 20k hdfc to zerodha", () => {
    expect(parseNatural("moved 20k hdfc to zerodha", ctx)).toMatchObject({
      type: "transfer",
      amount: 20_000_00,
      accountId: "hdfc",
      toAccountId: "zerodha",
      categoryId: null,
    });
  });

  it("detects a transfer from '<account> to <account>' alone", () => {
    expect(parseNatural("5000 icici to hdfc", ctx)).toMatchObject({
      type: "transfer",
      accountId: "icici",
      toAccountId: "hdfc",
    });
  });

  it("atm 2000 is a bank → cash transfer", () => {
    expect(parseNatural("atm 2000 hdfc", ctx)).toMatchObject({
      type: "transfer",
      accountId: "hdfc",
      toAccountId: "cash",
    });
  });

  it("uber 230 on 3rd, with ordinal dates in the past", () => {
    expect(parseNatural("uber 230 on 3rd", ctx)).toMatchObject({
      amount: 23000,
      categoryId: "transport",
      date: "2026-10-03",
    });
    // The 20th hasn't happened yet this month → last month.
    expect(parseNatural("uber 230 20th", ctx).date).toBe("2026-09-20");
  });

  it("understands day-month dates without picking them as the amount", () => {
    expect(parseNatural("dinner 1500 on 2/10", ctx)).toMatchObject({ amount: 150000, date: "2026-10-02" });
    expect(parseNatural("3 oct 800 auto", ctx)).toMatchObject({ amount: 80000, date: "2026-10-03" });
    expect(parseNatural("oct 1 rent 25000", ctx)).toMatchObject({ amount: 25_000_00, date: "2026-10-01" });
    // 25 Dec hasn't come yet this year → last year.
    expect(parseNatural("gift 2000 25 dec", ctx).date).toBe("2025-12-25");
  });

  it("weekdays and relative days", () => {
    expect(parseNatural("chai 20 friday", ctx).date).toBe("2026-10-02");
    expect(parseNatural("chai 20 last sunday", ctx).date).toBe("2026-09-27");
    expect(parseNatural("chai 20 day before yesterday", ctx).date).toBe("2026-10-02");
    expect(parseNatural("chai 20 3 days ago", ctx).date).toBe("2026-10-01");
  });

  it("prefers an explicitly marked amount, else the biggest number", () => {
    expect(parseNatural("2 coffees 300", ctx).amount).toBe(30000);
    expect(parseNatural("table for 4 rs 2400", ctx).amount).toBe(240000);
    expect(parseNatural("bonus 1.5 lakh", ctx)).toMatchObject({ type: "income", amount: 1_50_000_00 });
  });

  it("picks accounts by type words", () => {
    expect(parseNatural("petrol 2000 card", ctx).accountId).toBe("card");
    expect(parseNatural("vegetables 120 cash", ctx).accountId).toBe("cash");
  });

  it("learned rules win over the built-in list", () => {
    const withRule = { ...ctx, rules: [{ pattern: "swiggy", category_id: "rent" }] };
    expect(parseNatural("swiggy 300", withRule).categoryId).toBe("rent");
  });

  it("copes with nothing useful", () => {
    expect(parseNatural("", ctx)).toMatchObject({ amount: null, note: null, type: "expense" });
    expect(parseNatural("hello", ctx)).toMatchObject({ amount: null, note: "Hello", categoryId: null });
  });
});
