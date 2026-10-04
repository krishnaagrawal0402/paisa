"use server";

import { z } from "zod";
import { run, type ActionResult } from "@/lib/actions/run";
import type { Existing, Mapping } from "@/lib/import/statement";

const id = z.uuid();
const date = z.iso.date();

/** What the importer needs before review: entries already in that date range, and the saved column mapping. */
export async function getImportContext(input: {
  accountId: string;
  from: string;
  to: string;
}): Promise<ActionResult<{ existing: Existing[]; mapping: Mapping | null }>> {
  return run(async (supabase) => {
    const accountId = id.parse(input.accountId);
    const [from, to] = [date.parse(input.from), date.parse(input.to)];
    const existing: Existing[] = [];
    // Page through: the API returns at most 1,000 rows per request.
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("transactions")
        .select("occurred_on, type, amount, import_hash")
        .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
        .gte("occurred_on", from)
        .lte("occurred_on", to)
        .order("occurred_on")
        .range(offset, offset + 999);
      if (error) throw error;
      existing.push(...(data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })));
      if (!data || data.length < 1000) break;
    }
    const { data: profile } = await supabase
      .from("import_profiles")
      .select("mapping")
      .eq("account_id", accountId)
      .maybeSingle();
    return { existing, mapping: (profile?.mapping as Mapping | undefined) ?? null };
  });
}

const rowSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number().int().positive().max(1e14),
  occurred_on: date,
  account_id: id,
  to_account_id: id.nullable(),
  category_id: id.nullable(),
  note: z.string().max(200).nullable(),
  import_hash: z.string().min(1).max(64),
});

const importSchema = z.object({
  accountId: id,
  filename: z.string().trim().min(1).max(200),
  rows: z.array(rowSchema).min(1).max(5000),
  keepBalance: z.boolean(),
  mapping: z.record(z.string(), z.unknown()),
  rules: z.array(z.object({ pattern: z.string().trim().toLowerCase().min(2).max(60), category_id: id })).max(500),
});

export type ImportInput = z.input<typeof importSchema>;

export async function importStatement(
  input: ImportInput,
): Promise<ActionResult<{ batchId: string | null; inserted: number }>> {
  return run(async (supabase) => {
    const { accountId, filename, rows, keepBalance, mapping, rules } = importSchema.parse(input);
    const { data, error } = await supabase.rpc("import_statement", {
      p_account: accountId,
      p_filename: filename,
      p_rows: rows,
      p_keep_balance: keepBalance,
    });
    if (error) throw error;
    const result = data as { batch_id: string | null; inserted: number };

    // Nice-to-haves after the import itself succeeded: remember the layout and the learned categories.
    await supabase
      .from("import_profiles")
      .upsert({ account_id: accountId, mapping, updated_at: new Date().toISOString() });
    if (rules.length) await supabase.from("category_rules").upsert(rules, { onConflict: "user_id,pattern" });

    return { batchId: result.batch_id, inserted: result.inserted };
  });
}

export async function undoImport(batchId: string): Promise<ActionResult<number>> {
  return run(async (supabase) => {
    const { data, error } = await supabase.rpc("undo_import", { p_batch: id.parse(batchId) });
    if (error) throw error;
    return data as number;
  });
}
