"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import type { Transaction } from "@/lib/types";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const id = z.uuid();
const date = z.iso.date("Pick a valid date");
const paise = z.number().int().positive("Enter an amount above zero").max(1e14, "That amount is too large");

async function run<T>(
  work: (supabase: Awaited<ReturnType<typeof createClient>>) => Promise<T>,
): Promise<ActionResult<T>> {
  if (!(await getCurrentUser())) return { ok: false, error: "You're signed out. Refresh and sign in again." };
  try {
    const data = await work(await createClient());
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

function friendlyError(error: unknown): string {
  const e = error as { code?: string; message?: string; issues?: { message: string }[] };
  if (e.issues?.length) return e.issues[0].message;
  if (e.code === "23505") return "One with that name already exists.";
  if (e.code === "23503") return "It's still used by transactions. Archive it instead.";
  return e.message ?? "Something went wrong. Please try again.";
}

// ─── transactions ────────────────────────────────────────────────────────────

const transactionSchema = z
  .object({
    id: id.optional(),
    type: z.enum(["income", "expense", "transfer"]),
    amount: paise,
    occurred_on: date,
    account_id: z.uuid("Pick an account"),
    to_account_id: id.nullish(),
    category_id: id.nullish(),
    note: z.string().trim().max(200).nullish(),
  })
  .transform((t) => ({
    ...t,
    to_account_id: t.type === "transfer" ? (t.to_account_id ?? null) : null,
    category_id: t.type === "transfer" ? null : (t.category_id ?? null),
    note: t.note || null,
  }))
  .refine((t) => t.type !== "transfer" || (t.to_account_id && t.to_account_id !== t.account_id), {
    message: "Pick two different accounts for a transfer",
  });

export type TransactionInput = z.input<typeof transactionSchema>;

const TRANSACTION_COLUMNS = "id, type, amount, occurred_on, account_id, to_account_id, category_id, note, created_at";

export async function saveTransaction(input: TransactionInput): Promise<ActionResult<Transaction>> {
  return run(async (supabase) => {
    const { id: existingId, ...fields } = transactionSchema.parse(input);
    const query = existingId
      ? supabase.from("transactions").update(fields).eq("id", existingId)
      : supabase.from("transactions").insert(fields);
    const { data, error } = await query.select(TRANSACTION_COLUMNS).single();
    if (error) throw error;
    return { ...data, amount: Number(data.amount) };
  });
}

export async function deleteTransaction(transactionId: string): Promise<ActionResult<Transaction>> {
  return run(async (supabase) => {
    const { data, error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id.parse(transactionId))
      .select(TRANSACTION_COLUMNS)
      .single();
    if (error) throw error;
    return { ...data, amount: Number(data.amount) };
  });
}

/** Undo for a delete: put the exact row back. */
export async function restoreTransaction(row: Transaction): Promise<ActionResult<Transaction>> {
  return run(async (supabase) => {
    const { id: rowId, ...fields } = transactionSchema.parse(row);
    const { data, error } = await supabase
      .from("transactions")
      .insert({ id: rowId, ...fields, created_at: row.created_at })
      .select(TRANSACTION_COLUMNS)
      .single();
    if (error) throw error;
    return { ...data, amount: Number(data.amount) };
  });
}

// ─── accounts ────────────────────────────────────────────────────────────────

const accountSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Give it a name").max(40),
  type: z.enum(["bank", "cash", "wallet", "credit_card"]),
  opening_balance: z.number().int().min(-1e14).max(1e14),
});

export type AccountInput = z.input<typeof accountSchema>;

export async function saveAccount(input: AccountInput): Promise<ActionResult> {
  return run(async (supabase) => {
    const { id: accountId, ...fields } = accountSchema.parse(input);
    const { error } = accountId
      ? await supabase.from("accounts").update(fields).eq("id", accountId)
      : await supabase.from("accounts").insert(fields);
    if (error) throw error;
    return undefined;
  });
}

export async function setAccountArchived(accountId: string, archived: boolean): Promise<ActionResult> {
  return run(async (supabase) => {
    const { error } = await supabase.from("accounts").update({ archived }).eq("id", id.parse(accountId));
    if (error) throw error;
    return undefined;
  });
}

export async function deleteAccount(accountId: string): Promise<ActionResult> {
  return run(async (supabase) => {
    const { error } = await supabase.from("accounts").delete().eq("id", id.parse(accountId));
    if (error) throw error;
    return undefined;
  });
}

// ─── categories ──────────────────────────────────────────────────────────────

const categorySchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Give it a name").max(30),
  kind: z.enum(["income", "expense"]),
  emoji: z.string().trim().min(1, "Pick an emoji").max(16),
  is_essential: z.boolean(),
});

export type CategoryInput = z.input<typeof categorySchema>;

export async function saveCategory(input: CategoryInput): Promise<ActionResult> {
  return run(async (supabase) => {
    const { id: categoryId, ...fields } = categorySchema.parse(input);
    const { error } = categoryId
      ? await supabase.from("categories").update(fields).eq("id", categoryId)
      : await supabase.from("categories").insert(fields);
    if (error) throw error;
    return undefined;
  });
}

export async function setCategoryArchived(categoryId: string, archived: boolean): Promise<ActionResult> {
  return run(async (supabase) => {
    const { error } = await supabase.from("categories").update({ archived }).eq("id", id.parse(categoryId));
    if (error) throw error;
    return undefined;
  });
}
