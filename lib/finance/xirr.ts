/**
 * XIRR: the annual return that makes all dated cash flows net to zero.
 * Money put in is negative, money out (and today's value) positive.
 * Returns a fraction (0.12 = 12% a year), or null when it can't be solved.
 */
export function xirr(flows: { date: string; amount: number }[]): number | null {
  const valid = flows.filter((f) => f.amount !== 0);
  if (!valid.some((f) => f.amount < 0) || !valid.some((f) => f.amount > 0)) return null;
  const t0 = Math.min(...valid.map((f) => Date.parse(`${f.date}T00:00:00Z`)));
  const years = valid.map((f) => (Date.parse(`${f.date}T00:00:00Z`) - t0) / (365 * 86_400_000));
  // Under ~a month of history the annualised figure is meaningless noise.
  if (Math.max(...years) < 30 / 365) return null;

  const npv = (rate: number) => valid.reduce((sum, f, i) => sum + f.amount / (1 + rate) ** years[i], 0);

  // Bisection: robust where Newton's method diverges on lumpy flows.
  let lo = -0.9999;
  let hi = 10;
  let fLo = npv(lo);
  if (fLo * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7 || hi - lo < 1e-9) return mid;
    if (fLo * fMid < 0) hi = mid;
    else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}
