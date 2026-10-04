"use server";

import { z } from "zod";
import { run, type ActionResult } from "@/lib/actions/run";

const id = z.uuid();
const paise = z.number().int().positive("Enter an amount above zero").max(1e14);

// ─── budgets ─────────────────────────────────────────────────────────────────

const budgetSchema = z.object({ id: id.optional(), category_id: z.uuid("Pick a category"), monthly_limit: paise });

export async function saveBudget(input: z.input<typeof budgetSchema>): Promise<ActionResult> {
  return run(async (supabase) => {
    const { id: budgetId, ...fields } = budgetSchema.parse(input);
    const { error } = budgetId
      ? await supabase.from("budgets").update(fields).eq("id", budgetId)
      : await supabase.from("budgets").insert(fields);
    if (error) throw error.code === "23505" ? new Error("That category already has a budget.") : error;
    return undefined;
  });
}

export async function deleteBudget(budgetId: string): Promise<ActionResult> {
  return run(async (supabase) => {
    const { error } = await supabase.from("budgets").delete().eq("id", id.parse(budgetId));
    if (error) throw error;
    return undefined;
  });
}

// ─── goals ───────────────────────────────────────────────────────────────────

const goalSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Give it a name").max(40),
  emoji: z.string().trim().min(1).max(16),
  kind: z.enum(["custom", "emergency"]),
  target_amount: paise,
  target_date: z.iso.date().nullish(),
  manual_saved: z.number().int().min(0).max(1e14),
  sources: z
    .array(z.object({ account_id: id.nullish(), holding_id: id.nullish() }))
    .max(30)
    .refine((list) => list.every((s) => Boolean(s.account_id) !== Boolean(s.holding_id))),
});

export type GoalInput = z.input<typeof goalSchema>;

export async function saveGoal(input: GoalInput): Promise<ActionResult> {
  return run(async (supabase) => {
    const { id: goalId, sources, ...fields } = goalSchema.parse(input);
    const goal = { ...fields, target_date: fields.target_date || null };
    let savedId = goalId;
    if (goalId) {
      const { error } = await supabase.from("goals").update(goal).eq("id", goalId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from("goals").insert(goal).select("id").single();
      if (error) throw error.code === "23505" ? new Error("You already have an emergency fund goal.") : error;
      savedId = data.id;
    }
    // Replace the linked accounts/investments.
    const { error: delError } = await supabase.from("goal_sources").delete().eq("goal_id", savedId!);
    if (delError) throw delError;
    if (sources.length) {
      const { error: insError } = await supabase.from("goal_sources").insert(
        sources.map((s) => ({
          goal_id: savedId!,
          account_id: s.account_id ?? null,
          holding_id: s.holding_id ?? null,
        })),
      );
      if (insError) throw insError;
    }
    return undefined;
  });
}

export async function deleteGoal(goalId: string): Promise<ActionResult> {
  return run(async (supabase) => {
    const { error } = await supabase.from("goals").delete().eq("id", id.parse(goalId));
    if (error) throw error;
    return undefined;
  });
}

/** Remember the moment a goal was first reached (so the celebration happens once). */
export async function markGoalAchieved(goalId: string): Promise<ActionResult> {
  return run(async (supabase) => {
    const { error } = await supabase
      .from("goals")
      .update({ achieved_at: new Date().toISOString() })
      .eq("id", id.parse(goalId))
      .is("achieved_at", null);
    if (error) throw error;
    return undefined;
  });
}
