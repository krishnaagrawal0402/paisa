"use client";

import { ArrowRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip, Segmented } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { AccountChips, Field } from "@/components/ui/form-fields";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { appConfig } from "@/config/app";
import { deleteTransaction, restoreTransaction, saveTransaction } from "@/lib/actions/ledger";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import { addDays, todayIn } from "@/lib/month";
import { parseAmount } from "@/lib/parse/amount";
import type { Account, Category, Transaction, TransactionType } from "@/lib/types";

type QuickAddApi = {
  openNew: (type?: TransactionType) => void;
  openEdit: (transaction: Transaction) => void;
};

const QuickAddContext = createContext<QuickAddApi | null>(null);

export function useQuickAdd() {
  const api = useContext(QuickAddContext);
  if (!api) throw new Error("useQuickAdd must be used inside <QuickAddProvider>");
  return api;
}

const TYPES: TransactionType[] = ["expense", "income", "transfer"];
const LAST_ACCOUNT_KEY = "paisa:last-account";

function readLastAccount(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

function rememberAccount(id: string) {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, id);
  } catch {
    // Private mode or storage blocked: just don't remember.
  }
}

type SheetState = { open: boolean; type: TransactionType; editing: Transaction | null; key: number };

/** Owns the global add/edit sheet. Any page opens it via useQuickAdd(). */
export function QuickAddProvider({
  accounts,
  categories,
  children,
}: {
  accounts: Account[];
  categories: Category[];
  children: React.ReactNode;
}) {
  const [state, setState] = useState<SheetState>({ open: false, type: "expense", editing: null, key: 0 });

  const openNew = useCallback(
    (type: TransactionType = "expense") => setState((s) => ({ open: true, type, editing: null, key: s.key + 1 })),
    [],
  );
  const openEdit = useCallback(
    (editing: Transaction) => setState((s) => ({ open: true, type: editing.type, editing, key: s.key + 1 })),
    [],
  );
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

  // PWA shortcut and deep links: /?add=expense opens the sheet straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const add = params.get("add");
    if (!add) return;
    params.delete("add");
    const query = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : ""));
    // One-time sync from the URL on mount; reading it during render would mismatch server HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    openNew(TYPES.includes(add as TransactionType) ? (add as TransactionType) : "expense");
  }, [openNew]);

  const api = useMemo(() => ({ openNew, openEdit }), [openNew, openEdit]);

  return (
    <QuickAddContext.Provider value={api}>
      {children}
      <Sheet open={state.open} onClose={close} title={state.editing ? "Edit transaction" : "Add transaction"}>
        <TransactionForm
          key={state.key}
          accounts={accounts}
          categories={categories}
          editing={state.editing}
          initialType={state.type}
          onDone={close}
        />
      </Sheet>
    </QuickAddContext.Provider>
  );
}

const TYPE_STYLE: Record<
  TransactionType,
  { label: string; active: string; amount: string; chip: "income" | "expense" | "save" }
> = {
  expense: { label: "Expense", active: "bg-expense text-bg", amount: "text-expense", chip: "expense" },
  income: { label: "Income", active: "bg-income text-bg", amount: "text-income", chip: "income" },
  transfer: { label: "Transfer", active: "bg-save text-bg", amount: "text-save", chip: "save" },
};

const VISIBLE_CATEGORIES = 8;

