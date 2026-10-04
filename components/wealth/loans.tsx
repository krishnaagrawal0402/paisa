"use client";

import { Plus, Repeat, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AccountChips, Field } from "@/components/ui/form-fields";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { addEmiRecurring, deleteLoan, saveLoan } from "@/lib/actions/wealth";
import { cn } from "@/lib/cn";
import { emiFor } from "@/lib/finance/loan";
import { formatCompactINR, formatRupees } from "@/lib/money";
import { parseAmount } from "@/lib/parse/amount";
import type { Account } from "@/lib/types";
import type { LoanView } from "@/lib/wealth";

type Editing = LoanView | "new" | null;

const monthYear = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

export function Loans({ loans, accounts }: { loans: LoanView[]; accounts: Account[] }) {
  const [editing, setEditing] = useState<Editing>(null);
  const live = loans.filter((l) => !l.archived);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Loans</h2>
        <Button variant="glass" className="h-10 px-4" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add loan
        </Button>
      </div>

      {live.length === 0 ? (
        <p className="text-muted px-1 text-sm">
          No loans. Home, car or personal loans you add here count against your net worth.
        </p>
      ) : (
        <ul className="glass divide-line divide-y overflow-hidden">
          {live.map((loan) => {
            const paidShare = 1 - loan.status.outstanding / loan.principal;
            return (
              <li key={loan.id}>
                <button
                  type="button"
                  onClick={() => setEditing(loan)}
                  className="hover:bg-glass-hover w-full px-4 py-3.5 text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="bg-glass-hover grid size-10 shrink-0 place-items-center rounded-full text-lg">
                      🏠
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{loan.name}</span>
                      <span className="text-muted block truncate text-xs">
                        <span className="money">{formatRupees(loan.emi)}</span>/mo ·{" "}
                        {loan.status.payoffDate ? `done ${monthYear(loan.status.payoffDate)}` : "paid off"}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="money text-expense block text-sm font-semibold tabular-nums">
                        {formatRupees(loan.status.outstanding)}
                      </span>
                      <span className="text-muted block text-xs">left</span>
                    </span>
                  </div>
                  <div className="bg-save/15 mt-3 h-1.5 overflow-hidden rounded-full" aria-hidden>
                    <div
                      className="bg-save h-full rounded-r-[4px]"
                      style={{ width: `${Math.max(0, Math.min(100, paidShare * 100))}%` }}
                    />
                  </div>
                  <p className="text-subtle mt-1 text-[11px]">
                    {Math.round(paidShare * 100)}% repaid · {loan.status.emisLeft} EMIs left ·{" "}
                    <span className="money">{formatCompactINR(loan.status.interestLeft)}</span> interest to go
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add loan" : "Loan"}>
        {editing !== null && (
          <LoanForm
            key={editing === "new" ? "new" : editing.id}
            loan={editing === "new" ? null : editing}
            accounts={accounts}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

function LoanForm({ loan, accounts, onDone }: { loan: LoanView | null; accounts: Account[]; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(loan?.name ?? "");
  const [lender, setLender] = useState(loan?.lender ?? "");
  const [principal, setPrincipal] = useState(loan ? String(loan.principal / 100) : "");
  const [rate, setRate] = useState(loan ? String(loan.annual_rate) : "");
  const [years, setYears] = useState(loan ? String(+(loan.tenure_months / 12).toFixed(2)) : "");
  const [firstEmi, setFirstEmi] = useState(loan?.first_emi_date ?? "");
  const [emiText, setEmiText] = useState(loan ? String(loan.emi / 100) : "");
  const [emiTouched, setEmiTouched] = useState(Boolean(loan));
  const [outstanding, setOutstanding] = useState("");
  const [emiAccount, setEmiAccount] = useState<string | null>(
    accounts.find((a) => a.type === "bank")?.id ?? accounts[0]?.id ?? null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const principalPaise = parseAmount(principal);
  const months = Math.round(Number(years) * 12);
  // Suggest the EMI from amount, rate and tenure until the user types their own.
  const suggested = principalPaise && rate !== "" && months > 0 ? emiFor(principalPaise, Number(rate), months) : null;
  const emiShown = emiTouched ? emiText : suggested ? String(Math.round(suggested / 100)) : "";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const emi = parseAmount(emiShown);
    if (!principalPaise) return setError("Enter the loan amount");
    if (!(months > 0)) return setError("Enter the tenure in years, like 20 or 2.5");
    if (!firstEmi) return setError("When is (or was) the first EMI?");
    if (!emi) return setError("Enter the EMI");
    const override = outstanding.trim() ? parseAmount(outstanding) : null;
    if (outstanding.trim() && override === null) return setError("Outstanding should be a number");
    setError(null);
    startTransition(async () => {
      const result = await saveLoan({
        id: loan?.id,
        name,
        lender,
        principal: principalPaise,
        annual_rate: Number(rate || 0),
        tenure_months: months,
        first_emi_date: firstEmi,
        emi,
        outstanding_override: override ?? loan?.outstanding_override ?? null,
        override_at: override !== null ? undefined : (loan?.override_at ?? null),
      });
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: loan ? "Loan saved" : `${name} added` });
    });
  }

  function addEmi() {
    if (!loan || !emiAccount) return;
    startTransition(async () => {
      const result = await addEmiRecurring({ loanId: loan.id, accountId: emiAccount });
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: "EMI will be logged every month · see Plan" });
    });
  }

  function remove() {
    if (!loan) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const result = await deleteLoan(loan.id);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: "Loan deleted" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Home loan"
            maxLength={60}
            required
          />
        </Labeled>
        <Labeled label="Lender (optional)">
          <Input value={lender} onChange={(e) => setLender(e.target.value)} placeholder="HDFC" maxLength={60} />
        </Labeled>
        <Labeled label="Loan amount">
          <Rupee value={principal} onChange={setPrincipal} />
        </Labeled>
        <Labeled label="Interest (% a year)">
          <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="8.5" />
        </Labeled>
        <Labeled label="Tenure (years)">
          <Input value={years} onChange={(e) => setYears(e.target.value)} inputMode="decimal" placeholder="20" />
        </Labeled>
        <Labeled label="First EMI date">
          <Input
            type="date"
            value={firstEmi}
            onChange={(e) => setFirstEmi(e.target.value)}
            className="[color-scheme:dark]"
          />
        </Labeled>
        <Labeled label={emiTouched ? "EMI" : "EMI (calculated)"}>
          <Rupee
            value={emiShown}
            onChange={(v) => {
              setEmiText(v);
              setEmiTouched(true);
            }}
          />
        </Labeled>
        {loan && (
          <Labeled label="Prepaid? Outstanding today">
            <Rupee
              value={outstanding}
              onChange={setOutstanding}
              placeholder={String(Math.round(loan.status.outstanding / 100))}
            />
          </Labeled>
        )}
      </div>
      {loan && (
        <p className="text-subtle -mt-2 text-xs">
          After a prepayment, enter what your lender says is left. The schedule continues from there.
        </p>
      )}

      {error && <p className="text-expense text-sm">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : loan ? "Save" : "Add loan"}
      </Button>

      {loan && (
        <div className="border-line space-y-3 border-t pt-4">
          <Field label="Log the EMI automatically each month from">
            <AccountChips accounts={accounts} value={emiAccount} onChange={setEmiAccount} tone="save" />
          </Field>
          <Button type="button" variant="glass" onClick={addEmi} disabled={pending || !emiAccount} className="w-full">
            <Repeat className="size-4" /> Set up EMI as recurring
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            disabled={pending}
            className={cn("text-expense hover:text-expense h-10 w-full", confirmDelete && "bg-expense/15")}
          >
            <Trash2 className="size-4" /> {confirmDelete ? "Tap again to delete" : "Delete loan"}
          </Button>
        </div>
      )}
    </form>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-muted text-xs">{label}</span>
      {children}
    </label>
  );
}

function Rupee({
  value,
  onChange,
  placeholder = "0",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="text-muted pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">₹</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        className="pl-9 tabular-nums"
      />
    </div>
  );
}
