"use server";

import { z } from "zod";
import { appConfig } from "@/config/app";
import { run, type ActionResult } from "@/lib/actions/run";
import { addDays, todayIn } from "@/lib/month";
import { nextOccurrence } from "@/lib/recurring";

const id = z.uuid();
const date = z.iso.date("Pick a valid date");

const ruleSchema = z
  .object({
    id: id.optional(),
    name: z.string().trim().min(1, "Give it a name, like Rent or Netflix").max(40),
    type: z.enum(["income", "expense", "transfer", "invest"]),
    holding_id: id.nullish(),
    amount: z.number().int().positive("Enter an amount above zero").max(1e14),
    account_id: z.uuid("Pick an account"),
    to_account_id: id.nullish(),
    category_id: id.nullish(),
    frequency: z.enum(["weekly", "monthly", "yearly"]),
    anchor_date: date,
    end_date: date.nullish(),
    mode: z.enum(["auto", "confirm"]),
  })
  .transform((r) => ({
    ...r,
    to_account_id: r.type === "transfer" ? (r.to_account_id ?? null) : null,
    category_id: r.type === "transfer" || r.type === "invest" ? null : (r.category_id ?? null),
    holding_id: r.type === "invest" ? (r.holding_id ?? null) : null,
    end_date: r.end_date || null,
  }))
  .refine((r) => r.type !== "transfer" || (r.to_account_id && r.to_account_id !== r.account_id), {
    message: "Pick two different accounts for a transfer",
  })
  .refine((r) => r.type !== "invest" || r.holding_id, { message: "Pick the fund or investment" })
  .refine((r) => !r.end_date || r.end_date >= r.anchor_date, { message: "The end date is before the first date" });

export type RecurringInput = z.input<typeof ruleSchema>;

export async function saveRecurring(input: RecurringInput): Promise<ActionResult> {
  return run(async (supabase) => {
    const { id: ruleId, ...fields } = ruleSchema.parse(input);

    if (!ruleId) {
      // A past first date is allowed on purpose: the catch-up logs those occurrences.
      const { error } = await supabase.from("recurring_rules").insert({ ...fields, next_due: fields.anchor_date });
      if (error) throw error;
      return undefined;
    }

    const { data: existing, error: readError } = await supabase
      .from("recurring_rules")
      .select("frequency, anchor_date, next_due")
      .eq("id", ruleId)
      .single();
    if (readError) throw readError;

    // Only re-plan the schedule if it changed; never re-post or skip past dues.
    const scheduleChanged = existing.frequency !== fields.frequency || existing.anchor_date !== fields.anchor_date;
    const today = todayIn(appConfig.timeZone);
    const next_due = scheduleChanged
      ? nextOccurrence(fields.frequency, fields.anchor_date, addDays(today, -1))
      : existing.next_due;

    const { error } = await supabase
      .from("recurring_rules")
      .update({ ...fields, next_due, active: true })
      .eq("id", ruleId);
    if (error) throw error;
    return undefined;
  });
}

export async function setRecurringActive(ruleId: string, active: boolean): Promise<ActionResult> {
  return run(async (supabase) => {
    const update: { active: boolean; next_due?: string } = { active };
    if (active) {
      // Resuming after a pause: start from the next date on or after today, don't back-fill the gap.
      const { data, error } = await supabase
        .from("recurring_rules")
        .select("frequency, anchor_date")
        .eq("id", id.parse(ruleId))
        .single();
      if (error) throw error;
      update.next_due = nextOccurrence(data.frequency, data.anchor_date, addDays(todayIn(appConfig.timeZone), -1));
    }
    const { error } = await supabase.from("recurring_rules").update(update).eq("id", id.parse(ruleId));
    if (error) throw error;
    return undefined;
  });
}

export async function deleteRecurring(ruleId: string): Promise<ActionResult> {
  return run(async (supabase) => {
    // Already-posted transactions stay; they just lose the link to the rule.
    const { error } = await supabase.from("recurring_rules").delete().eq("id", id.parse(ruleId));
    if (error) throw error;
    return undefined;
  });
}

const confirmSchema = z.object({
  ruleId: id,
  amount: z.number().int().positive("Enter an amount above zero").max(1e14).optional(),
  occurredOn: date.optional(),
  skip: z.boolean().default(false),
});

/** Log (or skip) the pending occurrence of a "confirm" rule, like a salary. */
export async function confirmRecurring(input: z.input<typeof confirmSchema>): Promise<ActionResult> {
  return run(async (supabase) => {
    const { ruleId, amount, occurredOn, skip } = confirmSchema.parse(input);
    const { error } = await supabase.rpc("confirm_recurring", {
      p_rule: ruleId,
      p_amount: amount ?? null,
      p_occurred_on: occurredOn ?? null,
      p_skip: skip,
    });
    if (error) throw error;
    return undefined;
  });
}
