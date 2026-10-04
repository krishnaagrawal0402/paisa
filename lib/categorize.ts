import { MERCHANT_CATEGORIES } from "@/lib/parse/merchants";
import type { Category, CategoryKind } from "@/lib/types";

export type CategoryRule = { pattern: string; category_id: string };

export type CategoryMatch = {
  categoryId: string;
  /** The keyword that matched, e.g. "swiggy". */
  keyword: string;
  source: "rule" | "merchant" | "name";
};

function containsPhrase(text: string, phrase: string) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
}

/**
 * Suggest a category for free text (a typed note or a cleaned bank narration):
 * the user's learned rules first, then the built-in merchant list, then a
 * category whose own name appears in the text ("rent" → Rent).
 */
export function suggestCategory(
  text: string,
  { rules, categories, kind }: { rules: CategoryRule[]; categories: Category[]; kind: CategoryKind },
): CategoryMatch | null {
  const haystack = text.toLowerCase();
  const usable = categories.filter((c) => c.kind === kind && !c.archived);
  const byId = new Map(usable.map((c) => [c.id, c]));

  // Longest patterns first, so "amazon prime" beats "amazon".
  for (const rule of [...rules].sort((a, b) => b.pattern.length - a.pattern.length)) {
    if (byId.has(rule.category_id) && containsPhrase(haystack, rule.pattern)) {
      return { categoryId: rule.category_id, keyword: rule.pattern, source: "rule" };
    }
  }

  const keywords = Object.keys(MERCHANT_CATEGORIES).sort((a, b) => b.length - a.length);
  for (const keyword of keywords) {
    if (!containsPhrase(haystack, keyword)) continue;
    const category = usable.find((c) => c.name.toLowerCase() === MERCHANT_CATEGORIES[keyword].toLowerCase());
    if (category) return { categoryId: category.id, keyword, source: "merchant" };
  }

  for (const category of usable) {
    const name = category.name.toLowerCase();
    // "Food & Dining" → also try its first word; plurals loosely ("grocery" ↔ "groceries").
    const variants = [name, name.split(/[\s&]+/)[0], name.replace(/ies$/, "y"), name.replace(/s$/, "")];
    const hit = variants.find((v) => v.length >= 3 && containsPhrase(haystack, v));
    if (hit) return { categoryId: category.id, keyword: hit, source: "name" };
  }

  return null;
}
