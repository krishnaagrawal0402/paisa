"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isEmailAllowed } from "@/lib/allowlist";
import { getServerEnv } from "@/lib/env";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  { step: "email"; error?: string; email?: string } | { step: "code"; email: string; error?: string };

const emailSchema = z.email("That doesn't look like an email address");
const codeSchema = z.string().regex(/^\d{6}$/, "Enter the 6-digit code from the email");

/** One action drives the whole flow: email → code → signed in (or email + password → signed in). */
export async function login(prev: LoginState, formData: FormData): Promise<LoginState> {
  if (formData.get("intent") === "restart") return { step: "email" };
  if (formData.get("intent") === "password") return signInWithPassword(formData);
  return prev.step === "email" ? sendMagicLink(formData) : verifyCode(prev, formData);
}

/** For the installed phone app, where a sign-in link would open in the browser instead. */
async function signInWithPassword(formData: FormData): Promise<LoginState> {
  const raw = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { step: "email", email: raw, error: parsed.error.issues[0].message };
  const email = parsed.data;
  const password = String(formData.get("password") ?? "");
  if (!password) return { step: "email", email, error: "Enter your password." };

  if (!isEmailAllowed(email, getServerEnv().allowedEmails)) {
    return { step: "email", email, error: "This is a private instance. Ask its owner to add your email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      step: "email",
      email,
      error:
        error.code === "invalid_credentials"
          ? "Wrong email or password. No password yet? Sign in with the email link, then set one in Settings."
          : error.message,
    };
  }
  redirect("/");
}

async function sendMagicLink(formData: FormData): Promise<LoginState> {
  const raw = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const parsed = emailSchema.safeParse(raw);
  if (!parsed.success) return { step: "email", email: raw, error: parsed.error.issues[0].message };
  const email = parsed.data;

  if (!isEmailAllowed(email, getServerEnv().allowedEmails)) {
    return { step: "email", email, error: "This is a private instance. Ask its owner to add your email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await getSiteUrl()}/auth/callback` },
  });
  if (error) return { step: "email", email, error: error.message };
  return { step: "code", email };
}

async function verifyCode(prev: Extract<LoginState, { step: "code" }>, formData: FormData): Promise<LoginState> {
  const parsed = codeSchema.safeParse(String(formData.get("code") ?? "").replace(/\s/g, ""));
  if (!parsed.success) return { ...prev, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: prev.email, token: parsed.data, type: "email" });
  if (error) return { ...prev, error: "That code didn't work. It may have expired, so try sending a new one." };
  redirect("/");
}