function TransactionForm({
  accounts,
  categories,
  editing,
  initialType,
  onDone,
}: {
  accounts: Account[];
  categories: Category[];
  editing: Transaction | null;
  initialType: TransactionType;
  onDone: () => void;
}) {
  const toast = useToast();
  const today = todayIn(appConfig.timeZone);
  const yesterday = addDays(today, -1);

  const [type, setType] = useState<TransactionType>(editing?.type ?? initialType);
  const [amountText, setAmountText] = useState(editing ? String(editing.amount / 100) : "");
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null);
  const [accountId, setAccountId] = useState<string | null>(() => {
    if (editing) return editing.account_id;
    const last = readLastAccount();
    return accounts.find((a) => a.id === last)?.id ?? accounts[0]?.id ?? null;
  });
  const [toAccountId, setToAccountId] = useState<string | null>(editing?.to_account_id ?? null);
  const [date, setDate] = useState(editing?.occurred_on ?? today);
  const [note, setNote] = useState(editing?.note ?? "");
  const [showAll, setShowAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const style = TYPE_STYLE[type];
  // Transfer destination: what was picked, or the only other account if there's just one.
  const otherAccounts = accounts.filter((a) => a.id !== accountId);
  const destination =
    toAccountId && toAccountId !== accountId ? toAccountId : otherAccounts.length === 1 ? otherAccounts[0].id : null;
  const amount = parseAmount(amountText);
  const typedPlainNumber = /^[\d.,\s₹]*$/.test(amountText);
  const kindCategories = categories.filter((c) => c.kind === type);
  const shownCategories = showAll ? kindCategories : kindCategories.slice(0, VISIBLE_CATEGORIES);
  // Keep the selected category visible even if it's beyond the first few.
  const selectedHidden = !showAll && categoryId && !shownCategories.some((c) => c.id === categoryId);

  if (accounts.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-4xl">🏦</p>
        <p className="mt-3 font-medium">Add an account first</p>
        <p className="text-muted mt-1 text-sm">Transactions come out of (or go into) a bank account, card or cash.</p>
        <Link
          href="/wealth"
          onClick={onDone}
          className="text-save mt-5 inline-flex items-center gap-1.5 text-sm font-medium"
        >
          Add your accounts <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  function changeType(next: TransactionType) {
    setType(next);
    setError(null);
    if (categories.find((c) => c.id === categoryId)?.kind !== next) setCategoryId(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount) return setError("Enter an amount, like 450 or 1.2L");
    if (!accountId) return setError("Pick an account");
    if (type === "transfer" && !destination) {
      return setError("Pick a different account to move the money to");
    }
    setError(null);

    startTransition(async () => {
      const result = await saveTransaction({
        id: editing?.id,
        type,
        amount,
        occurred_on: date,
        account_id: accountId,
        to_account_id: destination,
        category_id: categoryId,
        note,
      });
      if (!result.ok) return setError(result.error);

      rememberAccount(accountId);
      navigator.vibrate?.(10);
      onDone();

      if (editing) return toast.show({ message: "Saved" });
      const category = categories.find((c) => c.id === categoryId);
      toast.show({
        message: `Added ${formatINR(amount)}${category ? ` · ${category.name}` : ""}`,
        action: {
          label: "Undo",
          onClick: async () => {
            const undone = await deleteTransaction(result.data.id);
            toast.show(undone.ok ? { message: "Removed" } : { message: undone.error, tone: "error" });
          },
        },
      });
    });
  }

  function remove() {
    if (!editing) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const result = await deleteTransaction(editing.id);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({
        message: "Deleted",
        action: {
          label: "Undo",
          onClick: async () => {
            const restored = await restoreTransaction(result.data);
            toast.show(restored.ok ? { message: "Restored" } : { message: restored.error, tone: "error" });
          },
        },
      });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Segmented
        value={type}
        onChange={changeType}
        options={TYPES.map((t) => ({ value: t, label: TYPE_STYLE[t].label, activeClass: TYPE_STYLE[t].active }))}
      />

      <div className="text-center">
        <label htmlFor="amount" className="sr-only">
          Amount
        </label>
        <div className={cn("flex items-baseline justify-center gap-1 font-semibold tracking-tight", style.amount)}>
          <span className="text-3xl opacity-70">₹</span>
          <input
            id="amount"
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            autoFocus
            className="placeholder:text-subtle/50 max-w-[260px] bg-transparent text-center text-5xl tabular-nums outline-none"
            style={{ width: `${Math.max(1, amountText.length) + 1}ch` }}
          />
        </div>
        <p className="text-muted mt-1 h-5 text-sm">
          {amount && !typedPlainNumber ? `= ${formatINR(amount)}` : "Tip: 12k, 1.2L work too"}
        </p>
      </div>

      {type !== "transfer" && (
        <Field label="Category">
          <div className="flex flex-wrap gap-2">
            {shownCategories.map((c) => (
              <Chip
                key={c.id}
                tone={style.chip}
                selected={categoryId === c.id}
                onClick={() => setCategoryId(c.id === categoryId ? null : c.id)}
              >
                <span aria-hidden>{c.emoji}</span> {c.name}
              </Chip>
            ))}
            {selectedHidden && (
              <Chip tone={style.chip} selected onClick={() => setCategoryId(null)}>
                {categories.find((c) => c.id === categoryId)?.emoji} {categories.find((c) => c.id === categoryId)?.name}
              </Chip>
            )}
            {kindCategories.length > VISIBLE_CATEGORIES && (
              <Chip onClick={() => setShowAll(!showAll)}>
                {showAll ? "Less" : `+${kindCategories.length - VISIBLE_CATEGORIES} more`}
              </Chip>
            )}
          </div>
        </Field>
      )}

      <Field label={type === "income" ? "Received in" : type === "transfer" ? "From" : "Paid from"}>
        <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} tone={style.chip} />
      </Field>

      {type === "transfer" && (
        <Field label="To">
          <AccountChips accounts={otherAccounts} value={destination} onChange={setToAccountId} tone={style.chip} />
        </Field>
      )}

      <Field label="Date">
        <div className="flex flex-wrap gap-2">
          <Chip tone={style.chip} selected={date === today} onClick={() => setDate(today)}>
            Today
          </Chip>
          <Chip tone={style.chip} selected={date === yesterday} onClick={() => setDate(yesterday)}>
            Yesterday
          </Chip>
          <label
            className={cn(
              "inline-flex h-10 items-center rounded-full border px-3.5 text-sm",
              date !== today && date !== yesterday ? "border-save/60 bg-save/15" : "border-line bg-glass text-muted",
            )}
          >
            <span className="sr-only">Pick a date</span>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="bg-transparent [color-scheme:dark] outline-none"
            />
          </label>
        </div>
      </Field>

      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" maxLength={200} />

      {error && <p className="text-expense text-sm">{error}</p>}

      <div className="flex gap-3">
        {editing && (
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            disabled={pending}
            className={cn("text-expense hover:text-expense", confirmDelete && "bg-expense/15")}
          >
            <Trash2 className="size-4" />
            {confirmDelete ? "Tap again" : "Delete"}
          </Button>
        )}
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Saving…" : editing ? "Save changes" : "Save"}
        </Button>
      </div>
    </form>
  );
}
