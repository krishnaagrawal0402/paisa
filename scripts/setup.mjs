#!/usr/bin/env node
/**
 * One-command setup: writes .env.local and prepares the database.
 *
 *   npm run setup            → use a hosted Supabase project (free tier is fine)
 *   npm run setup -- --local → run Supabase locally in Docker
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const ENV_FILE = ".env.local";
const local = process.argv.includes("--local");
const rl = createInterface({ input: process.stdin, output: process.stdout });

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

async function ask(question, { required = true, fallback } = {}) {
  for (;;) {
    const suffix = fallback ? dim(` (${fallback})`) : "";
    const answer = (await rl.question(`${question}${suffix}: `)).trim() || fallback || "";
    if (answer || !required) return answer;
    console.log("  This one is required.");
  }
}

function checkNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 20 || (major === 20 && minor < 9)) {
    console.error(`Node.js 20.9+ is required (you have ${process.versions.node}).`);
    process.exit(1);
  }
}

function readLocalSupabase() {
  if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0) {
    console.error("Docker isn't running. Start Docker Desktop, or run `npm run setup` to use a hosted project.");
    process.exit(1);
  }
  console.log("→ Starting local Supabase (first run downloads images, this can take a few minutes)…");
  execFileSync("npx", ["--no-install", "supabase", "start"], { stdio: "inherit" });
  const out = execFileSync("npx", ["--no-install", "supabase", "status", "-o", "env"], { encoding: "utf8" });
  const vars = Object.fromEntries(
    out
      .split("\n")
      .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v]),
  );
  return {
    url: vars.API_URL,
    publishableKey: vars.PUBLISHABLE_KEY || vars.ANON_KEY,
    dbUrl: vars.DB_URL,
    mailUrl: vars.INBUCKET_URL || vars.MAILPIT_URL,
  };
}

async function main() {
  checkNode();
  console.log(`\n${bold("Paisa setup")} ${dim(local ? "· local Supabase" : "· hosted Supabase")}\n`);

  if (
    existsSync(ENV_FILE) &&
    !/^y/i.test(await ask(`${ENV_FILE} already exists. Overwrite? (y/N)`, { required: false }))
  ) {
    console.log("Keeping your existing config. Run `npm run db:deploy` to just update the database.");
    process.exit(0);
  }

  let supabase;
  if (local) {
    supabase = readLocalSupabase();
  } else {
    console.log(
      dim("Create a free project at https://supabase.com/dashboard (pick the Mumbai region if you're in India).\n"),
    );
    supabase = {
      url: await ask("Project URL (Settings → API, e.g. https://abcd.supabase.co)"),
      publishableKey: await ask("Publishable key (Settings → API Keys, starts with sb_publishable_)"),
      dbUrl: await ask("Database URL (Connect → Session pooler; URL-encode special characters in the password)"),
    };
  }

  const allowedEmails = await ask("Your email(s) allowed to sign in, comma-separated (blank = anyone)", {
    required: false,
  });

  const env = [
    "# Written by `npm run setup`. See .env.example for what each value does.",
    `NEXT_PUBLIC_SUPABASE_URL=${supabase.url}`,
    `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${supabase.publishableKey}`,
    `SUPABASE_DB_URL=${supabase.dbUrl}`,
    `ALLOWED_EMAILS=${allowedEmails}`,
    "NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false",
    "",
  ].join("\n");
  writeFileSync(ENV_FILE, env, { mode: 0o600 });
  console.log(green(`✓ Wrote ${ENV_FILE}`));

  rl.close();
  execFileSync("node", ["scripts/db-deploy.mjs"], { stdio: "inherit" });

  console.log(`\n${green("✓ All set.")} Run ${bold("npm run dev")} and open http://localhost:3000\n`);
  if (local) {
    console.log(`Sign-in emails land in the local inbox: ${supabase.mailUrl ?? "see `npx supabase status`"}\n`);
  } else {
    console.log(
      `${bold("One-time auth settings")} in your Supabase dashboard (docs/SELF_HOSTING.md has screenshots-free steps):\n` +
        "  1. Authentication → URL Configuration → add http://localhost:3000/auth/callback to Redirect URLs\n" +
        "  2. Authentication → Emails → Magic Link → paste supabase/templates/magic_link.html\n",
    );
  }
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
