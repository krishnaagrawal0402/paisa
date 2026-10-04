import "server-only";
import type { NavHistory } from "@/lib/finance/holdings";

/**
 * Mutual fund NAVs from mfapi.in (free, public AMFI data, no key).
 * Responses are cached by Next.js for 6 hours, so a page view rarely waits on it.
 */

const API = "https://api.mfapi.in/mf";
const SIX_HOURS = 6 * 60 * 60;

export type Scheme = { code: number; name: string };

export async function searchSchemes(query: string): Promise<Scheme[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`, { next: { revalidate: SIX_HOURS } });
  if (!res.ok) return [];
  const data = (await res.json()) as { schemeCode: number; schemeName: string }[];
  // Direct growth plans first: what most people hold, and lower cost.
  const rank = (name: string) => (/direct/i.test(name) ? 0 : 2) + (/growth/i.test(name) ? 0 : 1);
  return data
    .map((s) => ({ code: s.schemeCode, name: s.schemeName }))
    .sort((a, b) => rank(a.name) - rank(b.name))
    .slice(0, 20);
}

/** Full NAV history, oldest first. Null if the feed is unreachable (values fall back to cost). */
export async function navHistory(code: number): Promise<NavHistory | null> {
  try {
    const res = await fetch(`${API}/${code}`, { next: { revalidate: SIX_HOURS } });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { date: string; nav: string }[] };
    const rows = (data.data ?? [])
      .map(({ date, nav }): [string, number] => {
        const [d, m, y] = date.split("-");
        return [`${y}-${m}-${d}`, Number(nav)];
      })
      .filter(([, nav]) => Number.isFinite(nav) && nav > 0);
    return rows.sort((a, b) => a[0].localeCompare(b[0]));
  } catch {
    return null;
  }
}

export async function navHistories(codes: number[]): Promise<Map<number, NavHistory>> {
  const unique = [...new Set(codes)];
  const results = await Promise.all(unique.map(async (code) => [code, await navHistory(code)] as const));
  return new Map(results.filter((r): r is [number, NavHistory] => r[1] !== null));
}
