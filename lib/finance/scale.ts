/**
 * A clean axis maximum and evenly spaced ticks: 0 / 25K / 50K / 75K / 1L, never 0 / 23.7K / 47.4K.
 * Steps are 1, 2, 2.5 or 5 × a power of ten.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const steps = Math.ceil(max / step - 1e-9);
  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}

/** Ticks covering [min, max] (which may dip below zero) in clean steps. */
export function domainTicks(min: number, max: number): number[] {
  // Always include zero, so the area is drawn from a meaningful baseline.
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  const span = Math.max(hi - lo, 1);
  const step = niceTicks(span, 4)[1] ?? span;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 1e6; v += step) ticks.push(Math.round(v));
  return ticks;
}
