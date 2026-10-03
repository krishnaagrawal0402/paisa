# Paisa — Phase 1 Plan (Money Management)

> Working name: **Paisa**. Open source, personal finance, INR-first, mobile + web.
> Phase 1 = personal money management. Phase 2 = Splitwise-style shared expenses.

## 1. Product in one line

Open the app → in 2 seconds know **how much came in, how much went out, how much you're
building, and whether you're doing well** — and log a new expense in 3 seconds.

## 2. Decisions locked

| Area        | Decision                                                                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage     | Supabase (Postgres + Auth + RLS), cloud sync across devices                                                                                                                                   |
| Currency    | INR only, lakh/crore formatting (`₹1,50,000`, compact `₹1.5L`, `₹2.1Cr`)                                                                                                                      |
| Data entry  | Quick-add sheet, natural-language add, recurring auto-entries, bank CSV/XLSX import                                                                                                           |
| Investments | Contributions + current value; **mutual funds auto-priced daily** via mfapi.in; others manual/computed                                                                                        |
| Model       | Accounts + categories (transfers never count as spending)                                                                                                                                     |
| Extras      | Goals + emergency fund, category budgets, loans/EMIs + net worth, monthly report card + health score                                                                                          |
| Vibe        | Dark neon glass                                                                                                                                                                               |
| Stack       | Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui + Motion, Supabase, Vercel, installable PWA                                                                                    |
| Audience    | **Personal deployment first** (sign-ups locked to an email allowlist). Built **self-host-ready** so anyone can fork and deploy their own copy in one click. No public hosted service for now. |
| Tooling     | **npm** (ships with Node, so nothing extra to install); Supabase CLI as a dev dependency via `npx` (no global install, Docker optional)                                                       |

## 3. Information architecture

Mobile: bottom tab bar with a center floating **+** button. Desktop: left sidebar, same pages in a wider grid.

```
 Pulse      Activity      ( + )      Wealth      Plan
 (home)     (txns)      quick-add   (net worth)  (budgets/goals/recurring)
                                                  avatar → Settings
```

| Page                         | What it shows                                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pulse** (home)             | Net worth + sparkline · this month In / Out / Invested / Saved · savings rate · **Safe-to-spend per day** · health score ring · top 3 budgets near limit · upcoming 7 days (rent, SIP, EMI) · "confirm salary" cards |
| **Activity**                 | Infinite list grouped by day, search, filters (account, category, type, date range), swipe to edit/delete, bulk recategorize                                                                                         |
| **Wealth**                   | Net worth trend (monthly snapshots) · assets vs liabilities breakdown · holdings (invested vs current, gain %, XIRR) · loans with outstanding + payoff date · accounts with balances                                 |
| **Plan**                     | Budgets per category · goals with progress rings + ETA · emergency fund · recurring rules                                                                                                                            |
| **Report** `/report/2026-10` | Monthly report card + swipeable "Wrapped" story, shareable image                                                                                                                                                     |
| **Settings**                 | Accounts, categories, payday, import, export all data, delete account, privacy                                                                                                                                       |

### The "clear picture" metrics

- **Financial month follows payday.** If salary lands on the 28th, "October" = 28 Sep → 27 Oct. Configurable (default: 1st).
- **Saved** = income − expenses. **Savings rate** = saved / income.
- **Invested** = money moved into holdings this month (a subset of saved, not an expense).
- **Safe-to-spend today** = (income − upcoming fixed commitments − spent so far − savings target) / days left in month.
- **Net worth** = account balances + holdings current value − credit card dues − loan outstanding.
- **Health score (0–100)**, with a "how is this calculated?" explainer in the app:

  | Pillar                    | Weight | Full marks at                    |
  | ------------------------- | ------ | -------------------------------- |
  | Savings rate              | 30     | ≥ 30%                            |
  | Emergency fund cover      | 25     | ≥ 6 months of essential expenses |
  | Investment rate           | 20     | ≥ 20% of income invested         |
  | Debt load (EMIs / income) | 15     | ≤ 10%, zero at ≥ 50%             |
  | Budget adherence          | 10     | all budgets within limit         |

  Grade bands: A ≥ 85, B ≥ 70, C ≥ 55, D below 55. Pillars with no data are excluded and the weights re-normalised.

