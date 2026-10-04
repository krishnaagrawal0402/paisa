import { describe, expect, it } from "vitest";
import { suggestCategory } from "./categorize";
import type { Category } from "./types";

const cat = (id: string, name: string, kind: "income" | "expense" = "expense"): Category => ({
  id,
  name,
  kind,
  emoji: "",
  is_essential: false,
  archived: false,
  sort: 0,
});

const categories = [
  cat("food", "Food & Dining"),
  cat("groc", "Groceries"),
  cat("rent", "Rent"),
  cat("subs", "Subscriptions"),
  cat("shop", "Shopping"),
  cat("pets", "Pets"),
  cat("salary", "Salary", "income"),
];

describe("suggestCategory", () => {
  it("uses the merchant list", () => {
    expect(suggestCategory("swiggy dinner", { rules: [], categories, kind: "expense" })).toMatchObject({
      categoryId: "food",
      keyword: "swiggy",
      source: "merchant",
    });
    expect(suggestCategory("Blinkit", { rules: [], categories, kind: "expense" })?.categoryId).toBe("groc");
  });

  it("prefers learned rules, longest first", () => {
    const rules = [
      { pattern: "amazon", category_id: "shop" },
      { pattern: "amazon prime", category_id: "subs" },
    ];
    expect(suggestCategory("Amazon Prime renewal", { rules, categories, kind: "expense" })?.categoryId).toBe("subs");
    expect(suggestCategory("amazon order", { rules, categories, kind: "expense" })?.categoryId).toBe("shop");
  });

  it("matches whole words only", () => {
    // "olaf" must not match "ola"; "parent" must not match "rent".
    expect(suggestCategory("olaf toy", { rules: [], categories, kind: "expense" })).toBeNull();
    expect(suggestCategory("gift for parent", { rules: [], categories, kind: "expense" })).toBeNull();
  });

  it("falls back to category names, including user-made ones", () => {
    expect(suggestCategory("pets vet visit", { rules: [], categories, kind: "expense" })?.categoryId).toBe("pets");
    expect(suggestCategory("grocery run", { rules: [], categories, kind: "expense" })?.categoryId).toBe("groc");
  });

  it("only suggests categories of the right kind", () => {
    expect(suggestCategory("salary", { rules: [], categories, kind: "income" })?.categoryId).toBe("salary");
    expect(suggestCategory("salary", { rules: [], categories, kind: "expense" })).toBeNull();
  });
});
