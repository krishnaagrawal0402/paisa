#!/usr/bin/env node
/**
 * CI smoke test against a freshly migrated database (run after db-deploy.mjs
 * with ALLOWED_EMAILS=ci@example.com). Everything runs in a rolled-back transaction.
 */
import postgres from "postgres";

const sql = postgres(process.env.SUPABASE_DB_URL, { max: 1, onnotice: () => {} });
const ROLLBACK = Symbol("rollback");
let failures = 0;

function check(name, ok) {
  console.log(`${ok ? "✓" : "✗"} ${name}`);
  if (!ok) failures++;
}

try {
  await sql.begin(async (tx) => {
    const [user] = await tx`
      insert into auth.users (id, email, raw_user_meta_data)
      values (gen_random_uuid(), 'CI@example.com', '{"full_name":"CI Bot"}')
      returning id`;
    const [profile] = await tx`select display_name from public.profiles where id = ${user.id}`;
    check("allowlisted email can sign up (case-insensitive)", Boolean(user));
    check("profile row is created on sign-up", profile?.display_name === "CI Bot");

    await tx`savepoint stranger`;
    const blocked = await tx`insert into auth.users (id, email) values (gen_random_uuid(), 'stranger@example.com')`
      .then(() => false)
      .catch((e) => e.message.includes("Sign-ups are restricted"));
    await tx`rollback to savepoint stranger`;
    check("email outside the allowlist is rejected by the database", blocked);

    throw ROLLBACK;
  });
} catch (error) {
  if (error !== ROLLBACK) throw error;
} finally {
  await sql.end();
}

process.exit(failures ? 1 : 0);