## 4. Data model (Supabase / Postgres)

All money is stored as **`bigint` paise**, never floats. Every table has `user_id uuid references auth.users` and an RLS policy of `user_id = auth.uid()`.

```
profiles            id(=auth uid), display_name, month_start_day (1–28), savings_target_pct,
                    emergency_months_target (default 6), created_at

accounts            id, user_id, name, type[bank|cash|wallet|credit_card],
                    opening_balance, opening_date, color, icon, archived, sort

categories          id, user_id, name, kind[income|expense], emoji, color,
                    is_essential (used for emergency fund math), archived
                    → seeded on signup: Salary, Freelance, Interest, Refund | Rent, Food,
                      Groceries, Transport, Shopping, Bills & Utilities, Subscriptions,
                      Health, Entertainment, Travel, Education, Family, Gifts, Fees, Other

transactions        id, user_id, type[income|expense|transfer|invest|redeem],
                    amount (paise, > 0), date, note, tags text[],
                    account_id            -- source (or destination for income)
                    to_account_id         -- transfer target
                    holding_id, units     -- invest/redeem
                    category_id           -- income/expense only
                    loan_id               -- EMI payments
                    source[manual|nl|recurring|import], recurring_id, occurrence_date,
                    import_batch_id, import_hash, created_at
                    UNIQUE (recurring_id, occurrence_date)   -- idempotent cron

holdings            id, user_id, name, asset_class[mutual_fund|stock|fd|rd|ppf|epf|nps|gold|crypto|other],
                    scheme_code (MF), units numeric,
                    manual_value, manual_value_at,          -- for manual classes
                    fd_principal, fd_rate, fd_start, fd_maturity, fd_compounding,  -- computed value
                    archived

mf_navs             scheme_code, date, nav numeric   PK(scheme_code, date)   -- shared cache, no user_id

loans               id, user_id, name, lender, principal, annual_rate, tenure_months,
                    start_date, emi_amount, outstanding_override, override_at

recurring_rules     id, user_id, template (type, amount, account_id, to_account_id,
                    category_id, holding_id, loan_id, note),
                    frequency[monthly|weekly|yearly], interval, day_of_month,
                    start_date, end_date, next_run_date,
                    mode[auto|confirm]      -- confirm = "salary arrived? confirm amount" card
                    active

budgets             id, user_id, category_id, monthly_limit   UNIQUE(user_id, category_id)

goals               id, user_id, name, emoji, target_amount, target_date,
                    kind[custom|emergency_fund], achieved_at
goal_sources        goal_id, account_id | holding_id    -- progress = live value of linked sources

net_worth_snapshots user_id, month, assets, liabilities, breakdown jsonb   PK(user_id, month)

category_rules      id, user_id, pattern, category_id, account_id?, created_from[user|default]
import_profiles     id, user_id, account_id, name, column_map jsonb, date_format, sign_convention
import_batches      id, user_id, account_id, filename, row_count, created_at
```

**Balances** are calculated, never stored: `opening_balance + Σ(in) − Σ(out)` via a Postgres view (`account_balances`). The same goes for holding invested amounts (`Σ invest − Σ redeem`).

**Why no transaction history at signup?** Onboarding asks for _current_ balances (as opening balances). The dashboard is useful on day 1, and the CSV import can backfill history if wanted.

## 5. Feature specs

### 5.1 Quick-add (the 3-second path)

- The FAB morphs into a bottom sheet with a big numeric keypad, so the amount comes first.
- Category chips are sorted by your most-used; the last-used account is preselected.
- Toggle: Expense / Income / Transfer / Invest.
- Optimistic save, haptic tick, and a toast with **Undo**.
- PWA manifest shortcut: long-press the app icon → "Add expense" opens the sheet directly.

