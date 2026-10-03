#!/usr/bin/env node
/**
 * Brings the database up to date:
 *   1. applies supabase/migrations (via the Supabase CLI, tracked in supabase_migrations)
 *   2. syncs ALLOWED_EMAILS into private.allowed_emails (the database-level sign-up lock)
 *
 * Runs automatically on Vercel (the `vercel-build` script) and from `npm run setup`.
 * Run it by hand with `npm run db:deploy`.
 */
import { execFileSync } from "node:child_process";
import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());

const dbUrl = process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL_NON_POOLING;
if (!dbUrl) {
  console.warn(
    "⚠ SUPABASE_DB_URL is not set: skipping migrations and allowlist sync.\n" +
      "  Set it to your Supabase *Session pooler* connection string (see docs/SELF_HOSTING.md).",
  );
  process.exit(process.env.VERCEL ? 1 : 0);
}

const allowedEmails = [
  ...new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(/[,\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  ),
];

console.log("→ Applying migrations…");
execFileSync("npx", ["--no-install", "supabase", "db", "push", "--db-url", dbUrl, "--include-all", "--yes"], {
  stdio: "inherit",
});

console.log(`→ Syncing sign-up allowlist (${allowedEmails.length || "open sign-ups"})…`);
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
const sql = postgres(dbUrl, { max: 1, ssl: isLocal ? false : "require", onnotice: () => {} });
try {
  await sql.begin(async (tx) => {
    await tx`delete from private.allowed_emails`;
    if (allowedEmails.length) {
      await tx`insert into private.allowed_emails ${tx(allowedEmails.map((email) => ({ email })))}`;
    }
  });
} finally {
  await sql.end();
}

console.log("✓ Database is up to date.");
