#!/usr/bin/env node
/**
 * Brings the database up to date:
 *   1. applies supabase/migrations (via the Supabase CLI, tracked in supabase_migrations)
 *   2. syncs ALLOWED_EMAILS into private.allowed_emails (the database-level sign-up lock)
 *
 * Runs automatically on Vercel (the `vercel-build` script) and from `npm run setup`.
 * Run it by hand with `npm run db:deploy`.
 */
import { spawnSync } from "node:child_process";
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
// spawnSync, not execFileSync: on failure execFileSync's error message repeats the
// full command line, which would print the database password into (CI) logs.
const push = spawnSync("npx", ["--no-install", "supabase", "db", "push", "--db-url", dbUrl, "--include-all", "--yes"], {
  stdio: "inherit",
});
if (push.status !== 0) {
  console.error(
    "✗ Migrations failed (see the message above). If it says the password failed, check SUPABASE_DB_URL:\n" +
      "  Session pooler string, password URL-encoded, no [brackets]. See docs/SELF_HOSTING.md.",
  );
  process.exit(1);
}

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
} catch (error) {
  // Print only the message: connection errors can carry connection details.
  console.error(`✗ Allowlist sync failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}

if (!process.exitCode) console.log("✓ Database is up to date.");
