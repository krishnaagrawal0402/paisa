"use client";

import confetti from "canvas-confetti";
import { ArrowLeft, ArrowRight, FileUp, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Button, buttonClass } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/money";
import { ordinal } from "@/lib/month";
import { parseAmount } from "@/lib/parse/amount";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/types";
import { finishOnboarding, skipOnboarding } from "./actions";

type Row = { key: number; type: AccountType; name: string; balance: string };

const STEPS = ["about", "accounts", "salary", "done"] as const;
type Step = (typeof STEPS)[number];

const DEFAULT_NAMES: Record<AccountType, string> = {
  bank: "Savings account",
  cash: "Cash",
  wallet: "UPI wallet",
  credit_card: "Credit card",
};

/** "0", "", "12,500", "1.2L" → paise. Blank means zero. Null if unreadable. */
function readBalance(text: string): number | null {
  const t = text.trim();
  if (t === "" || /^0+(\.0*)?$/.test(t)) return 0;
  return parseAmount(t);
}

export function Onboarding({ initialName, initialPayday }: { initialName: string; initialPayday: number }) {
  const [step, setStep] = useState<Step>("about");
  const [direction, setDirection] = useState(1);
  const [name, setName] = useState(initialName);
  const [payday, setPayday] = useState(initialPayday);
  const [rows, setRows] = useState<Row[]>([
    { key: 1, type: "bank", name: DEFAULT_NAMES.bank, balance: "" },
    { key: 2, type: "cash", name: DEFAULT_NAMES.cash, balance: "" },
  ]);
  const [salary, setSalary] = useState("");
  const [salaryAccount, setSalaryAccount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const index = STEPS.indexOf(step);
  const go = (to: Step) => {
    setError(null);
    setDirection(STEPS.indexOf(to) > index ? 1 : -1);
    setStep(to);
  };

  const balances = rows.map((r) => readBalance(r.balance));
  const salaryTargets = rows.map((r, i) => ({ ...r, i })).filter((r) => r.type !== "credit_card" && r.name.trim());

  function nextFromAccounts() {
    if (!rows.some((r) => r.name.trim())) return setError("Add at least one account.");
    if (rows.some((r) => !r.name.trim())) return setError("Give every account a name, or remove it.");
    const bad = balances.findIndex((b) => b === null);
    if (bad >= 0) return setError(`Couldn't read the balance for ${rows[bad].name}. Try 25000 or 1.2L.`);
    if (!salaryTargets.some((t) => t.i === salaryAccount)) setSalaryAccount(salaryTargets[0]?.i ?? 0);
    go("salary");
  }

  function finish(withSalary: boolean) {
    const amount = withSalary ? parseAmount(salary) : null;
    if (withSalary && !amount) return setError("Enter your monthly take-home, like 85000 or 1.2L.");
    setError(null);
    startTransition(async () => {
      const result = await finishOnboarding({
        display_name: name,
        month_start_day: payday,
        accounts: rows.map((r, i) => ({ name: r.name, type: r.type, balance: balances[i] ?? 0 })),
        salary: amount && salaryTargets.length > 0 ? { amount, account: salaryAccount } : null,
      });
      if (!result.ok) return setError(result.error);
      go("done");
      confetti({ particleCount: 160, spread: 90, origin: { y: 0.55 }, disableForReducedMotion: true });
    });
  }

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between">
        <LogoMark className="size-9" />
        {step !== "done" && (
          <div role="img" className="flex items-center gap-1.5" aria-label={`Step ${index + 1} of 3`}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index ? "bg-income w-6" : i < index ? "bg-income/60 w-1.5" : "bg-line w-1.5",
                )}
              />
            ))}
          </div>
        )}
        {step !== "done" ? (
          <form action={skipOnboarding}>
            <button className="text-muted hover:text-fg text-sm transition-colors">Skip</button>
          </form>
        ) : (
          <span className="w-9" />
        )}
      </header>

      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.section
          key={step}
          custom={direction}
          initial={{ opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -40 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="mt-10 flex flex-col"
        >
          {step === "about" && (
            <>
              <h1 className="text-3xl font-semibold tracking-tight">Namaste 👋</h1>
              <p className="text-muted mt-2">
                Three quick questions and your dashboard is ready. You can change all of it later.
              </p>

              <label htmlFor="name" className="text-muted mt-8 text-sm">
                What should we call you?
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={40}
                autoComplete="given-name"
                className="mt-2"
              />

              <p id="payday-label" className="text-muted mt-8 text-sm">
                When does your salary come in?
              </p>
              <p className="text-subtle mt-1 text-xs">
                Your month runs payday to payday, so “this month” means since you last got paid.
              </p>
              <div role="radiogroup" aria-labelledby="payday-label" className="mt-3 grid grid-cols-7 gap-1.5">
                {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    type="button"
                    role="radio"
                    aria-checked={payday === day}
                    aria-label={day === 1 ? "1st, or no fixed payday" : ordinal(day)}
                    onClick={() => setPayday(day)}
                    className={cn(
                      "h-10 rounded-xl border text-sm tabular-nums transition-all active:scale-95",
                      payday === day
                        ? "border-income/60 bg-income/15 text-fg font-semibold"
                        : "border-line bg-glass text-muted hover:text-fg",
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <p className="text-subtle mt-2 text-xs">
                {payday === 1
                  ? "1st: plain calendar months. Pick this if your pay date varies."
                  : `Months run from the ${ordinal(payday)} to the ${ordinal(payday - 1)}.`}
              </p>

              <Nav onNext={() => (name.trim() ? go("accounts") : setError("Tell us what to call you."))} />
            </>
          )}

          {step === "accounts" && (
            <>
              <h1 className="text-3xl font-semibold tracking-tight">Where&apos;s your money?</h1>
              <p className="text-muted mt-2">
                Add your accounts with today&apos;s balance. Rough numbers are fine: you can fix them anytime.
              </p>

              <ul className="mt-6 space-y-2.5">
                <AnimatePresence initial={false}>
                  {rows.map((row, i) => (
                    <motion.li
                      key={row.key}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="glass flex items-center gap-2 p-2 pl-3"
                    >
                      <span aria-hidden className="text-lg">
                        {ACCOUNT_TYPES[row.type].emoji}
                      </span>
                      <input
                        aria-label={`${ACCOUNT_TYPES[row.type].label} name`}
                        value={row.name}
                        maxLength={40}
                        onChange={(e) =>
                          setRows(rows.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r)))
                        }
                        className="placeholder:text-subtle min-w-0 flex-1 bg-transparent text-sm outline-none"
                      />
                      <div className="flex flex-col items-end">
                        <input
                          aria-label={row.type === "credit_card" ? `Amount owed on ${row.name}` : `${row.name} balance`}
                          inputMode="decimal"
                          placeholder={row.type === "credit_card" ? "₹ owed" : "₹ 0"}
                          value={row.balance}
                          onChange={(e) =>
                            setRows(rows.map((r) => (r.key === row.key ? { ...r, balance: e.target.value } : r)))
                          }
                          className={cn(
                            "border-line bg-glass focus:border-save/60 h-10 w-28 rounded-xl border px-3 text-right text-sm tabular-nums outline-none",
                            balances[i] === null && "border-expense/60",
                          )}
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${row.name || "account"}`}
                        onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                        className="text-subtle hover:text-fg grid size-9 place-items-center rounded-full"
                      >
                        <X className="size-4" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>

              <div className="mt-3 flex flex-wrap gap-2">
                {(Object.keys(ACCOUNT_TYPES) as AccountType[]).map((type) => (
                  <Chip
                    key={type}
                    onClick={() =>
                      setRows([
                        ...rows,
                        {
                          key: Math.max(0, ...rows.map((r) => r.key)) + 1,
                          type,
                          name: rows.some((r) => r.type === type) ? "" : DEFAULT_NAMES[type],
                          balance: "",
                        },
                      ])
                    }
                  >
                    <Plus className="size-3.5" /> {ACCOUNT_TYPES[type].label}
                  </Chip>
                ))}
              </div>
              <p className="text-subtle mt-3 text-xs">
                Fixed deposits, mutual funds and stocks come later, under Wealth → Investments.
              </p>

              <Nav onBack={() => go("about")} onNext={nextFromAccounts} />
            </>
          )}

          {step === "salary" && (
            <>
              <h1 className="text-3xl font-semibold tracking-tight">Your salary</h1>
              <p className="text-muted mt-2">
                Each payday Paisa will ask you to confirm it with one tap, so the amount can change month to month.
              </p>

              <label htmlFor="salary" className="text-muted mt-8 text-sm">
                Monthly take-home (after tax)
              </label>
              <Input
                id="salary"
                inputMode="decimal"
                placeholder="e.g. 85000 or 1.2L"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                className="mt-2 text-lg tabular-nums"
              />
              {parseAmount(salary) !== null && (
                <p className="text-income mt-1.5 text-sm tabular-nums">{formatINR(parseAmount(salary)!)} a month</p>
              )}

              {salaryTargets.length > 1 && (
                <>
                  <p className="text-muted mt-6 text-sm">Credited to</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {salaryTargets.map((t) => (
                      <Chip
                        key={t.key}
                        tone="income"
                        selected={salaryAccount === t.i}
                        onClick={() => setSalaryAccount(t.i)}
                      >
                        <span aria-hidden>{ACCOUNT_TYPES[t.type].emoji}</span> {t.name}
                      </Chip>
                    ))}
                  </div>
                </>
              )}
              <p className="text-subtle mt-4 text-xs">
                First one due on the {ordinal(payday)}.
                {salaryTargets.length === 0 && " Add a bank account first to track salary."}
              </p>

              <Nav
                onBack={() => go("accounts")}
                onNext={() => finish(true)}
                nextLabel={pending ? "Setting up…" : "Finish"}
                disabled={pending || salaryTargets.length === 0}
              />
              <button
                type="button"
                onClick={() => finish(false)}
                disabled={pending}
                className="text-muted hover:text-fg mt-4 self-center text-sm transition-colors disabled:opacity-50"
              >
                No fixed salary? Skip this
              </button>
            </>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center pt-10 text-center">
              <span className="text-6xl" aria-hidden>
                🎉
              </span>
              <h1 className="mt-6 text-3xl font-semibold tracking-tight">You&apos;re all set, {name.trim()}</h1>
              <p className="text-muted mt-2 max-w-sm">
                Got past months in a bank statement? Import it and your charts fill in right away.
              </p>
              <div className="mt-10 flex w-full flex-col gap-3">
                <Link href="/" className={buttonClass("primary", "w-full")}>
                  Go to my dashboard <ArrowRight className="size-4" />
                </Link>
                <Link href="/import" className={buttonClass("glass", "w-full")}>
                  <FileUp className="size-4" /> Import a bank statement
                </Link>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-expense mt-4 text-center text-sm">
              {error}
            </p>
          )}
        </motion.section>
      </AnimatePresence>
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  nextLabel = "Continue",
  disabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-10 flex gap-3">
      {onBack && (
        <Button variant="glass" onClick={onBack} aria-label="Back" className="w-12 px-0">
          <ArrowLeft className="size-4" />
        </Button>
      )}
      <Button onClick={onNext} disabled={disabled} className="flex-1">
        {nextLabel} {!disabled && <ArrowRight className="size-4" />}
      </Button>
    </div>
  );
}
