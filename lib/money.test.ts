import { describe, expect, it } from "vitest";
import { formatCompactINR, formatINR, toPaise, toRupees } from "./money";

describe("toPaise / toRupees", () => {
  it("converts without float drift", () => {
    expect(toPaise(0.1 + 0.2)).toBe(30);
    expect(toPaise(1250.5)).toBe(125050);
    expect(toRupees(125050)).toBe(1250.5);
  });
});

describe("formatINR", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(toPaise(150000))).toBe("₹1,50,000");
    expect(formatINR(toPaise(12345678))).toBe("₹1,23,45,678");
  });

  it("shows paise only when present unless exact", () => {
    expect(formatINR(125050)).toBe("₹1,250.50");
    expect(formatINR(100000)).toBe("₹1,000");
    expect(formatINR(100000, { exact: true })).toBe("₹1,000.00");
  });

  it("handles negatives and explicit signs", () => {
    expect(formatINR(-toPaise(1234567))).toBe("-₹12,34,567");
    expect(formatINR(toPaise(500), { sign: true })).toBe("+₹500");
    expect(formatINR(0, { sign: true })).toBe("₹0");
  });
});

describe("formatCompactINR", () => {
  it.each([
    [950, "₹950"],
    [12_000, "₹12K"],
    [1_50_000, "₹1.5L"],
    [1_20_000, "₹1.2L"],
    [21_00_00_000, "₹21Cr"],
    [2_15_00_000, "₹2.2Cr"],
  ])("%d rupees → %s", (rupees, expected) => {
    expect(formatCompactINR(toPaise(rupees))).toBe(expected);
  });

  it("handles signs", () => {
    expect(formatCompactINR(-toPaise(68_000))).toBe("-₹68K");
    expect(formatCompactINR(toPaise(1_20_000), { sign: true })).toBe("+₹1.2L");
  });
});
