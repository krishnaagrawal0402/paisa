import { describe, expect, it } from "vitest";
import { niceTicks } from "./scale";

describe("niceTicks", () => {
  it("rounds the top up to a clean step", () => {
    expect(niceTicks(87_000)).toEqual([0, 25_000, 50_000, 75_000, 100_000]);
    expect(niceTicks(1_00_000)).toEqual([0, 25_000, 50_000, 75_000, 100_000]);
    expect(niceTicks(9)).toEqual([0, 2.5, 5, 7.5, 10]);
  });

  it("handles small and odd maxima", () => {
    expect(niceTicks(130)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(3_40_000)).toEqual([0, 100_000, 200_000, 300_000, 400_000]);
  });

  it("returns a single zero tick for empty data", () => {
    expect(niceTicks(0)).toEqual([0]);
  });
});
