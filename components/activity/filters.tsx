"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import type { Account, Category } from "@/lib/types";

const selectClass =
  "h-10 rounded-full border border-line bg-glass px-3.5 text-sm text-fg outline-none focus:border-save/60 [color-scheme:dark]";

/** Search + filters, kept in the URL so views are linkable and survive refresh. */
export function ActivityFilters({ accounts, categories }: { accounts: Account[]; categories: Category[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }

  // Debounce typing in the search box.
  useEffect(() => {
    if (search === (params.get("q") ?? "")) return;
    const timer = setTimeout(() => update("q", search.trim()), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the typed text changes
  }, [search]);

  const hasFilters = ["q", "type", "account", "category"].some((k) => params.get(k));

  return (
    <div className={cn("space-y-3 transition-opacity", pending && "opacity-60")}>
      <div className="relative">
        <Search className="text-subtle pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes and categories"
          aria-label="Search transactions"
          className="border-line bg-glass placeholder:text-subtle focus:border-save/60 h-11 w-full rounded-full border pr-4 pl-11 text-sm outline-none"
        />
      </div>
      <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        <select
          aria-label="Type"
          value={params.get("type") ?? ""}
          onChange={(e) => update("type", e.target.value)}
          className={selectClass}
        >
          <option value="">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
          <option value="invest">Investments</option>
          <option value="redeem">Redemptions</option>
        </select>
        <select
          aria-label="Account"
          value={params.get("account") ?? ""}
          onChange={(e) => update("account", e.target.value)}
          className={selectClass}
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Category"
          value={params.get("category") ?? ""}
          onChange={(e) => update("category", e.target.value)}
          className={selectClass}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              const month = params.get("month");
              startTransition(() => router.replace(month ? `${pathname}?month=${month}` : pathname, { scroll: false }));
            }}
            className="text-muted hover:text-fg inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-3 text-sm"
          >
            <X className="size-4" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}
