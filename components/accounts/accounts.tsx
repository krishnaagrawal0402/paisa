"use client";

import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { deleteAccount, saveAccount, setAccountArchived } from "@/lib/actions/ledger";
import type { CardBillWithName } from "@/lib/cards";
import { cn } from "@/lib/cn";
import { utilisation } from "@/lib/finance/card";
import { formatCompactINR, formatINR } from "@/lib/money";
import { ordinal } from "@/lib/month";
import { formatDue } from "@/lib/recurring";
import { parseAmount } from "@/lib/parse/amount";
import { ACCOUNT_TYPES, type AccountType, type AccountWithBalance } from "@/lib/types";

type Editing = AccountWithBalance | "new" | null;

export function Accounts({ accounts, bills = [] }: { accounts: AccountWithBalance[]; bills?: CardBillWithName[] }) {
  const [editing, setEditing] = useState<Editing>(null);
  const [showArchived, setShowArchived] = useState(false);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Accounts</h2>
        <Button variant="glass" className="h-10 px-4" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add account
        </Button>
      </div>

      {active.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="glass hover:bg-glass-hover w-full p-8 text-center transition-colors"
        >
          <p className="text-4xl">🏦</p>
          <p className="mt-3 font-medium">Add your first account</p>
          <p className="text-muted mt-1 text-sm">
            Your bank accounts, cards, cash and UPI wallets, with today&apos;s balance.
          </p>
        </button>
      ) : (
        <AccountRows accounts={active} bills={bills} onSelect={setEditing} />
      )}

      {archived.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="text-muted hover:text-fg px-1 text-sm"
          >
            {showArchived ? "Hide" : "Show"} {archived.length} archived
          </button>
          {showArchived && (
            <div className="mt-3 opacity-70">
              <AccountRows accounts={archived} bills={bills} onSelect={setEditing} />
            </div>
          )}
        </div>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add account" : "Edit account"}
      >
        {editing !== null && (
          <AccountForm
            key={editing === "new" ? "new" : editing.id}
            account={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

/** "Bill ₹13,400 due 7 Oct · 32% of limit" under a card's name. */
function cardLine(a: AccountWithBalance, bill: CardBillWithName | undefined): React.ReactNode {
  const used = utilisation(-a.balance, a.credit_limit);
  const parts: React.ReactNode[] = [];
  if (bill?.status === "due")
    parts.push(
      <span key="bill">
        Bill <span className="money">{formatINR(bill.due)}</span> due {formatDue(bill.dueDate)}
      </span>,
    );
  if (bill?.status === "overdue")
    parts.push(
      <span key="bill" className="text-expense">
        <span className="money">{formatINR(bill.due)}</span> overdue since {formatDue(bill.dueDate)}
      </span>,
    );
  if (bill?.status === "paid") parts.push(<span key="bill">Bill paid ✓</span>);
  if (used !== null)
    parts.push(
      <span key="limit" className={cn(used > 0.3 && "text-warn")}>
        {Math.round(used * 100)}% of <span className="money">{formatCompactINR(a.credit_limit!)}</span> limit
      </span>,
    );
  if (parts.length === 0) return ACCOUNT_TYPES[a.type].label;
  return parts.flatMap((p, i) => (i === 0 ? [p] : [" · ", p]));
}

function AccountRows({
  accounts,
  bills,
  onSelect,
}: {
  accounts: AccountWithBalance[];
  bills: CardBillWithName[];
  onSelect: (a: AccountWithBalance) => void;
}) {
  return (
    <ul className="glass divide-line divide-y overflow-hidden">
      {accounts.map((a) => {
        const owed = a.type === "credit_card" && a.balance < 0;
        return (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onSelect(a)}
              className="hover:bg-glass-hover flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors"
            >
              <span className="bg-glass-hover grid size-10 shrink-0 place-items-center rounded-full text-lg">
                {ACCOUNT_TYPES[a.type].emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{a.name}</span>
                <span className="text-muted block text-xs">
                  {a.type === "credit_card"
                    ? cardLine(
                        a,
                        bills.find((b) => b.accountId === a.id),
                      )
                    : ACCOUNT_TYPES[a.type].label}
                </span>
              </span>
              <span className="text-right">
                <span
                  className={cn(
                    "money block text-sm font-semibold tabular-nums",
                    (owed || a.balance < 0) && "text-expense",
                  )}
                >
                  {formatINR(owed ? -a.balance : a.balance)}
                </span>
                {owed && <span className="text-muted block text-xs">due</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AccountForm({ account, onDone }: { account: AccountWithBalance | null; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "bank");
  const isCard = type === "credit_card";
  // Cards are entered as "amount owed" (positive) but stored as a negative balance.
  const [balanceText, setBalanceText] = useState(() => {
    if (!account) return "";
    const shown = account.type === "credit_card" ? -account.balance : account.balance;
    return String(shown / 100);
  });
  const [statementDay, setStatementDay] = useState(account?.statement_day ?? null);
  const [dueDay, setDueDay] = useState(account?.due_day ?? null);
  const [limitText, setLimitText] = useState(account?.credit_limit ? String(account.credit_limit / 100) : "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = balanceText.trim();
    const negative = trimmed.startsWith("-");
    const parsed = trimmed === "" || /^-?0+(\.0*)?$/.test(trimmed) ? 0 : parseAmount(trimmed.replace(/^-/, ""));
    if (parsed === null) return setError("Enter the balance as a number, like 25000 or 1.2L");
    const entered = negative ? -parsed : parsed;
    const targetBalance = isCard ? -entered : entered;
    // Balance = opening + Σ transactions, so move the opening balance to land on today's figure.
    const movement = account ? account.balance - account.opening_balance : 0;
    const limit = limitText.trim() ? parseAmount(limitText) : null;
    if (limitText.trim() && limit === null) return setError("Enter the credit limit as a number, like 2L");

    startTransition(async () => {
      const result = await saveAccount({
        id: account?.id,
        name,
        type,
        opening_balance: targetBalance - movement,
        statement_day: statementDay,
        due_day: dueDay,
        credit_limit: limit,
      });
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: account ? "Account saved" : `${name.trim()} added` });
    });
  }

  function archive() {
    if (!account) return;
    startTransition(async () => {
      const result = await setAccountArchived(account.id, !account.archived);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: account.archived ? "Account restored" : "Account archived" });
    });
  }

  function remove() {
    if (!account) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const result = await deleteAccount(account.id);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: "Account deleted" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="account-name" className="text-muted text-xs font-medium tracking-[0.08em] uppercase">
          Name
        </label>
        <Input
          id="account-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="HDFC Savings"
          maxLength={40}
          required
          autoFocus={!account}
        />
      </div>

      <div className="space-y-2">
        <p className="text-muted text-xs font-medium tracking-[0.08em] uppercase">Type</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((t) => (
            <Chip key={t} selected={type === t} onClick={() => setType(t)}>
              <span aria-hidden>{ACCOUNT_TYPES[t].emoji}</span> {ACCOUNT_TYPES[t].label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="account-balance" className="text-muted text-xs font-medium tracking-[0.08em] uppercase">
          {isCard ? "Amount you owe right now" : "Current balance"}
        </label>
        <div className="relative">
          <span className="text-muted pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">₹</span>
          <Input
            id="account-balance"
            value={balanceText}
            onChange={(e) => setBalanceText(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="pl-9 tabular-nums"
          />
        </div>
        <p className="text-subtle text-xs">
          {isCard
            ? "Your outstanding on the card today. 0 if it's fully paid."
            : "What your bank or wallet app shows today."}
        </p>
      </div>

      {isCard && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <DaySelect id="statement-day" label="Statement date" value={statementDay} onChange={setStatementDay} />
            <DaySelect id="due-day" label="Payment due" value={dueDay} onChange={setDueDay} />
          </div>
          <div className="space-y-2">
            <label htmlFor="credit-limit" className="text-muted text-xs font-medium tracking-[0.08em] uppercase">
              Credit limit
            </label>
            <div className="relative">
              <span className="text-muted pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">₹</span>
              <Input
                id="credit-limit"
                value={limitText}
                onChange={(e) => setLimitText(e.target.value)}
                inputMode="decimal"
                placeholder="Optional"
                className="pl-9 tabular-nums"
              />
            </div>
          </div>
          <p className="text-subtle text-xs">
            Both dates are on your card statement. With them, Paisa shows each bill and when it&apos;s due.
          </p>
        </div>
      )}

      {error && <p className="text-expense text-sm">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : account ? "Save" : "Add account"}
      </Button>

      {account && (
        <div className="border-line flex gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={archive} disabled={pending} className="h-10 flex-1">
            {account.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {account.archived ? "Unarchive" : "Archive"}
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

function DaySelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (day: number | null) => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-muted text-xs font-medium tracking-[0.08em] uppercase">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="border-line bg-glass text-fg focus:border-save/60 h-12 w-full rounded-2xl border px-4 text-base outline-none"
      >
        <option value="" className="bg-bg-raised">
          Not set
        </option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
          <option key={day} value={day} className="bg-bg-raised">
            {day >= 29 ? `${ordinal(day)} (or last day)` : `${ordinal(day)} of the month`}
          </option>
        ))}
      </select>
    </div>
  );
}
