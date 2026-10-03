import { z } from "zod";
import { parseAllowedEmails } from "./allowlist";

/**
 * All configuration comes from env vars, documented in .env.example.
 * Values are validated lazily (at first use) so a misconfigured instance fails
 * with a readable message instead of an obscure crash deep inside a library.
 */

const DOCS = "docs/SELF_HOSTING.md";

function fail(scope: string, error: z.ZodError): never {
  const lines = error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid ${scope} environment configuration:\n${lines.join("\n")}\nSee .env.example and ${DOCS}.`);
}

// Public vars are inlined into the browser bundle at build time, so each one
// must be read as a literal `process.env.NEXT_PUBLIC_…` expression.
const publicSchema = z.object({
  supabaseUrl: z.url("NEXT_PUBLIC_SUPABASE_URL must be your Supabase project URL"),
  supabaseKey: z
    .string("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY) is missing")
    .min(1),
  googleAuth: z.boolean(),
});

let publicEnv: z.infer<typeof publicSchema> | undefined;

export function getPublicEnv() {
  if (publicEnv) return publicEnv;
  const parsed = publicSchema.safeParse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    googleAuth: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true",
  });
  if (!parsed.success) fail("public", parsed.error);
  publicEnv = parsed.data;
  return publicEnv;
}

const serverSchema = z.object({
  allowedEmails: z.array(z.email("ALLOWED_EMAILS contains an invalid email")),
  siteUrl: z.url("SITE_URL must be a full URL like https://paisa.example.com").optional(),
});

let serverEnv: z.infer<typeof serverSchema> | undefined;

export function getServerEnv() {
  if (typeof window !== "undefined") throw new Error("getServerEnv() called in the browser");
  if (serverEnv) return serverEnv;
  const parsed = serverSchema.safeParse({
    allowedEmails: parseAllowedEmails(process.env.ALLOWED_EMAILS),
    siteUrl: process.env.SITE_URL || undefined,
  });
  if (!parsed.success) fail("server", parsed.error);
  serverEnv = parsed.data;
  return serverEnv;
}

/** Called once at server start (instrumentation.ts) to fail fast. */
export function validateEnv() {
  getPublicEnv();
  const { allowedEmails } = getServerEnv();
  if (allowedEmails.length === 0) {
    console.warn("⚠ ALLOWED_EMAILS is empty: anyone who can reach this instance can sign up.");
  }
}