### 5.2 Natural-language add

Rule-based parser in TypeScript: free, instant, no API key, fully unit-tested.

```
"450 swiggy dinner"            → expense ₹450 · Food · note "swiggy dinner" · today
"got salary 1.2L"              → income ₹1,20,000 · Salary
"12k rent yesterday hdfc"      → expense ₹12,000 · Rent · HDFC · yesterday
"sip 5000 parag parikh"        → invest ₹5,000 → holding "Parag Parikh Flexi Cap"
"moved 20k hdfc to zerodha"    → transfer ₹20,000 HDFC → Zerodha
"uber 230 on 3rd"              → expense ₹230 · Transport · 3 Oct
```

- Amount grammar: `450`, `₹2,500`, `12k`, `1.2L`, `1.2 lakh`, `2cr`.
- Dates via `chrono-node` (today, yesterday, "on 3rd", "last friday").
- Account matched by name or alias. Category matched via `category_rules` and a built-in merchant dictionary (swiggy/zomato → Food, uber/ola/rapido → Transport, amazon/flipkart → Shopping, netflix/spotify → Subscriptions, …).
- Always shows parsed chips for a one-tap confirm or edit. It never saves blindly.
- Later (not Phase 1): optional bring-your-own-key LLM fallback for messy input.

### 5.3 Recurring

- Rules for salary, rent, SIPs, EMIs, subscriptions, insurance (yearly).
- `mode: auto` posts silently. `mode: confirm` (default for salary) shows a "Salary arrived? ₹1,20,000 ✓ / edit" card.
- **Daily Vercel Cron** (`/api/cron/daily`, protected by `CRON_SECRET`) posts due occurrences. A catch-up on app open covers missed runs. The unique `(recurring_id, occurrence_date)` makes both safe to repeat.
- A Subscriptions view lists recurring expenses with their monthly total.

### 5.4 Bank statement import (CSV / XLSX)

1. Upload → `papaparse` for CSV, SheetJS for XLS/XLSX (installed from the SheetJS CDN tarball, not the stale npm package).
2. Column mapping: date, description, debit/credit or signed amount, optional balance, with date format auto-detected. The mapping is saved as an **import profile** per account, so next time it's one tap.
3. **UPI narration cleanup:** `UPI/DR/4123.../SWIGGY/YESB/...` → merchant `Swiggy`.
4. Auto-categorise with rules. Possible duplicates (same account, amount, ±2 days, similar text, including manual entries) are flagged. Likely transfers (CC bill payment, self-transfer) are flagged.
5. Review table: bulk-set category, skip rows, then save. Correcting a category prompts "Always categorise _SWIGGY_ as Food?", which creates a rule.
6. Bank presets live as JSON under `lib/import/presets/` (HDFC, ICICI, SBI, Axis, Kotak …). Adding a bank is an easy open-source contribution.

### 5.5 Investments

- **Mutual funds:** search via `https://api.mfapi.in/mf/search?q=`, then pick a scheme (stores `scheme_code`). On an invest entry, units = amount / NAV on that date (historical NAV from `/mf/{code}`). Units stay editable for exact statement values.
- The daily cron refreshes the latest NAV (`/mf/{code}/latest`) for every scheme in use into `mf_navs`, falling back to AMFI `NAVAll.txt` if mfapi is down.
- **FD / RD:** computed value from principal, rate, compounding and start date, plus a maturity countdown.
- **PPF / EPF / NPS / stocks / gold / crypto:** manual "update value" with a stale indicator after 30 days.
- Per holding: invested, current, absolute gain, gain %, **XIRR** (from the cash flows, pure function). Allocation donut by asset class.

### 5.6 Loans, credit cards, net worth

