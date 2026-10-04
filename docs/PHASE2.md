# Phase 2: Split expenses (Splitwise-style)

> **Status: planned, not started.** Phase 1 (personal money management, M0–M8) is complete. This document is the brief for picking Phase 2 up later. It records what to build, the design decisions already leaning one way, and the open questions to settle first.

## 1. Goal in one line

Share costs with friends, flatmates and family (trips, rent, dinners) and always know **who owes whom**, without leaving Paisa and without double-counting anything in your personal numbers.

## 2. What Phase 2 must feel like

- **Adding a shared expense takes as long as a normal one.** Quick add gets a "Split" toggle, and natural language understands `dinner 2400 split with rahul priya`.
- **Friends don't need an account.** Most people won't sign up for a friend's self-hosted app, so you can split with a name ("Rahul") and track it yourself. If Rahul joins later, he claims that name and sees the same history.
- **Your personal numbers stay honest.** Paying ₹2,400 for a dinner for four counts as **₹600 of spending** plus **₹1,800 owed to you**, not ₹2,400 spent. Net worth includes what friends owe you, minus what you owe them.
- **Settling up is one tap**, and Paisa suggests the fewest payments needed to clear a group ("Priya pays Rahul ₹1,150, and that's everyone").

## 3. Scope

### In scope

| Feature                  | Details                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Groups**               | Name, emoji, members. A "Non-group" bucket for one-off splits with a single person, like Splitwise's friend view.   |
| **Members**              | Either a real Paisa user, or a **placeholder** (name only) that a user can claim later.                             |
| **Shared expenses**      | Amount, date, note, category, who paid, and how it's split.                                                         |
| **Split modes**          | Equally (all members or some), exact amounts, percentages, shares (2:1:1). All stored as resolved paise per person. |
| **Balances**             | Per group and overall: "You're owed ₹3,450", "You owe Rahul ₹600".                                                  |
| **Settle up**            | Record a payment between two members, fully or partly, optionally linked to a real transfer in your ledger.         |
| **Simplify debts**       | Suggest the minimum set of payments that clears a group.                                                            |
| **Personal ledger sync** | Your share is your spending; what others owe you (or you owe them) shows in net worth. See §5.                      |
| **Activity**             | Group feed: who added, edited or settled what, and when.                                                            |
| **Recurring splits**     | Rent or the Wi-Fi bill split every month, using the existing recurring engine.                                      |
| **Export and delete**    | The JSON export includes groups. Deleting your account must not destroy other members' history (§7).                |

### Out of scope (for now)

- Multiple currencies. INR only, like the rest of the app.
- Several payers on one expense (one payer per expense in v1; split a bill into two expenses as a workaround).
- Sending money from Paisa. Settling up only **records** a payment; a UPI deep link (`upi://pay?...`) is a possible later nicety.
- Receipt photos (already in the Phase 1 backlog).
- Push or email notifications. SMTP is optional for self-hosters, so everything must work without them.

## 4. Data model (draft)

All amounts in **paise**. Every table gets RLS. Shared tables use **membership-based** policies through a helper, rather than `user_id = auth.uid()`.

```text
groups            id, name, emoji, created_by (user), created_at, archived
group_members     id, group_id, user_id (null for a placeholder), display_name,
                  invite_email (optional), joined_at, left_at
                  unique (group_id, user_id)
split_expenses    id, group_id, paid_by (member), amount, occurred_on, note,
                  category_name (text: categories are per user), split_mode,
                  recurring_rule_id (optional), created_by (user), created_at, updated_at
split_shares      expense_id, member_id, amount        primary key (expense_id, member_id)
split_settlements id, group_id, from_member, to_member, amount, occurred_on, note,
                  created_by (user), created_at
split_activity    id, group_id, actor (user), kind, payload jsonb, created_at
```

Rules the database enforces:

- **Shares add up.** The sum of `split_shares.amount` equals `split_expenses.amount` (a deferred constraint trigger, so an expense and its shares can be written in one transaction).
- **Members belong to the expense's group.** Use composite foreign keys, the same trick as Phase 1's `(id, user_id)` keys.
- **Who can see what.** `private.is_group_member(group_id)` is a `security definer` function in the `private` schema, used by every policy. Members can read everything in their groups. Any member can add expenses and settlements. Edits and deletes are allowed for the creator or the payer, and are logged in `split_activity`.
- **Balances come from views, not stored totals.** `group_balances` (per member: paid − owed + settled) is a `security_invoker` view, like `account_balances`.

**Rounding.** An equal split of ₹100 across 3 gives 33.34 + 33.33 + 33.33. Leftover paise go to members in a fixed order (the payer first, then by `member_id`), so recalculating always gives the same answer. This is a pure function in `lib/finance/splits.ts` with tests.

**Simplify debts.** Greedy matching of the largest creditor against the largest debtor. It gives at most n − 1 payments and is easy to explain. Also a pure function, tested against hand-worked cases.

## 5. How splits reach your personal ledger

This is the main design decision.

**Leaning: a "Friends" account per user.** Add `split` to the account types and give every user one system-managed account called **Friends** (or "Splits"). Its balance is what friends owe you, positive, or what you owe them, negative. It then flows into net worth, Wealth and the health score through the code that already exists.

