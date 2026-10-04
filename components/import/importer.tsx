"use client";

import { ArrowLeft, Check, FileSpreadsheet, Lock, Undo2, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/components/ui/toast";
import { getImportContext, importStatement, undoImport } from "@/lib/actions/import";
import { suggestCategory, type CategoryRule } from "@/lib/categorize";
import { cn } from "@/lib/cn";
import { cleanDescription } from "@/lib/import/clean";
import { readStatementFile } from "@/lib/import/read-file";
import {
  buildRows,
  findDuplicates,
  fingerprints,
  guessMapping,
  type Cell,
  type DateFormat,
  type Mapping,
  type StatementRow,
} from "@/lib/import/statement";
import { formatINR } from "@/lib/money";
import type { ImportBatch } from "@/lib/data";
import { formatDue } from "@/lib/recurring";
import { ACCOUNT_TYPES, type Account, type Category } from "@/lib/types";

type Step = "upload" | "map" | "review" | "done";

type ReviewRow = StatementRow & {
  hash: string;
  merchant: string;
  duplicate: "imported" | "possible" | null;
  include: boolean;
  /** A category id, or "transfer:<accountId>". */
  choice: string | null;
  /** True once the user picked it, so bulk "same merchant" updates leave it alone. */
  manual: boolean;
};

const selectClass =
  "h-10 w-full rounded-xl border border-line bg-glass px-3 text-sm text-fg outline-none focus:border-save/60 [color-scheme:dark]";

const DATE_FORMATS: Record<DateFormat, string> = {
  dmy: "Day/Month/Year (31/12/2026)",
  mdy: "Month/Day/Year (12/31/2026)",
  ymd: "Year-Month-Day (2026-12-31)",
  dmony: "31 Dec 2026",
};

/** Columns in a file's header row, used to tell whether a saved mapping still fits. */
const signature = (rows: Cell[][], m: Mapping) => (rows[m.headerRow] ?? []).join("|").toLowerCase();

export function Importer({
  accounts,
  categories,
  rules,
  recent,
}: {
  accounts: Account[];
  categories: Category[];
  rules: CategoryRule[];
  recent: ImportBatch[];
}) {
  const toast = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [accountId, setAccountId] = useState<string | null>(accounts.length === 1 ? accounts[0].id : null);
  const [fileName, setFileName] = useState("");
  const [cells, setCells] = useState<Cell[][]>([]);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [learned, setLearned] = useState<Record<string, string>>({});
  const [keepBalance, setKeepBalance] = useState(true);
  const [result, setResult] = useState<{ batchId: string | null; inserted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  const account = accounts.find((a) => a.id === accountId);
  const preview = useMemo(() => (mapping ? buildRows(cells, mapping) : null), [cells, mapping]);

  async function onFile(file: File | undefined) {
    if (!file || !accountId) return;
    setError(null);
    try {
      const parsed = await readStatementFile(file);
      const guess = guessMapping(parsed);
      setFileName(file.name);
      setCells(parsed);
      setMapping(guess);
      setStep("map");
      // A saved layout for this account wins if the file has the same header.
      const { rows: guessed } = buildRows(parsed, guess);
      const dates = guessed.map((r) => r.date).sort();
      const ctx = await getImportContext({
        accountId,
        from: dates[0] ?? "2000-01-01",
        to: dates[dates.length - 1] ?? "2000-01-01",
      });
      if (ctx.ok && ctx.data.mapping) {
        const saved = ctx.data.mapping as Mapping & { signature?: string };
        if (saved.signature === signature(parsed, saved)) setMapping(saved);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  }

  function toReview() {
    if (!mapping || !preview || !accountId) return;
    if (preview.rows.length === 0) return setError("No transactions found with these columns. Check the mapping.");
    setError(null);
    startTransition(async () => {
      const dates = preview.rows.map((r) => r.date).sort();
      const pad = (d: string, days: number) =>
        new Date(Date.parse(`${d}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
      const ctx = await getImportContext({ accountId, from: pad(dates[0], -3), to: pad(dates[dates.length - 1], 3) });
      if (!ctx.ok) return setError(ctx.error);

      const hashes = fingerprints(preview.rows);
      const dupes = findDuplicates(preview.rows, hashes, ctx.data.existing);
      setRows(
        preview.rows.map((row, i) => {
          const merchant = cleanDescription(row.description);
          // The cleaned merchant plus the raw narration: "SALARY SEP" often only appears in the latter.
          const match = suggestCategory(`${merchant} ${row.description}`, { rules, categories, kind: row.type });
          return {
            ...row,
            hash: hashes[i],
            merchant,
            duplicate: dupes[i],
            include: dupes[i] === null,
            choice: match?.categoryId ?? null,
            manual: false,
          };
        }),
      );
      setStep("review");
    });
  }

  function choose(index: number, choice: string | null) {
    const key = rows[index].merchant.toLowerCase();
    setRows((current) =>
      current.map((row, i) => {
        if (i === index) return { ...row, choice, manual: true };
        // Same merchant, same direction, not hand-picked yet: follow along.
        const sameMerchant = key.length >= 2 && row.merchant.toLowerCase() === key && row.type === current[index].type;
        return sameMerchant && !row.manual ? { ...row, choice } : row;
      }),
    );
    if (choice && !choice.startsWith("transfer:") && key.length >= 2 && key.length <= 60) {
      setLearned((l) => ({ ...l, [key]: choice }));
    }
  }

  function runImport() {
    if (!accountId || !mapping) return;
    const chosen = rows.filter((r) => r.include);
    if (chosen.length === 0) return setError("Tick at least one transaction to import.");
    setError(null);
    startTransition(async () => {
      const payload = chosen.map((r) => {
        const transferTo = r.choice?.startsWith("transfer:") ? r.choice.slice(9) : null;
        return {
          type: transferTo ? ("transfer" as const) : r.type,
          amount: r.amount,
          occurred_on: r.date,
          // Money in from another of your accounts is a transfer from there to here.
          account_id: transferTo && r.type === "income" ? transferTo : accountId,
          to_account_id: transferTo ? (r.type === "income" ? accountId : transferTo) : null,
          category_id: transferTo ? null : r.choice,
          note: (r.merchant || r.description).slice(0, 200) || null,
          import_hash: r.hash,
        };
      });
      const res = await importStatement({
        accountId,
        filename: fileName,
        rows: payload,
        keepBalance,
        mapping: { ...mapping, signature: signature(cells, mapping) },
        rules: Object.entries(learned).map(([pattern, category_id]) => ({ pattern, category_id })),
      });
      if (!res.ok) return setError(res.error);
      setResult(res.data);
      setStep("done");
    });
  }

  function undo() {
    if (!result?.batchId) return;
    startTransition(async () => {
      const res = await undoImport(result.batchId!);
      if (!res.ok) return setError(res.error);
      toast.show({ message: `Import undone · ${res.data} removed` });
      setResult(null);
      setStep("upload");
      setRows([]);
    });
  }

  if (accounts.length === 0) {
    return (
      <Card className="py-10 text-center">
        <p className="font-medium">Add the account first</p>
        <p className="text-muted mt-1 text-sm">Statements are imported into one of your accounts.</p>
        <Link href="/wealth" className="text-save mt-4 inline-block text-sm font-medium">
          Go to Wealth →
        </Link>
      </Card>
    );
  }

  // ─── step: upload ──────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="space-y-5">
        <Card className="space-y-3">
          <CardLabel>1 · Which account is this statement for?</CardLabel>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <Chip key={a.id} selected={a.id === accountId} onClick={() => setAccountId(a.id)}>
                <span aria-hidden>{ACCOUNT_TYPES[a.type].emoji}</span> {a.name}
              </Chip>
            ))}
          </div>
        </Card>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFile(e.dataTransfer.files[0]);
          }}
          className={cn(
            "glass flex cursor-pointer flex-col items-center gap-3 p-10 text-center transition-colors",
            dragging ? "border-save/60 bg-save/10" : "hover:bg-glass-hover",
            !accountId && "pointer-events-none opacity-50",
          )}
        >
          <span className="bg-save/15 text-save grid size-12 place-items-center rounded-full">
            <Upload className="size-6" />
          </span>
          <span className="font-medium">2 · Drop your statement here, or tap to choose</span>
          <span className="text-muted text-sm">
            CSV, XLS or XLSX from your bank&apos;s &quot;Download statement&quot;
          </span>
          <input
            type="file"
            accept=".csv,.txt,.xls,.xlsx,.xlsm,.ods,text/csv"
            className="sr-only"
            disabled={!accountId}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>

        <p className="text-muted flex items-center justify-center gap-1.5 text-xs">
          <Lock className="size-3.5" /> The file is read in this browser. Only the transactions you approve are saved.
        </p>
        {error && <p className="text-expense text-center text-sm">{error}</p>}

        {recent.length > 0 && (
          <section className="space-y-2">
            <p className="text-muted px-1 text-xs font-medium tracking-[0.08em] uppercase">Recent imports</p>
            <ul className="glass divide-line divide-y overflow-hidden">
              {recent.map((batch) => (
                <RecentImport
                  key={batch.id}
                  batch={batch}
                  accountName={accounts.find((a) => a.id === batch.account_id)?.name}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // ─── step: map columns ─────────────────────────────────────────────────────
  if (step === "map" && mapping) {
    const header = cells[mapping.headerRow] ?? [];
    const width = Math.max(...cells.slice(mapping.headerRow, mapping.headerRow + 6).map((r) => r.length), 1);
    const columns = Array.from({ length: width }, (_, i) => ({ i, label: header[i] || `Column ${i + 1}` }));
    const split = mapping.debit !== null && mapping.credit !== null;
    const set = (patch: Partial<Mapping>) => setMapping({ ...mapping, ...patch });

    return (
      <div className="space-y-5">
        <BackLink onClick={() => setStep("upload")} label={fileName} />
        <Card className="space-y-4">
          <CardLabel>3 · Check the columns</CardLabel>
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full text-xs">
              <tbody className="divide-line divide-y">
                {cells.slice(mapping.headerRow, mapping.headerRow + 6).map((row, r) => (
                  <tr key={r} className={r === 0 ? "text-fg font-medium" : "text-muted"}>
                    {columns.map((c) => (
                      <td key={c.i} className="max-w-48 truncate px-2 py-1.5 whitespace-nowrap">
                        {row[c.i]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Header row">
              <select
                value={mapping.headerRow}
                onChange={(e) => set({ headerRow: Number(e.target.value) })}
                className={selectClass}
              >
                {cells.slice(0, 40).map((row, i) => (
                  <option key={i} value={i}>
                    Row {i + 1}: {row.filter(Boolean).slice(0, 3).join(" · ").slice(0, 50) || "(empty)"}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Date format">
              <select
                value={mapping.dateFormat}
                onChange={(e) => set({ dateFormat: e.target.value as DateFormat })}
                className={selectClass}
              >
                {(Object.keys(DATE_FORMATS) as DateFormat[]).map((f) => (
                  <option key={f} value={f}>
                    {DATE_FORMATS[f]}
                  </option>
                ))}
              </select>
            </Labeled>
            <Labeled label="Date">
              <ColumnSelect columns={columns} value={mapping.date} onChange={(v) => set({ date: v ?? 0 })} />
            </Labeled>
            <Labeled label="Description / narration">
              <ColumnSelect
                columns={columns}
                value={mapping.description}
                onChange={(v) => set({ description: v ?? 0 })}
              />
            </Labeled>
          </div>

          <div className="flex flex-wrap gap-2">
            <Chip
              selected={split}
              onClick={() =>
                set({
                  debit: mapping.debit ?? mapping.amount ?? 0,
                  credit: mapping.credit ?? 0,
                  amount: null,
                  drcr: null,
                })
              }
            >
              Separate withdrawal &amp; deposit columns
            </Chip>
            <Chip
              selected={!split}
              onClick={() => set({ amount: mapping.amount ?? mapping.debit ?? 0, debit: null, credit: null })}
            >
              One amount column
            </Chip>
          </div>

          {split ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Withdrawal (money out)">
                <ColumnSelect columns={columns} value={mapping.debit} onChange={(v) => set({ debit: v })} />
              </Labeled>
              <Labeled label="Deposit (money in)">
                <ColumnSelect columns={columns} value={mapping.credit} onChange={(v) => set({ credit: v })} />
              </Labeled>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Labeled label="Amount">
                <ColumnSelect columns={columns} value={mapping.amount} onChange={(v) => set({ amount: v })} />
              </Labeled>
              <Labeled label="Dr/Cr column (optional)">
                <ColumnSelect columns={columns} value={mapping.drcr} onChange={(v) => set({ drcr: v })} optional />
              </Labeled>
              {mapping.drcr === null && (
                <Labeled label="Money out is shown as">
                  <select
                    value={mapping.outflowSign}
                    onChange={(e) => set({ outflowSign: e.target.value as Mapping["outflowSign"] })}
                    className={selectClass}
                  >
                    <option value="negative">Negative numbers (−450)</option>
                    <option value="positive">Positive numbers (credit card statements)</option>
                  </select>
                </Labeled>
              )}
            </div>
          )}

          <p className="text-sm">
            <span className="text-income font-medium">{preview?.rows.length ?? 0} transactions found</span>
            {!!preview?.skipped && (
              <span className="text-muted"> · {preview.skipped} other rows skipped (totals, balances, blanks)</span>
            )}
          </p>
          {error && <p className="text-expense text-sm">{error}</p>}
          <Button onClick={toReview} disabled={pending || !preview?.rows.length} className="w-full sm:w-auto">
            {pending ? "Checking for duplicates…" : "Continue"}
          </Button>
        </Card>
      </div>
    );
  }

  // ─── step: review ──────────────────────────────────────────────────────────
  if (step === "review") {
    const included = rows.filter((r) => r.include);
    const imported = rows.filter((r) => r.duplicate === "imported").length;
    const possible = rows.filter((r) => r.duplicate === "possible").length;
    const uncategorised = included.filter((r) => !r.choice).length;
    const others = accounts.filter((a) => a.id !== accountId);

    return (
      <div className="space-y-5">
        <BackLink onClick={() => setStep("map")} label="Columns" />
        <Card className="space-y-3">
          <CardLabel>4 · Review</CardLabel>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-income font-medium">{included.length} to import</span>
            {imported > 0 && <span className="text-muted">{imported} already imported (skipped)</span>}
            {possible > 0 && (
              <span className="text-warn">{possible} look like entries you already logged (unticked)</span>
            )}
            {uncategorised > 0 && <span className="text-muted">{uncategorised} without a category</span>}
          </div>
          <p className="text-muted text-xs">
            Changing a category updates every row from the same merchant, and Paisa remembers it next time.
          </p>
        </Card>

        <ul className="glass divide-line divide-y overflow-hidden">
          {rows.map((row, i) => (
            <li
              key={row.hash}
              className={cn("flex flex-col gap-2 p-3 sm:flex-row sm:items-center", !row.include && "opacity-50")}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={row.include}
                  disabled={row.duplicate === "imported"}
                  onChange={(e) =>
                    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, include: e.target.checked } : r)))
                  }
                  className="accent-save size-4 shrink-0"
                />
                <span className="text-muted w-12 shrink-0 text-xs">{formatDue(row.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{row.merchant || row.description}</span>
                  <span className="text-subtle block truncate text-[11px]">
                    {row.duplicate === "imported"
                      ? "Already imported"
                      : row.duplicate === "possible"
                        ? "Looks like one you already logged"
                        : row.description}
                  </span>
                </span>
                <span
                  className={cn(
                    "money shrink-0 text-sm font-semibold tabular-nums",
                    row.type === "income" && "text-income",
                  )}
                >
                  {row.type === "income" ? "+" : "−"}
                  {formatINR(row.amount)}
                </span>
              </label>
              <select
                value={row.choice ?? ""}
                onChange={(e) => choose(i, e.target.value || null)}
                aria-label={`Category for ${row.merchant || row.description}`}
                className={cn(selectClass, "sm:w-52")}
              >
                <option value="">No category</option>
                <optgroup label={row.type === "income" ? "Income" : "Spending"}>
                  {categories
                    .filter((c) => c.kind === row.type && !c.archived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.name}
                      </option>
                    ))}
                </optgroup>
                {others.length > 0 && (
                  <optgroup label="Between my accounts">
                    {others.map((a) => (
                      <option key={a.id} value={`transfer:${a.id}`}>
                        ↔ {row.type === "income" ? "From" : "To"} {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </li>
          ))}
        </ul>

        <Card className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={keepBalance}
              onChange={(e) => setKeepBalance(e.target.checked)}
              className="accent-save mt-0.5 size-4"
            />
            <span>
              <span className="block text-sm font-medium">
                {account?.name}&apos;s balance in Paisa already includes these
              </span>
              <span className="text-muted block text-xs">
                Usually true: you added the account with today&apos;s balance and are importing history. Paisa then
                adjusts the starting balance so today&apos;s figure doesn&apos;t change. Untick if these are new
                transactions.
              </span>
            </span>
          </label>
          {error && <p className="text-expense text-sm">{error}</p>}
          <Button onClick={runImport} disabled={pending || included.length === 0} className="w-full">
            <FileSpreadsheet className="size-4" />
            {pending ? "Importing…" : `Import ${included.length} transaction${included.length === 1 ? "" : "s"}`}
          </Button>
        </Card>
      </div>
    );
  }

  // ─── step: done ────────────────────────────────────────────────────────────
  return (
    <Card className="space-y-4 py-10 text-center">
      <span className="bg-income/15 text-income mx-auto grid size-12 place-items-center rounded-full">
        <Check className="size-6" />
      </span>
      <div>
        <p className="text-lg font-semibold">
          {result?.inserted ? `Imported ${result.inserted} transactions` : "Nothing new to import"}
        </p>
        <p className="text-muted mt-1 text-sm">
          {result?.inserted
            ? `Into ${account?.name}. Categories you set will be suggested next time.`
            : "Every line was already in Paisa."}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/activity" className={buttonClass()}>
          See them in Activity
        </Link>
        {result?.batchId && (
          <Button variant="glass" onClick={undo} disabled={pending}>
            <Undo2 className="size-4" /> {pending ? "Undoing…" : "Undo import"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function RecentImport({ batch, accountName }: { batch: ImportBatch; accountName?: string }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const when = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(batch.created_at));

  function undo() {
    if (!confirm) return setConfirm(true);
    startTransition(async () => {
      const res = await undoImport(batch.id);
      toast.show(res.ok ? { message: `Import undone · ${res.data} removed` } : { message: res.error, tone: "error" });
    });
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <FileSpreadsheet className="text-subtle size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{batch.filename}</span>
        <span className="text-muted block text-xs">
          {batch.row_count} into {accountName ?? "an account"} · {when}
        </span>
      </span>
      <Button
        variant="ghost"
        onClick={undo}
        disabled={pending}
        className={cn("h-9 px-3 text-xs", confirm && "bg-expense/15 text-expense hover:text-expense")}
      >
        <Undo2 className="size-3.5" /> {pending ? "Undoing…" : confirm ? "Tap again" : "Undo"}
      </Button>
    </li>
  );
}

function ColumnSelect({
  columns,
  value,
  onChange,
  optional,
}: {
  columns: { i: number; label: string }[];
  value: number | null;
  onChange: (v: number | null) => void;
  optional?: boolean;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={selectClass}
    >
      {optional && <option value="">None</option>}
      {columns.map((c) => (
        <option key={c.i} value={c.i}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function BackLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="text-muted hover:text-fg inline-flex items-center gap-1 text-sm">
      <ArrowLeft className="size-4" /> {label}
    </button>
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
