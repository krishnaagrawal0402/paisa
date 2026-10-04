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

    // ── ledger ──
    const [{ count: categoryCount }] = await tx`select count(*)::int from public.categories where user_id = ${user.id}`;
    check("default categories are seeded on sign-up", categoryCount > 20);

    const [bank] = await tx`
      insert into public.accounts (user_id, name, type, opening_balance) values (${user.id}, 'Bank', 'bank', 0) returning id`;
    const [cash] = await tx`
      insert into public.accounts (user_id, name, type, opening_balance) values (${user.id}, 'Cash', 'cash', 5000) returning id`;
    const [food] = await tx`select id from public.categories where user_id = ${user.id} and name = 'Food & Dining'`;
    await tx`
      insert into public.transactions (user_id, type, amount, occurred_on, account_id, to_account_id, category_id) values
        (${user.id}, 'income',   100000, current_date, ${bank.id}, null,       null),
        (${user.id}, 'expense',   30000, current_date, ${bank.id}, null,       ${food.id}),
        (${user.id}, 'transfer',  20000, current_date, ${bank.id}, ${cash.id}, null)`;
    const balances = Object.fromEntries(
      (
        await tx`select account_id, balance from public.account_balances where account_id in (${bank.id}, ${cash.id})`
      ).map((r) => [r.account_id, Number(r.balance)]),
    );
    check(
      "balances: opening + income − expense ± transfers",
      balances[bank.id] === 50000 && balances[cash.id] === 25000,
    );

    // ── recurring ──
    const [{ a, b, c }] = await tx`
      select private.next_occurrence('monthly', '2026-01-31', '2026-01-31') as a,
             private.next_occurrence('monthly', '2026-01-31', '2026-02-28') as b,
             private.next_occurrence('yearly', '2024-02-29', '2024-02-29') as c`;
    const iso = (d) => d.toISOString().slice(0, 10);
    check(
      "month-end rules clamp (31 Jan → 28 Feb) and return to the 31st",
      iso(a) === "2026-02-28" && iso(b) === "2026-03-31" && iso(c) === "2025-02-28",
    );

    const [rule] = await tx`
      insert into public.recurring_rules (user_id, name, type, amount, account_id, category_id, frequency, anchor_date, next_due)
      values (${user.id}, 'Rent', 'expense', 2500000, ${bank.id}, ${food.id}, 'monthly',
              current_date - 40, current_date - 40)
      returning id`;
    const [{ first }] = await tx`select private.post_recurring_for(${user.id}, current_date) as first`;
    const [{ second }] = await tx`select private.post_recurring_for(${user.id}, current_date) as second`;
    const [{ next_due, today }] = await tx`
      select next_due, current_date as today from public.recurring_rules where id = ${rule.id}`;
    check("recurring: catches up missed months once, then posts nothing more", first === 2 && second === 0);
    check("recurring: next_due moves past today", iso(next_due) > iso(today));

    // ── investments ──
    const [fund] = await tx`
      insert into public.holdings (user_id, name, asset_class, scheme_code) values (${user.id}, 'Index fund', 'mutual_fund', 120716)
      returning id`;
    const bankBefore = Number(
      (await tx`select balance from public.account_balances where account_id = ${bank.id}`)[0].balance,
    );
    await tx`
      insert into public.transactions (user_id, type, amount, occurred_on, account_id, holding_id)
      values (${user.id}, 'invest', 1000000, current_date, ${bank.id}, ${fund.id})`;
    const bankAfter = Number(
      (await tx`select balance from public.account_balances where account_id = ${bank.id}`)[0].balance,
    );
    check("investing moves money out of the account (not counted as spending)", bankBefore - bankAfter === 1000000);
    const [{ blockedCategory }] = await tx`
      select exists (
        select 1 from pg_constraint where conname = 'transactions_holding_check'
      ) as "blockedCategory"`;
    check("invest/redeem rows must name a holding and can't carry a category", blockedCategory);
    const history = await tx`
      select on_date, balance from public.account_balances_at(array[current_date - 1, current_date]::date[])
      where account_id = ${bank.id} order by on_date`;
    // Today's entries on Bank: +1,000 income, −300 expense, −200 transfer out, −10,000 invest (paise below).
    check(
      "account_balances_at: today matches the live balance, yesterday excludes today's entries",
      Number(history[1].balance) === bankAfter &&
        Number(history[0].balance) - Number(history[1].balance) === -100000 + 30000 + 20000 + 1000000,
    );

    // A second user, to prove one user can't touch another's data.
    await tx`delete from private.allowed_emails`;
    const [other] =
      await tx`insert into auth.users (id, email) values (gen_random_uuid(), 'other@example.com') returning id`;
    const [otherAccount] = await tx`
      insert into public.accounts (user_id, name, type) values (${other.id}, 'Theirs', 'bank') returning id`;

    await tx`savepoint cross_user`;
    const crossBlocked = await tx`
      insert into public.transactions (user_id, type, amount, occurred_on, account_id)
      values (${user.id}, 'expense', 100, current_date, ${otherAccount.id})`
      .then(() => false)
      .catch((e) => e.code === "23503");
    await tx`rollback to savepoint cross_user`;
    check("a transaction can't reference another user's account", crossBlocked);

    await tx`
      insert into public.transactions (user_id, type, amount, occurred_on, account_id)
      values (${other.id}, 'expense', 99900, current_date, ${otherAccount.id})`;

    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user.id, role: "authenticated" })}, true)`;
    const visible = await tx`select id from public.accounts`;
    const visibleBalances = await tx`select account_id from public.account_balances`;
    const spendByCategory = await tx`select category_id, total from public.category_spend(current_date, current_date)`;
    const daily = Object.fromEntries(
      (await tx`select type, total from public.daily_totals(current_date, current_date)`).map((r) => [
        r.type,
        Number(r.total),
      ]),
    );
    await tx`reset role`;
    check(
      "RLS: a user sees only their own accounts and balances",
      visible.length === 2 && visibleBalances.length === 2 && !visible.some((a) => a.id === otherAccount.id),
    );
    check("daily_totals sums only the caller's transactions", daily.income === 100000 && daily.expense === 30000);
    check(
      "category_spend sums only the caller's spending, per category",
      spendByCategory.length === 1 &&
        spendByCategory[0].category_id === food.id &&
        Number(spendByCategory[0].total) === 30000,
    );

    // ── statement import ──
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user.id, role: "authenticated" })}, true)`;
    const balanceOf = async () =>
      Number((await tx`select balance from public.account_balances where account_id = ${bank.id}`)[0].balance);
    const before = await balanceOf();
    const rows = tx.json([
      {
        type: "expense",
        amount: 45000,
        occurred_on: "2026-01-05",
        account_id: bank.id,
        note: "Swiggy",
        import_hash: "v1:a",
      },
      {
        type: "income",
        amount: 100000,
        occurred_on: "2026-01-06",
        account_id: bank.id,
        note: "Refund",
        import_hash: "v1:b",
      },
    ]);
    const [{ first: firstImport }] =
      await tx`select public.import_statement(${bank.id}, 'jan.csv', ${rows}, true) as first`;
    const [{ again }] = await tx`select public.import_statement(${bank.id}, 'jan.csv', ${rows}, true) as again`;
    const afterImport = await balanceOf();
    const [{ undone }] = await tx`select public.undo_import(${firstImport.batch_id}) as undone`;
    const afterUndo = await balanceOf();
    await tx`reset role`;
    check("import: adds lines once, re-import adds nothing", firstImport.inserted === 2 && again.inserted === 0);
    check("import: 'balance already includes these' keeps today's balance", afterImport === before);
    check("import: undo removes the lines and restores the balance", undone === 2 && afterUndo === before);

    // ── delete my account ──
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user.id, role: "authenticated" })}, true)`;
    await tx`select public.delete_my_account()`;
    await tx`reset role`;
    const [leftover] = await tx`
      select (select count(*) from auth.users where id = ${user.id})::int
           + (select count(*) from public.profiles where id = ${user.id})::int
           + (select count(*) from public.accounts where user_id = ${user.id})::int
           + (select count(*) from public.transactions where user_id = ${user.id})::int
           + (select count(*) from public.categories where user_id = ${user.id})::int
           + (select count(*) from public.holdings where user_id = ${user.id})::int
           + (select count(*) from public.recurring_rules where user_id = ${user.id})::int as n`;
    const [otherStill] = await tx`select count(*)::int as n from public.accounts where user_id = ${other.id}`;
    check(
      "delete_my_account removes every row the user owns, and nobody else's",
      leftover.n === 0 && otherStill.n === 1,
    );

    throw ROLLBACK;
  });
} catch (error) {
  if (error !== ROLLBACK) throw error;
} finally {
  await sql.end();
}

process.exit(failures ? 1 : 0);
