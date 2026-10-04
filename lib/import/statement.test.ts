import { describe, expect, it } from "vitest";
import {
  buildRows,
  detectDateFormat,
  findDuplicates,
  fingerprints,
  guessMapping,
  parseDateCell,
  parseMoneyCell,
} from "./statement";

// A savings-account export: preamble, then separate withdrawal/deposit columns.
const splitStatement = [
  ["Account Statement"],
  ["Name: K A", "", "Account No: XXXX1234"],
  [""],
  ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
  ["01/10/26", "UPI-SWIGGY-SWIGGY@YBL-YESB0000001-412345678901-PAYMENT", "4123", "01/10/26", "450.00", "", "49,550.00"],
  ["01/10/26", "SALARY OCT ACME", "", "01/10/26", "", "1,20,000.00", "1,69,550.00"],
  ["13/10/26", "POS 5123XXXX1234 AMAZON", "", "13/10/26", "1,299.00", "", "1,68,251.00"],
  ["", "", "", "", "", "", ""],
  ["Total", "", "", "", "1,749.00", "1,20,000.00", ""],
];

// A card/fintech-style export: one signed amount column, ISO dates.
const signedStatement = [
  ["Transaction Date", "Description", "Amount (INR)"],
  ["2026-10-02", "Netflix", "-649.00"],
  ["2026-10-03", "Refund Myntra", "1,200"],
];

describe("guessMapping", () => {
  it("finds the header past a preamble and maps withdrawal/deposit columns", () => {
    const m = guessMapping(splitStatement);
    expect(m).toMatchObject({
      headerRow: 3,
      date: 0,
      description: 1,
      debit: 4,
      credit: 5,
      amount: null,
      dateFormat: "dmy",
    });
  });

  it("maps a single signed amount column", () => {
    expect(guessMapping(signedStatement)).toMatchObject({
      headerRow: 0,
      date: 0,
      description: 1,
      debit: null,
      credit: null,
      amount: 2,
      dateFormat: "ymd",
    });
  });
});

describe("buildRows", () => {
  it("turns statement lines into transactions and skips totals/blank rows", () => {
    const { rows, skipped } = buildRows(splitStatement, guessMapping(splitStatement));
    expect(rows).toEqual([
      { line: 5, date: "2026-10-01", description: splitStatement[4][1], type: "expense", amount: 45000 },
      { line: 6, date: "2026-10-01", description: "SALARY OCT ACME", type: "income", amount: 1_20_000_00 },
      { line: 7, date: "2026-10-13", description: "POS 5123XXXX1234 AMAZON", type: "expense", amount: 129900 },
    ]);
    expect(skipped).toBe(2);
  });

  it("reads signs, and can flip them for card statements", () => {
    const m = guessMapping(signedStatement);
    expect(buildRows(signedStatement, m).rows.map((r) => r.type)).toEqual(["expense", "income"]);
    expect(buildRows(signedStatement, { ...m, outflowSign: "positive" }).rows.map((r) => r.type)).toEqual([
      "income",
      "expense",
    ]);
  });

  it("uses a Dr/Cr column when there is one", () => {
    const rows = [
      ["Date", "Particulars", "Amount", "Dr/Cr"],
      ["05-10-2026", "Rent", "25000", "DR"],
      ["06-10-2026", "Interest", "120.50", "CR"],
    ];
    const m = guessMapping(rows);
    expect(m.drcr).toBe(3);
    expect(buildRows(rows, m).rows.map((r) => [r.type, r.amount])).toEqual([
      ["expense", 2500000],
      ["income", 12050],
    ]);
  });
});

describe("dates and money", () => {
  it("parses common date formats", () => {
    expect(parseDateCell("03/10/2026", "dmy")).toBe("2026-10-03");
    expect(parseDateCell("3-10-26", "dmy")).toBe("2026-10-03");
    expect(parseDateCell("10/03/2026", "mdy")).toBe("2026-10-03");
    expect(parseDateCell("2026-10-03", "ymd")).toBe("2026-10-03");
    expect(parseDateCell("03 Oct 2026", "dmony")).toBe("2026-10-03");
    expect(parseDateCell("03-Oct-26 14:32", "dmony")).toBe("2026-10-03");
    expect(parseDateCell("31/02/2026", "dmy")).toBeNull();
  });

  it("detects the format, preferring day-first when ambiguous", () => {
    expect(detectDateFormat(["01/10/26", "02/10/26"])).toBe("dmy");
    expect(detectDateFormat(["10/13/2026", "10/14/2026"])).toBe("mdy");
    expect(detectDateFormat(["13/10/2026"])).toBe("dmy");
    expect(detectDateFormat(["01 Oct 2026"])).toBe("dmony");
  });

  it("parses Indian-formatted and annotated amounts", () => {
    expect(parseMoneyCell("1,23,456.78")).toBe(12345678);
    expect(parseMoneyCell("₹ 500")).toBe(50000);
    expect(parseMoneyCell("(1,200.00)")).toBe(-120000);
    expect(parseMoneyCell("-45")).toBe(-4500);
    expect(parseMoneyCell("500.00 Dr")).toBe(-50000);
    expect(parseMoneyCell("500.00 Cr")).toBe(50000);
    expect(parseMoneyCell("")).toBeNull();
    expect(parseMoneyCell("abc")).toBeNull();
  });
});

describe("fingerprints & duplicates", () => {
  const rows = [
    { line: 2, date: "2026-10-01", description: "Chai", type: "expense" as const, amount: 2000 },
    { line: 3, date: "2026-10-01", description: "Chai", type: "expense" as const, amount: 2000 },
    { line: 4, date: "2026-10-02", description: "Rent", type: "expense" as const, amount: 2500000 },
  ];

  it("gives identical lines different but stable fingerprints", () => {
    const a = fingerprints(rows);
    expect(new Set(a).size).toBe(3);
    expect(fingerprints(rows)).toEqual(a);
  });

  it("flags previously imported lines and likely hand-typed duplicates", () => {
    const hashes = fingerprints(rows);
    const existing = [
      { occurred_on: "2026-10-01", type: "expense", amount: 2000, import_hash: hashes[0] },
      { occurred_on: "2026-10-03", type: "expense", amount: 2500000, import_hash: null },
    ];
    expect(findDuplicates(rows, hashes, existing)).toEqual(["imported", null, "possible"]);
  });
});