| What happens                       | Your ledger entries                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| You pay ₹2,400, your share is ₹600 | Expense ₹600 from your bank (category Food), transfer ₹1,800 from bank → Friends |
| Rahul pays ₹2,400, your share ₹600 | Expense ₹600 from Friends (Friends goes −₹600: you owe)                          |
| Rahul pays you back ₹1,800         | Transfer ₹1,800 from Friends → bank                                              |
| You pay Rahul ₹600                 | Transfer ₹600 from bank → Friends                                                |

Why this approach: spending, savings rate, budgets and the report card all keep working unchanged, because only your share is an expense. Nothing new is needed in `totalsOf`, `daily_totals` or `category_spend`.

**Keeping each person's ledger in sync (open: §8.2).** Paisa never writes into another user's ledger directly. Instead, a function like `sync_my_splits()` creates or updates the **caller's own** ledger rows from the shared tables. It runs when the app opens, the same pattern as `post_due_recurring`. It's idempotent, using a unique `transactions.split_share_id` (and `split_settlement_id`). If someone edits a shared expense, everyone's rows update on their next visit.

## 6. Screens

- **Navigation.** Add a **Split** destination. The mobile tab bar is full (Pulse, Activity, +, Wealth, Plan), so the most likely option is to move Plan into Wealth or Pulse. Decide before building (§8.4).
- **Split home.** Overall "you're owed / you owe" hero, a list of groups with your balance in each, people you owe or who owe you, and a "Settle up" button.
- **Group page.** Balances per member, the suggested settle-up payments, the expense feed (grouped by day, like Activity), and member management.
- **Quick add.** A "Split" toggle that reveals the group or people, the payer, and the split mode (Equal / Exact / % / Shares) with live per-person amounts and a "₹X left to assign" check.
- **Settle up sheet.** Pick the person, prefill the amount, choose which of your accounts it went through, done (with confetti if a group reaches zero).
- **Join page** `/join/<token>`. Shows the group name, which placeholder you're claiming, and an accept button.

## 7. Self-hosting and privacy implications

- **Friends must be able to sign in.** Today the allowlist comes from `ALLOWED_EMAILS` and only changes with a redeploy. That's fine for a household, but awkward for "add my flatmate". Proposal: inviting someone by email adds them to `private.allowed_emails` with `source = 'invite'`, and `db-deploy.mjs` only syncs rows where `source = 'env'`. Only existing users can invite, so the instance stays private.
- **Placeholders need nothing at all.** Splitting with people who never sign up must work fully, so the feature is useful even on a one-person instance.
- **Deleting an account** (`delete_my_account`) must not remove shared history other members rely on. It should turn the leaving user's memberships into placeholders (keeping their name) and delete only their personal rows. Add a CI check for this.
- **Export** includes the groups you belong to (all members' shared rows, but nobody's personal ledger).
- **Hide amounts** (privacy mode) covers every split screen.

## 8. Open questions (settle before S1)

1. **Ledger model.** Confirm the "Friends" account approach in §5, or track balances only inside the split tables and show them in Wealth separately.
2. **Sync strategy.** Lazy `sync_my_splits()` on app open (leaning), or a `security definer` trigger that writes every member's ledger at once.
3. **Who can edit.** Anyone in the group, or only the creator and payer? Splitwise lets anyone edit, with an activity log.
4. **Navigation.** Where Split lives in the tab bar, and what moves.
5. **Categories.** Shared expenses store a category name. Map it to each member's own category by name, falling back to "Other"?
6. **Joining.** Is a link-based invite (`/join/<token>`) enough without email? It can be shared on WhatsApp, and email stays optional.

## 9. Milestones (each one is deployable)

| #      | Name                 | Scope                                                                                                                                                         |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S1** | Groups and expenses  | Tables, RLS helper, groups with placeholder members, add/edit/delete shared expenses (all four split modes), group balances. `lib/finance/splits.ts` + tests. |
| **S2** | Settle up            | Settlements, simplify debts, Split home with overall balances, activity feed.                                                                                 |
| **S3** | Personal ledger sync | The Friends account, `sync_my_splits()`, net worth and health-score integration, quick-add "Split" toggle, natural-language "split with".                     |
| **S4** | Real friends         | Invite links, claim a placeholder, invite-based allowlist, membership RLS tested with two real users, delete-account handover.                                |
| **S5** | Polish               | Recurring splits (rent, Wi-Fi), export, report-card line ("₹4.2K of your spending was shared"), empty states, demo data for groups, docs and screenshots.     |

**Checks to add to CI** (`scripts/ci-db-check.mjs`):

- shares must add up
- a non-member can't read or write a group
- deleting an account keeps other members' history
- `sync_my_splits()` is idempotent
- the balances view matches a hand-computed example

## 10. Where things will live

```text
supabase/migrations/2026xxxx_splits.sql   tables, RLS helper, views, sync function
lib/finance/splits.ts (+ .test.ts)        split modes, rounding, balances, simplify debts
lib/splits.ts                             read helpers (like lib/data.ts)
lib/actions/splits.ts                     server actions through run()
app/(app)/split/                          Split home, group pages
app/join/[token]/                         invite acceptance
components/split/                         sheets, lists, balance cards
```

The house rules from [CONTRIBUTING.md](../CONTRIBUTING.md) and [PLAN.md §7b](PLAN.md#7b-self-hosting-by-design) apply unchanged: paise only, migrations only, RLS on everything, nothing personal in code.
