"use client";

import { AlertTriangle, OctagonAlert, Plus, Trash2, TrendingUp } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/form-fields";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { deleteBudget, saveBudget } from "@/lib/actions/plan";
import { cn } from "@/lib/cn";
import { formatRupees } from "@/lib/money";
import { parseAmount } from "@/lib/parse/amount";
import type { BudgetView } from "@/lib/plan";
import type { Category } from "@/lib/types";

const STYLE = {
  ok: { fill: "bg-save", track: "bg-save/15", text: "", icon: null, label: null },
  pace: { fill: "bg-save", track: "bg-save/15", text: "text-warn", icon: TrendingUp, label: "On pace to go over" },
  near: { fill: "bg-warn", track: "bg-warn/15", text: "text-warn", icon: AlertTriangle, label: "Close to the limit" },
  over: { fill: "bg-expense", track: "bg-expense/15", text: "text-expense", icon: OctagonAlert, label: "Over budget" },
} as const;

type Editing = BudgetView | "new" | null;

export function Budgets({
  budgets,
  categories,
  typical,
}: {
  budgets: BudgetView[];
  categories: Category[];
  /** Typical monthly spend per category id, to suggest limits. */
  typical: Record<string, number>;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const available = categories.filter(
    (c) => c.kind === "expense" && !c.archived && !budgets.some((b) => b.category.id === c.id),
  );
  const total = budgets.reduce((s, b) => s + b.limit, 0);
  const spent = budgets.reduce((s, b) => s + b.spent, 0);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Budgets</h2>
          {budgets.length > 0 && (
            <p className="text-muted text-xs">
              <span className="money">{formatRupees(spent)}</span> of{" "}
              <span className="money">{formatRupees(total)}</span> this month
            </p>
          )}
        </div>
        {available.length > 0 && (
          <Button variant="glass" className="h-10 px-4" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add
          </Button>
        )}
      </div>

      {budgets.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="glass hover:bg-glass-hover w-full p-8 text-center transition-colors"
        >
          <p className="text-4xl">🎯</p>
          <p className="mt-3 font-medium">Set limits for the categories you want to watch</p>
          <p className="text-muted mt-1 text-sm">
            Food delivery, shopping, nights out. Paisa warns you at 80% and tells you if you&apos;re on pace to go over.
          </p>
        </button>
      ) : (
        <ul className="glass divide-line divide-y overflow-hidden">
          {budgets.map((b) => {
            const style = STYLE[b.status];
            const Icon = style.icon;
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setEditing(b)}
                  className="hover:bg-glass-hover w-full px-4 py-3.5 text-left transition-colors"
                >
                  <div className="flex items-baseline gap-2">
                    <span aria-hidden>{b.category.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.category.name}</span>
                    <span className="text-sm tabular-nums">
                      <span className="money font-semibold">{formatRupees(b.spent)}</span>
                      <span className="text-muted"> / </span>
                      <span className="money text-muted">{formatRupees(b.limit)}</span>
                    </span>
                  </div>
                  <div
                    className={cn("mt-2 h-2 overflow-hidden rounded-full", style.track)}
                    role="meter"
                    aria-label={`${b.category.name} budget used`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(b.used * 100)}
                  >
                    <div
                      className={cn("h-full rounded-r-[4px]", style.fill)}
                      style={{ width: `${Math.min(100, b.used * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className={cn("flex items-center gap-1", style.text || "text-muted")}>
                      {Icon && <Icon className="size-3.5" />}
                      {style.label}
                      {b.status === "pace" && b.projected !== null && (
                        <>
                          : <span className="money">{formatRupees(b.projected)}</span> by month end
                        </>
                      )}
                    </span>
                    <span className={cn("money tabular-nums", b.left < 0 ? "text-expense" : "text-muted")}>
                      {b.left >= 0 ? `${formatRupees(b.left)} left` : `${formatRupees(-b.left)} over`}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New budget" : "Budget"}
      >
        {editing !== null && (
          <BudgetForm
            key={editing === "new" ? "new" : editing.id}
            budget={editing === "new" ? null : editing}
            available={available}
            typical={typical}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

/** A friendly starting limit: typical spend rounded up to the next ₹500. */
const suggest = (typical: number) => (typical > 0 ? String(Math.ceil(typical / 100 / 500) * 500) : "");

function BudgetForm({
  budget,
  available,
  typical,
  onDone,
}: {
  budget: BudgetView | null;
  available: Category[];
  typical: Record<string, number>;
  onDone: () => void;
}) {
  const toast = useToast();
  const [categoryId, setCategoryId] = useState<string | null>(budget?.category.id ?? null);
  const [limit, setLimit] = useState(budget ? String(budget.limit / 100) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const usual = categoryId ? (typical[categoryId] ?? 0) : 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(limit);
    if (!categoryId) return setError("Pick a category");
    if (!amount) return setError("Enter a monthly limit");
    startTransition(async () => {
      const result = await saveBudget({ id: budget?.id, category_id: categoryId, monthly_limit: amount });
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: budget ? "Budget saved" : "Budget added" });
    });
  }

  function remove() {
    if (!budget) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const result = await deleteBudget(budget.id);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: "Budget removed" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {budget ? (
        <p className="text-sm">
          {budget.category.emoji} <span className="font-medium">{budget.category.name}</span>
        </p>
      ) : (
        <Field label="Category">
          <div className="flex flex-wrap gap-2">
            {available.map((c) => (
              <Chip
                key={c.id}
                selected={categoryId === c.id}
                onClick={() => {
                  setCategoryId(c.id);
                  if (!limit) setLimit(suggest(typical[c.id] ?? 0));
                }}
              >
                <span aria-hidden>{c.emoji}</span> {c.name}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      <label className="block space-y-1.5">
        <span className="text-muted text-xs">Monthly limit</span>
        <div className="relative">
          <span className="text-muted pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">₹</span>
          <Input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="decimal"
            placeholder="5000"
            className="pl-9 tabular-nums"
          />
        </div>
        {usual > 0 && (
          <span className="text-subtle block text-xs">
            You usually spend <span className="money">{formatRupees(usual)}</span> a month here (last 3 months).
          </span>
        )}
      </label>

      {error && <p className="text-expense text-sm">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : budget ? "Save" : "Add budget"}
      </Button>
      {budget && (
        <Button
          type="button"
          variant="ghost"
          onClick={remove}
          disabled={pending}
          className={cn("text-expense hover:text-expense h-10 w-full", confirmDelete && "bg-expense/15")}
        >
          <Trash2 className="size-4" /> {confirmDelete ? "Tap again" : "Remove budget"}
        </Button>
      )}
    </form>
  );
}