- Loan outstanding is computed from the amortisation schedule (principal, rate, tenure, start), assuming EMIs are paid, with a manual override for prepayments. Shows interest paid so far, payoff date and remaining interest.
- An EMI recurring rule links to the loan; each payment is split into principal and interest in the loan view.
- A credit card is an account whose balance is a liability. Paying the bill is a transfer from bank to card, which is not double-counted as spending.
- **Net worth snapshots** are written by cron on the 1st of every month (and backfilled at signup from the opening balances) to draw the trend line.

### 5.7 Budgets & goals

- Monthly limit per expense category. Bars are neon → amber at 80% → hot pink past 100%. Shows a projected month-end spend at the current pace.
- Goals: target and date. Progress is the **live value of linked accounts/holdings**, so there's nothing extra to log. ETA is projected from the last 3 months' growth. Confetti fires on completion.
- Emergency fund goal: the target auto-suggests `emergency_months_target × average essential spend (last 3 months)`.

### 5.8 Monthly report card & "Wrapped"

- `/report/YYYY-MM`: health score + change vs last month, pillar breakdown, income/spend/invested/saved, top categories, biggest expense, no-spend days, budget wins.
- A story mode of 6–8 full-screen swipeable cards with animated counters. Shown automatically on the first open after the month closes.
- **Share as image** (`next/og` / `html-to-image`) with an "amounts hidden — percentages only" toggle by default.
- Rule-based insights, e.g. "Food is 38% above your 3-month average", "Subscriptions: ₹2,340/mo", "You've saved 30%+ for 3 months straight 🔥".

### 5.9 Privacy & trust (important for a finance OSS app)

- **Privacy blur:** tap the eye icon (or shake on mobile) to blur every amount.
- RLS on every table, with automated tests that user A can't read user B's data.
- No third-party analytics. Service-role key used only in the cron route. Strict CSP headers.
- **Export everything** (JSON + CSV per table) and **delete account** in Settings.

## 6. Design system — Dark Neon Glass

| Token       | Value                                                                                     | Use                      |
| ----------- | ----------------------------------------------------------------------------------------- | ------------------------ |
| `--bg`      | `#07070B` + slow-drifting aurora blobs (violet/cyan, 8% opacity)                          | page                     |
| `--glass`   | `rgb(255 255 255 / 0.05)`, `backdrop-blur-xl`, 1px `white/10` border, top inner highlight | cards, sheets            |
| `--income`  | neon green `#3DFF9A`                                                                      | income, positive deltas  |
| `--expense` | hot pink `#FF3D81`                                                                        | spend, over-budget       |
| `--invest`  | electric violet `#8B5CF6`                                                                 | investments              |
| `--save`    | cyan `#22D3EE`                                                                            | savings, goals           |
| `--warn`    | amber `#FFB020`                                                                           | 80% budget, stale values |
| Type        | Geist Sans for UI; big numbers use `tabular-nums` with a count-up animation               |                          |

- Charts: Recharts with gradient area fills and an SVG glow filter on lines.
- Motion: spring sheet transitions, number count-ups, progress-ring draw-ins, skeleton shimmer, confetti (`canvas-confetti`) on goals. Everything respects `prefers-reduced-motion`.
- Accessibility: colour is never the only signal (▲▼, +/−, labels). Contrast checked on glass. Tap targets ≥ 44px.
- Dark only in Phase 1, but every colour is a token so light mode is a later swap.
- Mobile: safe-area insets, bottom sheets instead of modals, pull-to-refresh on Pulse.

## 7. Tech & project structure

`npm`, Next.js 16 App Router, TypeScript strict, Tailwind v4, shadcn/ui, Motion, Recharts, Zod, react-hook-form, date-fns (IST), chrono-node, papaparse, SheetJS, Serwist (PWA service worker), Supabase JS + SSR helpers, Vitest, Playwright.

