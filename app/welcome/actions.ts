"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { appConfig } from "@/config/app";
import { run, type ActionResult } from "@/lib/actions/run";
import { nextDayOfMonth, todayIn } from "@/lib/month";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const onboardingSchema = z.object({
  display_name: z.string().trim().min(1, "Tell us what to call you").max(40),
  month_start_day: z.number().int().min(1).max(28),
  accounts: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Give every account a name").max(40),
        type: z.enum(["bank", "cash", "wallet", "credit_card"]),
        balance: z.number().int().min(-1e14).max(1e14),
      }),
    )
    .min(1, "Add at least one account")
    .max(12),
  // Salary lands in accounts[account] every payday, waiting for a one-tap confirm.
  salary: z.object({ amount: z.number().int().positive().max(1e14), account: z.number().int().min(0) }).nullable(),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;

export async function finishOnboarding(input: OnboardingInput): Promise<ActionResult> {
  return run(
    async (supabase) => {
      const data = onboardingSchema.parse(input);
      const user = await getCurrentUser();
      if (!user) throw new Error("You're signed out.");

      const { data: created, error: accountsError } = await supabase
        .from("accounts")
        .insert(
          data.accounts.map((a, i) => ({
            name: a.name,
            type: a.type,
            // Cards are entered as "amount owed" and stored as a negative balance.
            opening_balance: a.type === "credit_card" ? -Math.abs(a.balance) : a.balance,
            sort: i,
          })),
        )
        .select("id, sort");
      if (accountsError) throw accountsError;
      const idAt = new Map(created.map((a) => [a.sort as number, a.id as string]));

      if (data.salary) {
        const accountId = idAt.get(data.salary.account);
        if (!accountId || data.accounts[data.salary.account].type === "credit_card") {
          throw new Error("Pick the account your salary comes into.");
        }
        const { data: category } = await supabase
          .from("categories")
          .select("id")
          .eq("kind", "income")
          .eq("name", "Salary")
          .maybeSingle();
        const firstPayday = nextDayOfMonth(todayIn(appConfig.timeZone), data.month_start_day);
        const { error } = await supabase.from("recurring_rules").insert({
          name: "Salary",
          type: "income",
          amount: data.salary.amount,
          account_id: accountId,
          category_id: category?.id ?? null,
          frequency: "monthly",
          anchor_date: firstPayday,
          next_due: firstPayday,
          mode: "confirm",
        });
        if (error) throw error;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: data.display_name,
          month_start_day: data.month_start_day,
          onboarded_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (error) throw error;
      return undefined;
      // No revalidation: it would re-render /welcome, which redirects once onboarded, skipping the "all set" screen.
      // Every app page is dynamic, so the dashboard reads fresh data when it's opened.
    },
    { revalidate: false },
  );
}

/** "I'll set it up myself": go straight to the app. */
export async function skipOnboarding() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  await supabase.from("profiles").update({ onboarded_at: new Date().toISOString() }).eq("id", user.id);
  redirect("/");
}
