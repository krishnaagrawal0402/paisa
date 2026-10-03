import "server-only";
import { revalidatePath } from "next/cache";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/** Shared plumbing for Server Actions: auth check, friendly errors, revalidation. */

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export async function run<T>(
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
  if (e.code === "23503") return "It's still used by transactions or recurring rules. Archive it instead.";
  return e.message ?? "Something went wrong. Please try again.";
}