```
app/
  (auth)/login/                     Google + email magic link
  (app)/layout.tsx                  shell: sidebar (desktop) / tab bar + FAB (mobile)
  (app)/page.tsx                    Pulse
  (app)/activity/
  (app)/wealth/                     net worth, holdings, loans, accounts
  (app)/plan/                       budgets, goals, recurring
  (app)/report/[month]/
  (app)/settings/                   accounts, categories, import, export, profile
  (app)/onboarding/
  api/cron/daily/route.ts           recurring + NAV refresh + monthly snapshot
components/
  ui/                               shadcn primitives restyled as glass
  money/                            <Amount/>, <AmountInput/>, <Delta/>
  charts/  quick-add/  cards/
lib/
  money.ts                          paise ↔ rupees, formatINR, compact (1.2L / 2.1Cr)
  parse/amount.ts  parse/nl.ts
  import/csv.ts  import/upi.ts  import/dedupe.ts  import/presets/*.json
  finance/health-score.ts  safe-to-spend.ts  amortization.ts  xirr.ts  fd.ts  month.ts
  mf/mfapi.ts  mf/amfi.ts
  supabase/server.ts  client.ts  middleware.ts  types.ts (generated)
  actions/                          server actions (zod-validated)
supabase/
  migrations/*.sql                  tables, views, RLS, seed-categories trigger
  tests/rls.test.ts
```

Mutations go through **Server Actions** with Zod validation and `useOptimistic` for instant UI. Reads go through Server Components plus a few Postgres views (`account_balances`, `holding_positions`, `monthly_summary`).

All finance math lives in `lib/finance/` as **pure functions with Vitest tests**: health score, safe-to-spend, amortisation, XIRR, FD value, financial-month boundaries, NL parser, UPI cleanup, dedupe.

## 7b. Self-hosting by design

Goal: an engineer who finds the repo has **their own private instance running in about 5 minutes, without reading the code**. These rules apply from the first commit, not as launch polish.

**Rules for the codebase**

1. **Nothing personal in code.** No names, emails, banks or amounts. Personal data lives only in the database; personal config lives only in env vars.
2. **Every setting is an env var**, documented in `.env.example` and validated at startup with Zod (`lib/env.ts`). A missing or invalid value fails fast with a human-readable message ("NEXT_PUBLIC_SUPABASE_URL is missing — see docs/SELF_HOSTING.md#supabase").
3. **Migrations are the single source of truth.** Tables, views, RLS, seed triggers and functions are all in `supabase/migrations/`. No clicking around the Supabase dashboard, ever.
4. **Optional things degrade gracefully.** Google login is optional (magic link works alone). The cron secret is optional (the catch-up on app open still posts recurring entries). If the NAV API is unreachable, the last known value is shown with a "stale" badge.
5. **Branding lives in one file** (`config/app.ts`: name, tagline, accent tokens), so renaming "Paisa" is a one-line change.
6. **CI proves fresh setup works:** every PR applies all migrations to an empty Postgres, then runs unit + RLS tests.

**Access control (personal mode)**

- `ALLOWED_EMAILS=you@x.com,partner@y.com` is enforced in two places: Next.js middleware and a Postgres `before insert` trigger on `auth.users`. The database refuses strangers even if the UI is bypassed.
- Leave it empty to allow open sign-ups, a deliberate opt-in for anyone who later wants to run a public instance.

**Setup paths**

| Path                | For                       | Steps                                                                                                                                                                                                                       |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deploy button**   | "I just want my own copy" | README "Deploy to Vercel" button → creates a Supabase project via Vercel's Supabase integration (env vars injected automatically) → set `ALLOWED_EMAILS` → deploy. **Migrations apply automatically during the build.**     |
| **`npm run setup`** | Engineers running locally | Interactive script: checks Node version → asks for Supabase URL + keys (or `--local` to use Docker via `supabase start`) → writes `.env.local` → applies migrations → optionally loads **demo data** → prints the login URL |
| **Demo data**       | Contributors, screenshots | `npm run db:seed-demo` creates 6 months of realistic fake data (salary, rent, SIPs, a home loan, a goal) for a demo user                                                                                                    |

