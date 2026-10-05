"use server";

import { z } from "zod";
import { appConfig } from "@/config/app";
import { run, type ActionResult } from "@/lib/actions/run";
import { searchSchemes, type Scheme } from "@/lib/mf";
import { addDays, todayIn } from "@/lib/month";
import { nextOccurrence } from "@/lib/recurring";
import type { StockListing } from "@/lib/stock-prices";
import { searchStocks } from "@/lib/stocks";
import { getCurrentUser } from "@/lib/supabase/server";

const id = z.uuid();
const date = z.iso.date();
const paise = z.number().int().min(0).max(1e14);

export async function findSchemes(query: string): Promise<Scheme[]> {
  if (!(await getCurrentUser())) return [];
  return searchSchemes(z.string().max(80).parse(query));
}

/** Null means search itself is unavailable (the stock list couldn't be fetched). */
export async function findStocks(query: string): Promise<StockListing[] | null> {
  if (!(await getCurrentUser())) return [];
  return searchStocks(z.string().max(60).parse(query));
}

// ─── holdings ────────────────────────────────────────────────────────────────

const holdingSchema = z
  .object({
    id: id.optional(),
    name: z.string().trim().min(1, "Give it a name").max(120),
    asset_class: z.enum(["mutual_fund", "stock", "fd", "ppf", "epf", "nps", "gold", "crypto", "other"]),
    scheme_code: z.number().int().positive().nullish(),
    opening_units: z.number().min(0).max(1e12).default(0),
    opening_cost: paise.default(0),
    opening_date: date.nullish(),
    manual_value: paise.nullish(),
    manual_value_at: date.nullish(),
    fd_rate: z.number().min(0).max(100).nullish(),
    fd_start: date.nullish(),
    fd_maturity: date.nullish(),
    fd_compounding: z.enum(["monthly", "quarterly", "half_yearly", "yearly", "simple"]).nullish(),
    platform: z.string().trim().max(40, "Keep the platform under 40 characters").nullish(),
    isin: z
      .string()
      .regex(/^IN[A-Z0-9]{9}[0-9]$/, "That isn't a valid Indian ISIN")
      .nullish(),
    ticker: z.string().trim().min(1).max(30).nullish(),
  })
  .refine((h) => h.asset_class !== "mutual_fund" || h.scheme_code, { message: "Pick the fund from the search results" })
  .refine((h) => h.asset_class !== "fd" || (h.fd_rate !== null && h.fd_rate !== undefined && h.fd_start), {
    message: "Enter the FD's interest rate and start date",
  })
  .refine((h) => h.asset_class !== "fd" || h.opening_cost > 0, { message: "Enter the FD amount" });

export type HoldingInput = z.input<typeof holdingSchema>;

export async function saveHolding(input: HoldingInput): Promise<ActionResult> {
  return run(async (supabase) => {
    const { id: holdingId, ...h } = holdingSchema.parse(input);
    const tracked = h.asset_class === "stock" && Boolean(h.isin);
    const manualValue = tracked ? null : (h.manual_value ?? null);
    const fields = {
      ...h,
      scheme_code: h.asset_class === "mutual_fund" ? h.scheme_code : null,
      manual_value: manualValue,
      manual_value_at: manualValue !== null ? (h.manual_value_at ?? todayIn(appConfig.timeZone)) : null,
      fd_rate: h.asset_class === "fd" ? h.fd_rate : null,
      fd_start: h.asset_class === "fd" ? h.fd_start : null,
      fd_maturity: h.asset_class === "fd" ? (h.fd_maturity ?? null) : null,
      fd_compounding: h.asset_class === "fd" ? (h.fd_compounding ?? "quarterly") : null,
      opening_date: h.asset_class === "fd" ? h.fd_start : (h.opening_date ?? null),
      platform: h.platform || null,
      // A tracked stock is priced from the market; a portfolio total (no ISIN) keeps its typed-in value.
      isin: h.asset_class === "stock" ? (h.isin ?? null) : null,
      ticker: h.asset_class === "stock" && h.isin ? (h.ticker ?? null) : null,
    };
    const { error } = holdingId
      ? await supabase.from("holdings").update(fields).eq("id", holdingId)
      : await supabase.from("holdings").insert(fields);
    if (error) throw error;
    return undefined;
  });
}

