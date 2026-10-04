import { describe, expect, it } from "vitest";
import {
  addDays,
  daysLeft,
  financialMonthFor,
  financialMonthFromKey,
  nextDayOfMonth,
  ordinal,
  shiftMonthKey,
  todayIn,
} from "./month";

describe("financialMonthFor", () => {
  it("uses calendar months when payday is the 1st", () => {
    expect(financialMonthFor("2026-10-04", 1)).toEqual({
      key: "2026-10",
      start: "2026-10-01",
      end: "2026-10-31",
      label: "October 2026",
    });
    expect(financialMonthFor("2024-02-10", 1).end).toBe("2024-02-29");
  });

  it("starts on payday and is named after the month it ends in", () => {
    const oct = financialMonthFor("2026-10-04", 28);
    expect(oct).toMatchObject({ key: "2026-10", start: "2026-09-28", end: "2026-10-27" });
    expect(oct.label).toBe("28 Sept – 27 Oct 2026");

    expect(financialMonthFor("2026-10-28", 28)).toMatchObject({
      key: "2026-11",
      start: "2026-10-28",
      end: "2026-11-27",
    });
    expect(financialMonthFor("2026-10-27", 28).key).toBe("2026-10");
  });

  it("crosses year boundaries", () => {
    expect(financialMonthFor("2026-12-30", 25)).toMatchObject({
      key: "2027-01",
      start: "2026-12-25",
      end: "2027-01-24",
    });
    expect(financialMonthFromKey("2027-01", 25).start).toBe("2026-12-25");
  });
});

describe("helpers", () => {
  it("shifts month keys across years", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
  });

  it("formats today in a time zone", () => {
    // 20:00 UTC on 3 Oct is already 4 Oct in India.
    expect(todayIn("Asia/Kolkata", new Date("2026-10-03T20:00:00Z"))).toBe("2026-10-04");
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("counts days left including today", () => {
    const oct = financialMonthFromKey("2026-10", 1);
    expect(daysLeft(oct, "2026-10-31")).toBe(1);
    expect(daysLeft(oct, "2026-10-04")).toBe(28);
  });
});

describe("nextDayOfMonth and ordinal", () => {
  it("finds the next payday, rolling into next month and year", () => {
    expect(nextDayOfMonth("2026-10-04", 4)).toBe("2026-10-04");
    expect(nextDayOfMonth("2026-10-04", 28)).toBe("2026-10-28");
    expect(nextDayOfMonth("2026-12-29", 1)).toBe("2027-01-01");
  });

  it("writes ordinals, including the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
    ]);
  });
});
