"use client";

import { ArrowLeftRight, Pause, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { Chip, Segmented } from "@/components/ui/chip";
import { AccountChips, Field } from "@/components/ui/form-fields";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { appConfig } from "@/config/app";
import { deleteRecurring, saveRecurring, setRecurringActive } from "@/lib/actions/recurring";
import { cn } from "@/lib/cn";
import { formatCompactINR, formatINR } from "@/lib/money";
import { todayIn } from "@/lib/month";
import { parseAmount } from "@/lib/parse/amount";
import { formatDue, monthlyEquivalent } from "@/lib/recurring";
import {
  FREQUENCIES,
  type Account,
  type Category,
  type RecurringFrequency,
  type RecurringRule,
  type TransactionType,
} from "@/lib/types";

type Editing = RecurringRule | "new" | null;

const GROUPS: { type: TransactionType; title: string }[] = [
  { type: "income", title: "Income" },
  { type: "expense", title: "Bills & subscriptions" },
  { type: "transfer", title: "Transfers & savings" },
];

export function Recurring({
  rules,
  accounts,
  categories,
}: {
  rules: RecurringRule[];
  accounts: Account[];
  categories: Category[];
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const active = rules.filter((r) => r.active);
  const monthly = (type: TransactionType, filter: (r: RecurringRule) => boolean = () => true) =>
    active
      .filter((r) => r.type === type && filter(r))
      .reduce((sum, r) => sum + monthlyEquivalent(r.amount, r.frequency), 0);
  const subscriptionsId = categories.find((c) => c.name === "Subscriptions")?.id;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Recurring</h2>
        <Button variant="glass" className="h-10 px-4" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      {rules.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="glass hover:bg-glass-hover w-full p-8 text-center transition-colors"
        >
          <Repeat className="text-save mx-auto size-8" />
          <p className="mt-3 font-medium">Set up your regulars once</p>
          <p className="text-muted mt-1 text-sm">
            Salary, rent, SIPs, EMIs, Netflix… They&apos;ll log themselves every month.
          </p>
        </button>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Summary label="Income" value={monthly("income")} />
            <Summary label="Fixed costs" value={monthly("expense")} />
            <Summary label="Subscriptions" value={monthly("expense", (r) => r.category_id === subscriptionsId)} />
          </div>

          {GROUPS.map(({ type, title }) => {
            const group = rules.filter((r) => r.type === type);
            if (group.length === 0) return null;
            return (
              <div key={type} className="space-y-2">
                <p className="text-muted px-1 text-xs font-medium tracking-[0.08em] uppercase">{title}</p>
                <ul className="glass divide-line divide-y overflow-hidden">
                  {group.map((rule) => (
                    <RuleRow key={rule.id} rule={rule} categories={categories} onSelect={() => setEditing(rule)} />
                  ))}
                </ul>
              </div>
            );
          })}
        </>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New recurring" : "Edit recurring"}
      >
        {editing !== null && (
          <RecurringForm
            key={editing === "new" ? "new" : editing.id}
            rule={editing === "new" ? null : editing}
            accounts={accounts}
            categories={categories}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3 md:p-4">
      <CardLabel className="text-[11px]">{label}</CardLabel>
      <p className="money mt-1 text-base font-semibold md:text-lg">
        {formatCompactINR(value)}
        <span className="text-muted text-xs font-normal">/mo</span>
      </p>
    </Card>
  );
}

function RuleRow({
  rule,
  categories,
  onSelect,
}: {
  rule: RecurringRule;
  categories: Category[];
  onSelect: () => void;
}) {
  const category = categories.find((c) => c.id === rule.category_id);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "hover:bg-glass-hover flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
          !rule.active && "opacity-50",
        )}
      >
        <span className="bg-glass-hover grid size-10 shrink-0 place-items-center rounded-full text-lg">
          {rule.type === "transfer" ? <ArrowLeftRight className="text-save size-4" /> : (category?.emoji ?? "🔁")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{rule.name}</span>
          <span className="text-muted block truncate text-xs">
            {FREQUENCIES[rule.frequency]} · {rule.active ? `next ${formatDue(rule.next_due)}` : "paused"}
            {rule.mode === "confirm" && " · asks you"}
          </span>
        </span>
        <span
          className={cn(
            "money shrink-0 text-sm font-semibold tabular-nums",
            rule.type === "income" && "text-income",
            rule.type === "transfer" && "text-muted",
          )}
        >
          {rule.type === "income" ? "+" : rule.type === "expense" ? "−" : ""}
          {formatINR(rule.amount)}
        </span>
      </button>
    </li>
  );
}

const TYPE_STYLE: Record<TransactionType, { label: string; active: string; chip: "income" | "expense" | "save" }> = {
  expense: { label: "Expense", active: "bg-expense text-bg", chip: "expense" },
  income: { label: "Income", active: "bg-income text-bg", chip: "income" },
  transfer: { label: "Transfer", active: "bg-save text-bg", chip: "save" },
};

function RecurringForm({
  rule,
  accounts,
  categories,
  onDone,
}: {
  rule: RecurringRule | null;
  accounts: Account[];
  categories: Category[];
  onDone: () => void;
}) {
  const toast = useToast();
  const today = todayIn(appConfig.timeZone);
  const [type, setType] = useState<TransactionType>(rule?.type ?? "expense");
  const [name, setName] = useState(rule?.name ?? "");
  const [amountText, setAmountText] = useState(rule ? String(rule.amount / 100) : "");
  const [categoryId, setCategoryId] = useState<string | null>(rule?.category_id ?? null);
  const [accountId, setAccountId] = useState<string | null>(rule?.account_id ?? accounts[0]?.id ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(rule?.to_account_id ?? null);
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? "monthly");
  const [anchor, setAnchor] = useState(rule?.anchor_date ?? today);
  const [endDate, setEndDate] = useState(rule?.end_date ?? "");
  const [confirm, setConfirm] = useState(rule ? rule.mode === "confirm" : false);
  const [touchedConfirm, setTouchedConfirm] = useState(Boolean(rule));
  const [showAll, setShowAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const style = TYPE_STYLE[type];
  const kindCategories = categories.filter((c) => c.kind === type && !c.archived);
  const shown = showAll ? kindCategories : kindCategories.slice(0, 8);
  const otherAccounts = accounts.filter((a) => a.id !== accountId);
  const destination =
    toAccountId && toAccountId !== accountId ? toAccountId : otherAccounts.length === 1 ? otherAccounts[0].id : null;

  if (accounts.length === 0) {
    return <p className="text-muted py-6 text-center text-sm">Add an account on the Wealth page first.</p>;
  }

  function changeType(next: TransactionType) {
    setType(next);
    if (categories.find((c) => c.id === categoryId)?.kind !== next) setCategoryId(null);
    // Salaries vary month to month, so default income rules to "ask me".
    if (!touchedConfirm) setConfirm(next === "income");
  }

  function pickCategory(category: Category) {
    setCategoryId(category.id === categoryId ? null : category.id);
    if (!name.trim()) setName(category.name);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(amountText);
    if (!amount) return setError("Enter an amount, like 25000 or 1.2L");
    if (!accountId) return setError("Pick an account");
    if (type === "transfer" && !destination) return setError("Pick a different account to move the money to");
    setError(null);
    startTransition(async () => {
      const result = await saveRecurring({
        id: rule?.id,
        name,
        type,
        amount,
        account_id: accountId,
        to_account_id: destination,
        category_id: categoryId,
        frequency,
        anchor_date: anchor,
        end_date: endDate || null,
        mode: confirm ? "confirm" : "auto",
      });
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({
        message: rule
          ? "Saved"
          : anchor <= today && !confirm
            ? `${name.trim()} added and logged`
            : `${name.trim()} added`,
      });
    });
  }

  function togglePause() {
    if (!rule) return;
    startTransition(async () => {
      const result = await setRecurringActive(rule.id, !rule.active);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: rule.active ? "Paused" : "Resumed" });
    });
  }

  function remove() {
    if (!rule) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const result = await deleteRecurring(rule.id);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: "Deleted. Past entries are kept." });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Segmented
        value={type}
        onChange={changeType}
        options={(["expense", "income", "transfer"] as const).map((t) => ({
          value: t,
          label: TYPE_STYLE[t].label,
          activeClass: TYPE_STYLE[t].active,
        }))}
      />

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rent, Netflix, SIP…"
          maxLength={40}
          required
        />
        <div className="relative w-36">
          <span className="text-muted pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">₹</span>
          <Input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            aria-label="Amount"
            className="pl-8 tabular-nums"
          />
        </div>
      </div>

      {type !== "transfer" && (
        <Field label="Category">
          <div className="flex flex-wrap gap-2">
            {shown.map((c) => (
              <Chip key={c.id} tone={style.chip} selected={categoryId === c.id} onClick={() => pickCategory(c)}>
                <span aria-hidden>{c.emoji}</span> {c.name}
              </Chip>
            ))}
            {kindCategories.length > 8 && (
              <Chip onClick={() => setShowAll(!showAll)}>
                {showAll ? "Less" : `+${kindCategories.length - 8} more`}
              </Chip>
            )}
          </div>
        </Field>
      )}

      <Field label={type === "income" ? "Comes into" : type === "transfer" ? "From" : "Paid from"}>
        <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} tone={style.chip} />
      </Field>
      {type === "transfer" && (
        <Field label="To">
          <AccountChips accounts={otherAccounts} value={destination} onChange={setToAccountId} tone={style.chip} />
        </Field>
      )}

      <Field label="Repeats">
        <Segmented
          value={frequency}
          onChange={setFrequency}
          options={(Object.keys(FREQUENCIES) as RecurringFrequency[]).map((f) => ({
            value: f,
            label: FREQUENCIES[f],
            activeClass: "bg-glass-hover text-fg",
          }))}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-2">
          <span className="text-muted block text-xs font-medium tracking-[0.08em] uppercase">
            {rule ? "Starting from" : "Next due"}
          </span>
          <Input
            type="date"
            value={anchor}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
            className="[color-scheme:dark]"
          />
        </label>
        <label className="space-y-2">
          <span className="text-muted block text-xs font-medium tracking-[0.08em] uppercase">Ends (optional)</span>
          <Input
            type="date"
            value={endDate}
            min={anchor}
            onChange={(e) => setEndDate(e.target.value)}
            className="[color-scheme:dark]"
          />
        </label>
      </div>
      {!rule && anchor < today && !confirm && (
        <p className="text-warn -mt-2 text-xs">Dates before today will be logged right away.</p>
      )}

      <label className="border-line bg-glass flex cursor-pointer items-start gap-3 rounded-2xl border p-4">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => {
            setConfirm(e.target.checked);
            setTouchedConfirm(true);
          }}
          className="accent-save mt-0.5 size-4"
        />
        <span>
          <span className="block text-sm font-medium">Ask me to confirm each time</span>
          <span className="text-muted block text-xs">
            For amounts that change, like salary. Otherwise it&apos;s logged automatically on the due date.
          </span>
        </span>
      </label>

      {error && <p className="text-expense text-sm">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : rule ? "Save" : "Add recurring"}
      </Button>

      {rule && (
        <div className="border-line flex gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={togglePause} disabled={pending} className="h-10 flex-1">
            {rule.active ? <Pause className="size-4" /> : <Play className="size-4" />}
            {rule.active ? "Pause" : "Resume"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            disabled={pending}
            className={cn("text-expense hover:text-expense h-10 flex-1", confirmDelete && "bg-expense/15")}
          >
            <Trash2 className="size-4" /> {confirmDelete ? "Tap again" : "Delete"}
          </Button>
        </div>
      )}
    </form>
  );
}
