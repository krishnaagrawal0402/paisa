import { describe, expect, it } from "vitest";
import { monthlyEquivalent, nextOccurrence, occurrence, occurrencesUntil } from "./recurring";

describe("occurrence / nextOccurrence", () => {
  it("clamps month-end anchors and returns to the original day", () => {
    expect(occurrence("monthly", "2026-01-31", 1)).toBe("2026-02-28");
    expect(occurrence("monthly", "2026-01-31", 2)).toBe("2026-03-31");
    expect(nextOccurrence("monthly", "2026-01-31", "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence("monthly", "2026-01-31", "2026-02-28")).toBe("2026-03-31");
  });

  it("matches the database for leap-day yearly rules", () => {
    expect(nextOccurrence("yearly", "2024-02-29", "2024-02-29")).toBe("2025-02-28");
    expect(occurrence("yearly", "2024-02-29", 4)).toBe("2028-02-29");
  });

  it("steps weekly across month and year ends", () => {
    expect(nextOccurrence("weekly", "2026-12-28", "2026-12-28")).toBe("2027-01-04");
  });

  it("returns the anchor when it's still in the future", () => {
    expect(nextOccurrence("monthly", "2026-11-01", "2026-10-04")).toBe("2026-11-01");
  });

  it("crosses year boundaries monthly", () => {
    expect(occurrence("monthly", "2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("occurrencesUntil", () => {
  const rule = { frequency: "monthly" as const, anchor_date: "2026-01-05", next_due: "2026-10-05", end_date: null };

  it("lists dues from next_due up to a date", () => {
    expect(occurrencesUntil(rule, "2026-12-31")).toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
    expect(occurrencesUntil(rule, "2026-10-04")).toEqual([]);
  });

  it("stops at the end date", () => {
    expect(occurrencesUntil({ ...rule, end_date: "2026-11-10" }, "2027-12-31")).toEqual(["2026-10-05", "2026-11-05"]);
  });
});

describe("monthlyEquivalent", () => {
  it("normalises weekly and yearly amounts", () => {
    expect(monthlyEquivalent(1200, "weekly")).toBe(5200);
    expect(monthlyEquivalent(12000, "yearly")).toBe(1000);
    expect(monthlyEquivalent(999, "monthly")).toBe(999);
  });
});
