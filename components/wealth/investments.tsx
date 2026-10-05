"use client";

import { Archive, ArchiveRestore, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Chip, Segmented } from "@/components/ui/chip";
import { AccountChips, Field } from "@/components/ui/form-fields";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { appConfig } from "@/config/app";
import {
  deleteHolding,
  findSchemes,
  findStocks,
  recordHoldingFlow,
  saveHolding,
  setHoldingArchived,
  updateHoldingValue,
} from "@/lib/actions/wealth";
import { cn } from "@/lib/cn";
import type { Compounding } from "@/lib/finance/fd";
import { ASSET_CLASSES, isManual, isPriced, type AssetClass } from "@/lib/finance/holdings";
import { formatINR, formatRupees } from "@/lib/money";
import { todayIn } from "@/lib/month";
import { parseAmount } from "@/lib/parse/amount";
import type { StockListing } from "@/lib/stock-prices";
import type { Account } from "@/lib/types";
import type { HoldingView } from "@/lib/wealth";

type Editing = HoldingView | "new" | null;

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export function Investments({ holdings, accounts }: { holdings: HoldingView[]; accounts: Account[] }) {
  const [editing, setEditing] = useState<Editing>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const platforms = [...new Set(holdings.map((h) => h.platform).filter((p): p is string => Boolean(p)))].sort();
  const allLive = holdings.filter((h) => !h.archived);
  const livePlatforms = [...new Set(allLive.map((h) => h.platform).filter(Boolean))];
  // Once investments sit on two or more platforms, chips filter the list (and the totals) by platform.
  const filtering = livePlatforms.length >= 2;
  const live = filtering && platform ? allLive.filter((h) => h.platform === platform) : allLive;
  const archived = holdings.filter((h) => h.archived);
  const value = live.reduce((s, h) => s + h.position.value, 0);
  const invested = live.reduce((s, h) => s + h.position.invested, 0);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Investments</h2>
          {live.length > 0 && (
            <p className="text-muted text-xs">
              <span className="money">{formatRupees(invested)}</span> in ·{" "}
              <span className={cn("money", value >= invested ? "text-income" : "text-expense")}>
                {formatRupees(value - invested, { sign: true })}
              </span>
            </p>
          )}
        </div>
        <Button variant="glass" className="h-10 px-4" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      {filtering && (
        <div className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          <Chip tone="invest" selected={platform === null} onClick={() => setPlatform(null)}>
            All
          </Chip>
          {livePlatforms.map((p) => (
            <Chip key={p} tone="invest" selected={platform === p} onClick={() => setPlatform(p)}>
              {p}
            </Chip>
          ))}
        </div>
      )}

      {allLive.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="glass hover:bg-glass-hover w-full p-8 text-center transition-colors"
        >
          <p className="text-4xl">📈</p>
          <p className="mt-3 font-medium">Add your investments</p>
          <p className="text-muted mt-1 text-sm">
            Mutual funds are priced daily. FDs grow on their own. PPF, EPF, stocks: update now and then.
          </p>
        </button>
      ) : (
        <HoldingRows holdings={live} onSelect={setEditing} />
      )}
      {archived.length > 0 && (
        <details className="text-sm">
          <summary className="text-muted hover:text-fg cursor-pointer px-1">{archived.length} archived</summary>
          <div className="mt-3 opacity-60">
            <HoldingRows holdings={archived} onSelect={setEditing} />
          </div>
        </details>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add investment" : "Investment"}
      >
        {editing !== null && (
          <HoldingSheet
            key={editing === "new" ? "new" : editing.id}
            holding={editing === "new" ? null : editing}
            accounts={accounts}
            platforms={platforms}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

function HoldingRows({ holdings, onSelect }: { holdings: HoldingView[]; onSelect: (h: HoldingView) => void }) {
  return (
    <ul className="glass divide-line divide-y overflow-hidden">
      {holdings.map((h) => {
        const p = h.position;
        const gainPct = p.invested > 0 ? p.gain / p.invested : null;
        return (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => onSelect(h)}
              className="hover:bg-glass-hover flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors"
            >
              <span className="bg-glass-hover grid size-10 shrink-0 place-items-center rounded-full text-lg">
                {ASSET_CLASSES[h.asset_class].emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{h.name}</span>
                <span className="text-muted block truncate text-xs">
                  {ASSET_CLASSES[h.asset_class].label}
                  {h.ticker && ` · ${h.ticker}`}
                  {h.platform && ` · ${h.platform}`}
                  {p.xirr !== null && ` · ${pct(p.xirr)} a year`}
                  {p.estimated && " · estimate"}
                </span>
              </span>
              <span className="text-right">
                <span className="money block text-sm font-semibold tabular-nums">{formatRupees(p.value)}</span>
                {gainPct !== null && (
                  <span
                    className={cn("money block text-xs tabular-nums", p.gain >= 0 ? "text-income" : "text-expense")}
                  >
                    {pct(gainPct)}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

type Mode = "details" | "add" | "redeem" | "value";

function HoldingSheet({
  holding,
  accounts,
  platforms,
  onDone,
}: {
  holding: HoldingView | null;
  accounts: Account[];
  platforms: string[];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>("details");
  if (!holding) return <HoldingForm holding={null} platforms={platforms} onDone={onDone} />;
  const manual = isManual(holding);
  const stock = holding.asset_class === "stock";
  const p = holding.position;
  const options: { value: Mode; label: string; activeClass: string }[] = [
    { value: "details", label: "Details", activeClass: "bg-glass-hover text-fg" },
    { value: "add", label: stock ? "Buy" : "Add money", activeClass: "bg-invest text-bg" },
    { value: "redeem", label: stock ? "Sell" : "Redeem", activeClass: "bg-glass-hover text-fg" },
    ...(manual ? [{ value: "value" as const, label: "Update value", activeClass: "bg-save text-bg" }] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Value" value={formatRupees(p.value)} />
        <Stat label="Invested" value={formatRupees(p.invested)} />
        <Stat
          label="Gain"
          value={formatRupees(p.gain, { sign: true })}
          className={p.gain >= 0 ? "text-income" : "text-expense"}
        />
      </div>
      {isPriced(holding) && p.units > 0 && (
        <p className="text-muted -mt-2 text-center text-xs">
          {holding.asset_class === "stock"
            ? `${Number(p.units.toFixed(4))} shares · ${formatINR(Math.round(p.value / p.units))} each`
            : `${p.units.toFixed(3)} units`}
          {p.xirr !== null && ` · ${pct(p.xirr)} a year (XIRR)`}
          {p.estimated && " · price unavailable, showing cost"}
        </p>
      )}
      <Segmented value={mode} onChange={setMode} options={options} />
      {mode === "details" && <HoldingForm holding={holding} platforms={platforms} onDone={onDone} />}
      {(mode === "add" || mode === "redeem") && (
        <FlowForm holding={holding} accounts={accounts} type={mode === "add" ? "invest" : "redeem"} onDone={onDone} />
      )}
      {mode === "value" && <ValueForm holding={holding} onDone={onDone} />}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="bg-glass rounded-2xl p-3">
      <p className="text-muted text-[11px] tracking-[0.06em] uppercase">{label}</p>
      <p className={cn("money mt-1 truncate text-sm font-semibold tabular-nums", className)}>{value}</p>
    </div>
  );
}

function rupeesText(paise: number | null | undefined) {
  return paise ? String(paise / 100) : "";
}

function HoldingForm({
  holding,
  platforms,
  onDone,
}: {
  holding: HoldingView | null;
  platforms: string[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [platform, setPlatform] = useState(holding?.platform ?? "");
  // Stocks: one company tracked at its market price, or a whole portfolio's total typed in now and then.
  const [stockMode, setStockMode] = useState<"single" | "portfolio">(
    holding ? (holding.isin ? "single" : "portfolio") : "single",
  );
  const [isin, setIsin] = useState<string | null>(holding?.isin ?? null);
  const [ticker, setTicker] = useState<string | null>(holding?.ticker ?? null);
  const [stockQuery, setStockQuery] = useState("");
  const [stockResults, setStockResults] = useState<StockListing[] | null>([]);
  const [assetClass, setAssetClass] = useState<AssetClass>(holding?.asset_class ?? "mutual_fund");
  const [name, setName] = useState(holding?.name ?? "");
  const [schemeCode, setSchemeCode] = useState<number | null>(holding?.scheme_code ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ code: number; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [units, setUnits] = useState(holding?.opening_units ? String(holding.opening_units) : "");
  const [cost, setCost] = useState(rupeesText(holding?.opening_cost));
  const [since, setSince] = useState(holding?.opening_date ?? "");
  const [value, setValue] = useState(rupeesText(holding?.manual_value));
  const [rate, setRate] = useState(
    holding?.fd_rate !== null && holding?.fd_rate !== undefined ? String(holding.fd_rate) : "",
  );
  const [fdStart, setFdStart] = useState(holding?.fd_start ?? "");
  const [fdMaturity, setFdMaturity] = useState(holding?.fd_maturity ?? "");
  const [compounding, setCompounding] = useState<Compounding>(holding?.fd_compounding ?? "quarterly");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const meta = ASSET_CLASSES[assetClass];
  const singleStock = assetClass === "stock" && stockMode === "single";
  const priced = assetClass === "mutual_fund" || singleStock;
  const manualFields = meta.manual && !singleStock;

  // Fund search, debounced.
  useEffect(() => {
    if (assetClass !== "mutual_fund" || query.trim().length < 3) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      setResults(await findSchemes(query));
      setSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [query, assetClass]);

  // Stock search, debounced. Null results mean the stock list couldn't be loaded.
  useEffect(() => {
    if (!singleStock || stockQuery.trim().length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      setStockResults(await findStocks(stockQuery));
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [stockQuery, singleStock]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const costPaise = cost.trim() ? parseAmount(cost) : 0;
    if (costPaise === null) return setError("Amount invested should be a number, like 50000 or 1.2L");
    const valuePaise = value.trim() ? parseAmount(value) : null;
    if (value.trim() && valuePaise === null) return setError("Current value should be a number");
    const unitsNum = units.trim() ? Number(units.replace(/,/g, "")) : 0;
    if (!Number.isFinite(unitsNum) || unitsNum < 0) return setError("Units should be a number");
    if (singleStock && !isin) return setError("Pick the stock from the search results");
    setError(null);
    startTransition(async () => {
      const result = await saveHolding({
        id: holding?.id,
        name,
        asset_class: assetClass,
        scheme_code: schemeCode,
        opening_units: priced ? unitsNum : 0,
        opening_cost: costPaise,
        opening_date: since || null,
        manual_value: manualFields ? valuePaise : null,
        manual_value_at:
          manualFields && valuePaise !== null && valuePaise !== holding?.manual_value
            ? todayIn(appConfig.timeZone)
            : holding?.manual_value_at,
        fd_rate: assetClass === "fd" && rate ? Number(rate) : null,
        fd_start: fdStart || null,
        fd_maturity: fdMaturity || null,
        fd_compounding: compounding,
        platform: platform.trim() || null,
        isin: singleStock ? isin : null,
        ticker: singleStock ? ticker : null,
      });
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: holding ? "Saved" : `${name.slice(0, 40)} added` });
    });
  }

  function archive() {
    if (!holding) return;
    startTransition(async () => {
      const result = await setHoldingArchived(holding.id, !holding.archived);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: holding.archived ? "Restored" : "Archived" });
    });
  }

  function remove() {
    if (!holding) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const result = await deleteHolding(holding.id);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: "Deleted" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {!holding && (
        <Field label="Type">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ASSET_CLASSES) as AssetClass[]).map((c) => (
              <Chip key={c} tone="invest" selected={assetClass === c} onClick={() => setAssetClass(c)}>
                <span aria-hidden>{ASSET_CLASSES[c].emoji}</span> {ASSET_CLASSES[c].label}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      {assetClass === "stock" && !holding && (
        <Segmented
          value={stockMode}
          onChange={setStockMode}
          options={[
            { value: "single", label: "One stock · live price", activeClass: "bg-invest text-bg" },
            { value: "portfolio", label: "A portfolio total", activeClass: "bg-glass-hover text-fg" },
          ]}
        />
      )}

      {singleStock && !holding ? (
        <Field label="Stock">
          {isin ? (
            <div className="border-invest/40 bg-invest/10 flex items-center gap-3 rounded-2xl border p-3">
              <span className="min-w-0 flex-1 text-sm">
                {name} <span className="text-muted">· {ticker}</span>
              </span>
              <button type="button" onClick={() => setIsin(null)} className="text-muted hover:text-fg text-xs">
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="text-subtle pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                <Input
                  value={stockQuery}
                  onChange={(e) => setStockQuery(e.target.value)}
                  placeholder="Search: reliance, TCS, or an ISIN"
                  className="pl-11"
                  autoFocus
                />
              </div>
              {searching && <p className="text-muted text-xs">Searching… (the first search can take a few seconds)</p>}
              {stockResults && stockResults.length > 0 && (
                <ul className="border-line divide-line max-h-60 divide-y overflow-y-auto rounded-2xl border">
                  {stockResults.map((r) => (
                    <li key={r.isin}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsin(r.isin);
                          setTicker(r.symbol);
                          setName(companyName(r.name, r.symbol));
                          setStockResults([]);
                        }}
                        className="hover:bg-glass-hover flex w-full items-baseline gap-2 px-3 py-2.5 text-left text-sm"
                      >
                        <span className="font-medium">{r.symbol}</span>
                        <span className="text-muted min-w-0 truncate text-xs">{r.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {stockResults === null && (
                <p className="text-expense text-xs">
                  Stock search isn&apos;t available right now. Choose &ldquo;A portfolio total&rdquo; instead, or try
                  again later.
                </p>
              )}
              {!searching && stockResults?.length === 0 && stockQuery.trim().length >= 2 && (
                <p className="text-muted text-xs">No NSE stocks found. Try the symbol, like INFY.</p>
              )}
            </div>
          )}
        </Field>
      ) : assetClass === "mutual_fund" && !holding ? (
        <Field label="Fund">
          {schemeCode ? (
            <div className="border-invest/40 bg-invest/10 flex items-center gap-3 rounded-2xl border p-3">
              <span className="min-w-0 flex-1 text-sm">{name}</span>
              <button type="button" onClick={() => setSchemeCode(null)} className="text-muted hover:text-fg text-xs">
                Change
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="text-subtle pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search: parag parikh flexi"
                  className="pl-11"
                  autoFocus
                />
              </div>
              {searching && <p className="text-muted text-xs">Searching…</p>}
              {results.length > 0 && (
                <ul className="border-line divide-line max-h-60 divide-y overflow-y-auto rounded-2xl border">
                  {results.map((r) => (
                    <li key={r.code}>
                      <button
                        type="button"
                        onClick={() => {
                          setSchemeCode(r.code);
                          setName(r.name);
                          setResults([]);
                        }}
                        className="hover:bg-glass-hover w-full px-3 py-2.5 text-left text-sm"
                      >
                        {r.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!searching && query.trim().length >= 3 && results.length === 0 && (
                <p className="text-muted text-xs">No funds found. Try fewer words.</p>
              )}
            </div>
          )}
        </Field>
      ) : (
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
            placeholder={
              assetClass === "fd" ? "SBI FD · Mar 2027" : assetClass === "stock" ? "Zerodha stocks" : meta.label
            }
          />
        </Field>
      )}

      {priced && (
        <div className="grid grid-cols-2 gap-3">
          <Labeled label={singleStock ? "Shares you hold" : "Units you hold"}>
            <Input value={units} onChange={(e) => setUnits(e.target.value)} inputMode="decimal" placeholder="0" />
          </Labeled>
          <Labeled label="Amount invested so far">
            <Rupee value={cost} onChange={setCost} />
          </Labeled>
          <Labeled label="Held since (optional)">
            <Input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="[color-scheme:dark]"
            />
          </Labeled>
          <p className="text-subtle col-span-2 -mt-1 text-xs">
            {singleStock
              ? "From your broker app's holdings. The price updates by itself every day."
              : "From your fund app or CAS statement. Leave 0 for a brand-new SIP. The date makes yearly returns accurate."}
          </p>
        </div>
      )}

      {assetClass === "fd" && (
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Amount">
            <Rupee value={cost} onChange={setCost} />
          </Labeled>
          <Labeled label="Interest rate (% a year)">
            <Input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="7.1" />
          </Labeled>
          <Labeled label="Start date">
            <Input
              type="date"
              value={fdStart}
              onChange={(e) => setFdStart(e.target.value)}
              className="[color-scheme:dark]"
            />
          </Labeled>
          <Labeled label="Maturity (optional)">
            <Input
              type="date"
              value={fdMaturity}
              min={fdStart}
              onChange={(e) => setFdMaturity(e.target.value)}
              className="[color-scheme:dark]"
            />
          </Labeled>
          <Labeled label="Compounding">
            <select
              value={compounding}
              onChange={(e) => setCompounding(e.target.value as Compounding)}
              className="border-line bg-glass text-fg h-12 w-full rounded-2xl border px-4 text-base [color-scheme:dark] outline-none"
            >
              <option value="quarterly">Quarterly (most banks)</option>
              <option value="monthly">Monthly</option>
              <option value="half_yearly">Half-yearly</option>
              <option value="yearly">Yearly</option>
              <option value="simple">Simple interest</option>
            </select>
          </Labeled>
        </div>
      )}

      {manualFields && (
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Current value">
            <Rupee value={value} onChange={setValue} />
          </Labeled>
          <Labeled label="Amount invested so far">
            <Rupee value={cost} onChange={setCost} />
          </Labeled>
          <Labeled label="Held since (optional)">
            <Input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="[color-scheme:dark]"
            />
          </Labeled>
          <p className="text-subtle col-span-2 -mt-1 text-xs">
            Check your passbook or app now and then and update it here.
          </p>
        </div>
      )}

      <Labeled label="Platform (optional)">
        <Input
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          list="holding-platforms"
          maxLength={40}
          placeholder="The app or broker it's in, like Kotak Neo"
        />
        <datalist id="holding-platforms">
          {platforms.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </Labeled>

      {error && <p className="text-expense text-sm">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : holding ? "Save" : "Add investment"}
      </Button>

      {holding && (
        <div className="border-line flex gap-2 border-t pt-4">
          <Button type="button" variant="ghost" onClick={archive} disabled={pending} className="h-10 flex-1">
            {holding.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            {holding.archived ? "Unarchive" : "Archive"}
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

function FlowForm({
  holding,
  accounts,
  type,
  onDone,
}: {
  holding: HoldingView;
  accounts: Account[];
  type: "invest" | "redeem";
  onDone: () => void;
}) {
  const toast = useToast();
  const [amountText, setAmountText] = useState("");
  const [accountId, setAccountId] = useState<string | null>(
    accounts.find((a) => a.type === "bank")?.id ?? accounts[0]?.id ?? null,
  );
  const [date, setDate] = useState(todayIn(appConfig.timeZone));
  const [units, setUnits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(amountText);
    if (!amount) return setError("Enter an amount");
    if (!accountId) return setError("Pick an account");
    const unitsNum = units.trim() ? Number(units) : null;
    setError(null);
    startTransition(async () => {
      const result = await recordHoldingFlow({
        holdingId: holding.id,
        type,
        amount,
        accountId,
        occurredOn: date,
        units: unitsNum,
      });
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: `${type === "invest" ? "Invested" : "Redeemed"} ${formatRupees(amount)}` });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Labeled label={type === "invest" ? "Amount invested" : "Amount received"}>
        <Rupee value={amountText} onChange={setAmountText} autoFocus />
      </Labeled>
      <Field label={type === "invest" ? "From" : "Into"}>
        <AccountChips accounts={accounts} value={accountId} onChange={setAccountId} tone="invest" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Date">
          <Input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="[color-scheme:dark]"
          />
        </Labeled>
        {isPriced(holding) && (
          <Labeled label={holding.asset_class === "stock" ? "Shares (optional)" : "Units (optional)"}>
            <Input
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              inputMode="decimal"
              placeholder={holding.asset_class === "stock" ? "From price" : "From NAV"}
            />
          </Labeled>
        )}
      </div>
      {error && <p className="text-expense text-sm">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending
          ? "Saving…"
          : holding.asset_class === "stock"
            ? type === "invest"
              ? "Record purchase"
              : "Record sale"
            : type === "invest"
              ? "Add money"
              : "Record redemption"}
      </Button>
    </form>
  );
}

function ValueForm({ holding, onDone }: { holding: HoldingView; onDone: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(rupeesText(holding.position.value));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const paise = parseAmount(value);
    if (paise === null) return setError("Enter the current value");
    startTransition(async () => {
      const result = await updateHoldingValue(holding.id, paise);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: `${holding.name.slice(0, 30)} updated` });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Labeled label="What it's worth today">
        <Rupee value={value} onChange={setValue} autoFocus />
      </Labeled>
      {holding.manual_value_at && (
        <p className="text-subtle -mt-3 text-xs">
          Last updated{" "}
          {new Intl.DateTimeFormat("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${holding.manual_value_at}T00:00:00Z`))}
        </p>
      )}
      {error && <p className="text-expense text-sm">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Update value"}
      </Button>
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

function Rupee({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <span className="text-muted pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">₹</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="0"
        autoFocus={autoFocus}
        className="pl-9 tabular-nums"
      />
    </div>
  );
}

/** "ITC LTD" → "ITC Ltd", "RELIANCE INDUSTRIES LTD" → "Reliance Industries Ltd". */
function companyName(raw: string, symbol: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.toUpperCase() === symbol ? symbol : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
