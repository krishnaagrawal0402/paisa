import { describe, expect, it } from "vitest";
import { parseAmount } from "./amount";

describe("parseAmount", () => {
  it.each([
    ["450", 45000],
    ["₹1,250.50", 125050],
    ["Rs. 99", 9900],
    ["0.5", 50],
    [".75", 75],
    ["12k", 12_00_000],
    ["1.2L", 1_20_000_00],
    ["1.2 lakh", 1_20_000_00],
    ["2cr", 2_00_00_000_00],
    ["  ₹ 1,50,000  ", 1_50_000_00],
  ])("%s → %d paise", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["", "abc", "12x", "0", "-5", "1.234", "1..2"])("rejects %j", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});