**Docs shipped in the repo:** `README.md` (screenshots plus a 3-step quickstart), `docs/SELF_HOSTING.md` (both paths, Google OAuth optional steps, cron, troubleshooting), `docs/ARCHITECTURE.md` (data model, money-in-paise rule, where the math lives), `CONTRIBUTING.md` (how to add a bank preset or merchant mapping).

## 8. Milestones (each one is deployable)

| #         | Milestone       | Done when                                                                                                                                                                                                                                                                                                                                                                                               |
| --------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0** ✅ | Foundation      | Repo + Next.js + Tailwind/shadcn + design tokens + glass components; `lib/env.ts` validation + `.env.example`; Supabase migrations wired up (auto-applied on build); auth (magic link, optional Google) with the `ALLOWED_EMAILS` lock; app shell with tab bar/sidebar; PWA manifest + icons; `npm run setup`; ESLint/Prettier/Vitest; GitHub Actions CI (fresh-DB migration check); deployed on Vercel |
| **M1** ✅ | Core ledger     | Accounts, seeded categories, transactions CRUD, transfers, quick-add sheet with undo, Activity list + search/filters, computed balances, `formatINR`, payday-based months                                                                                                                                                                                                                               |
| **M2** ✅ | Pulse dashboard | Month In/Out/Invested/Saved, savings rate, safe-to-spend, category donut, 6-month cash-flow chart, privacy blur                                                                                                                                                                                                                                                                                         |
| **M3** ✅ | Recurring       | Rules UI, daily cron, confirm cards, upcoming-7-days, subscriptions view                                                                                                                                                                                                                                                                                                                                |
| **M4**    | Smart entry     | NL parser + UI, CSV/XLSX import with mapping, UPI cleanup, dedupe, rules learning, 2–3 bank presets                                                                                                                                                                                                                                                                                                     |
| **M5**    | Wealth          | Holdings (MF auto-NAV, FD computed, manual others), invest/redeem, XIRR, loans + amortisation, credit cards, net worth + monthly snapshots                                                                                                                                                                                                                                                              |
| **M6**    | Plan            | Budgets with pace projection, goals with linked sources + ETA, emergency fund                                                                                                                                                                                                                                                                                                                           |
| **M7**    | Report card     | Health score, monthly report page, Wrapped story, share image, rule-based insights                                                                                                                                                                                                                                                                                                                      |
| **M8**    | Launch polish   | Onboarding (payday + salary → accounts + balances → import or skip), empty states, demo data seed, README with GIFs, final pass on SELF_HOSTING.md (tested on a fresh fork), export/delete, Lighthouse + a11y pass, LICENSE (MIT), CONTRIBUTING                                                                                                                                                         |

## 9. Phase 2 readiness (Splitwise)

Not built now, but Phase 1 avoids blocking it:

- Users are real auth users with `profiles`, so they can become friends and group members.
- Later, a split expense will create **your share** as a normal expense, plus a `receivable`/`payable` entry. The ledger types and account model can absorb this with new tables (`groups`, `splits`, `settlements`) rather than rewrites.
- RLS is already per-user. Shared rows will get membership-based policies.

## 10. Backlog / ideas (post Phase 1)

- CAMS/KFintech **CAS PDF import** to pull all MF holdings in one go.
- Offline write queue (add expenses with no network, sync later).
- Light theme.
- Bring-your-own-key LLM for NL fallback and a monthly "money coach" summary.
- Receipt photo attachment (Supabase Storage).
- Tax view (80C progress: ELSS + PPF + EPF + insurance).
- Stock price auto-fetch.

## 11. Defaults assumed (shout if you want different)

- Name **Paisa** (placeholder), licence **MIT**.
- Login: email magic link always on, Google optional. Sign-ups locked by `ALLOWED_EMAILS`.
- No public hosted instance for now. Revisit later; the open-signup switch and DPDP/privacy-policy work only matter then.
- Payday / month start configurable, default 1st.
- First bank presets: build for the banks you actually use. Tell me which.
