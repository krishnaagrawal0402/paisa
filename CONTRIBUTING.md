# Contributing to Paisa

Thanks for helping! Paisa aims to stay **simple to use and simple to self-host**, so small, focused changes are the easiest to merge.

## Getting set up

```bash
npm install
npm run setup                               # your own Supabase project (or `-- --local` for Docker)
npm run dev
npm run db:seed-demo -- you@example.com     # optional: six months of sample data to work with
```

Before opening a PR, run what CI runs:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

CI also applies every migration to a fresh database and runs `scripts/ci-db-check.mjs` against it (allowlist, row-level security, recurring entries, imports, delete-account).

## Easy first contributions

### Add your bank's statement format

Statement import guesses columns from their headers. If your bank's export isn't recognised, add its column names to `COLUMN_NAMES` in [`lib/import/statement.ts`](lib/import/statement.ts). Earlier names win, and exact matches beat partial ones. Then add a test in `lib/import/statement.test.ts` with a few made-up rows in your bank's layout (**never paste real statement data**).

Narration cleanup (turning `UPI/DR/4071234/SWIGGY/YESB/...` into `Swiggy`) lives in [`lib/import/clean.ts`](lib/import/clean.ts), with tests in `clean.test.ts`.

### Share a statement layout safely

Need Paisa to read a PDF it doesn't understand yet (a CAS, a bank or card statement)? Run `npm run cas:layout -- path/to/file.pdf` on your own machine. It asks for the PDF password without showing or storing it, then writes a `.layout.txt` next to the PDF: every piece of text with its position, all digits turned into 9s, and PAN numbers, email addresses and any words you list (names, address) hidden. Check the file, then attach it to an issue. **Never attach the PDF itself.**

### Add a merchant

[`lib/parse/merchants.ts`](lib/parse/merchants.ts) maps keywords to default categories (`zepto` → Groceries). Add the lower-case name to the right line. Two-word names also go in `MULTI_WORD`. This drives both quick-add (`450 zepto`) and statement import.

## How the code is laid out

```
app/(app)/        Signed-in pages: Pulse (page.tsx), activity, wealth, plan, report, import, settings
app/welcome/      First-run onboarding
app/api/          Export download, share-image rendering
components/       UI, grouped by feature; components/ui holds the shared primitives
lib/data.ts       Read helpers for Server Components (run as the user, under RLS)
lib/actions/      Server Actions, all wrapped in run() for auth, friendly errors and revalidation
lib/finance/      Pure maths (safe-to-spend, XIRR, FD interest, EMIs, health score), unit-tested
lib/parse/        Amount and natural-language parsing for quick add
lib/import/       Statement reading, column guessing, narration cleanup
supabase/         Migrations (the only way the schema changes), config, email template
scripts/          setup, db-deploy (runs on every production build), CI check, demo seed
config/app.ts     App name, time zone and other instance-wide settings
```

## House rules

- **Money is always integer paise** (`bigint` in Postgres, `number` in TypeScript). Format with `formatINR` / `formatCompactINR`; use `formatRupees` for computed values where paise are noise.
- **The schema only changes through migrations** in `supabase/migrations/` (`npm run db:new <name>`). Never edit one that has shipped; add a new one.
- **Every table has row-level security.** New tables get `user_id uuid not null default auth.uid()`, an RLS policy on `user_id = auth.uid()`, and a `unique (id, user_id)`. Foreign keys to other user tables use the composite `(x_id, user_id)` so a row can never point at someone else's data.
- **Prefer `security invoker`.** `security definer` functions go in the `private` schema, or must check `auth.uid()` themselves, like `delete_my_account`.
- **Dates are plain `YYYY-MM-DD` strings** in the instance's time zone (`config/app.ts`). Financial months follow the user's payday (`lib/month.ts`).
- **Nothing personal in code:** no emails, keys or real transactions. Configuration comes from env vars, validated in `lib/env.ts`.
- **Keep it accessible:** real buttons and links (use `buttonClass()` to style a link like a button), labels on inputs, and text colours from the theme tokens (they meet WCAG AA contrast). Charts need a text alternative (`aria-label` plus `role="img"`, or a table view).
- **Mobile first.** Check every screen at phone width. Most people will use it as an installed app.

## Pull requests

- One change per PR, with a short note on what and why. Add a screenshot for UI changes.
- Add or update tests for anything in `lib/`.
- If you add an env var, update `.env.example`, `lib/env.ts` and `docs/SELF_HOSTING.md`.