/** "My PPF is worth ₹2.4L today." */
export async function updateHoldingValue(holdingId: string, value: number): Promise<ActionResult> {
  return run(async (supabase) => {
    const { error } = await supabase
      .from("holdings")
      .update({ manual_value: paise.parse(value), manual_value_at: todayIn(appConfig.timeZone) })
      .eq("id", id.parse(holdingId));
    if (error) throw error;
    return undefined;
  });
}

export async function setHoldingArchived(holdingId: string, archived: boolean): Promise<ActionResult> {
  return run(async (supabase) => {
    const { error } = await supabase.from("holdings").update({ archived }).eq("id", id.parse(holdingId));
    if (error) throw error;
    return undefined;
  });
}

export async function deleteHolding(holdingId: string): Promise<ActionResult> {
  return run(async (supabase) => {
    const { error } = await supabase.from("holdings").delete().eq("id", id.parse(holdingId));
    if (error) throw error;
    return undefined;
  });
}

const flowSchema = z.object({
  holdingId: id,
  type: z.enum(["invest", "redeem"]),
  amount: z.number().int().positive().max(1e14),
  accountId: id,
  occurredOn: date,
  units: z.number().positive().max(1e12).nullish(),
  note: z.string().trim().max(200).nullish(),
});

/** Buy more, or sell/redeem: money moves between a bank account and the holding. */
export async function recordHoldingFlow(input: z.input<typeof flowSchema>): Promise<ActionResult> {
  return run(async (supabase) => {
    const f = flowSchema.parse(input);
    const { error } = await supabase.from("transactions").insert({
      type: f.type,
      amount: f.amount,
      occurred_on: f.occurredOn,
      account_id: f.accountId,
      holding_id: f.holdingId,
      units: f.units ?? null,
      note: f.note || null,
    });
    if (error) throw error;
    return undefined;
  });
}

// ─── loans ───────────────────────────────────────────────────────────────────

const loanSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Give it a name, like Home loan").max(60),
  lender: z.string().trim().max(60).nullish(),
  principal: z.number().int().positive("Enter the loan amount").max(1e14),
  annual_rate: z.number().min(0).max(100),
  tenure_months: z.number().int().min(1, "Tenure must be at least a month").max(600),
  first_emi_date: date,
  emi: z.number().int().positive("Enter the EMI").max(1e14),
  outstanding_override: paise.nullish(),
  override_at: date.nullish(),
});

export type LoanInput = z.input<typeof loanSchema>;

export async function saveLoan(input: LoanInput): Promise<ActionResult> {
  return run(async (supabase) => {
    const { id: loanId, ...l } = loanSchema.parse(input);
    const fields = {
      ...l,
      lender: l.lender || null,
      outstanding_override: l.outstanding_override ?? null,
      override_at:
        l.outstanding_override !== null && l.outstanding_override !== undefined
          ? (l.override_at ?? todayIn(appConfig.timeZone))
          : null,
    };
    const { error } = loanId
      ? await supabase.from("loans").update(fields).eq("id", loanId)
      : await supabase.from("loans").insert(fields);
    if (error) throw error;
    return undefined;
  });
}

export async function deleteLoan(loanId: string): Promise<ActionResult> {
  return run(async (supabase) => {
    const { error } = await supabase.from("loans").delete().eq("id", id.parse(loanId));
    if (error) throw error;
    return undefined;
  });
}

/** Set up the EMI as a monthly recurring expense from a bank account (from the next EMI date on). */
export async function addEmiRecurring(input: { loanId: string; accountId: string }): Promise<ActionResult> {
  return run(async (supabase) => {
    const { data: loan, error } = await supabase
      .from("loans")
      .select("name, emi, first_emi_date")
      .eq("id", id.parse(input.loanId))
      .single();
    if (error) throw error;
    const today = todayIn(appConfig.timeZone);
    const { error: insertError } = await supabase.from("recurring_rules").insert({
      name: `${loan.name} EMI`.slice(0, 40),
      type: "expense",
      amount: loan.emi,
      account_id: id.parse(input.accountId),
      frequency: "monthly",
      anchor_date: loan.first_emi_date,
      next_due: nextOccurrence("monthly", loan.first_emi_date, addDays(today, -1)),
      mode: "auto",
    });
    if (insertError) throw insertError;
    return undefined;
  });
}
