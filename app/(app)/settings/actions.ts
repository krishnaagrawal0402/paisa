"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Name can't be empty").max(40),
  month_start_day: z.coerce.number().int().min(1).max(28),
  savings_target_pct: z.coerce.number().int().min(0).max(90),
});

export type ProfileState = { ok?: boolean; error?: string };

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Permanently removes the signed-in user and everything they own. */
export async function deleteMyAccount(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  if (!(await getCurrentUser())) redirect("/login");
  if (String(formData.get("confirm")).trim().toLowerCase() !== "delete") {
    return { error: "Type delete to confirm." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { error: error.message };
  // The login no longer exists; this just clears the session cookies.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  redirect("/login");
}
