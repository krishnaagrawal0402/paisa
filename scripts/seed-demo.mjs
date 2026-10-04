#!/usr/bin/env node
/**
 * Fills an empty Paisa account with six months of realistic sample data:
 * salary, rent, food, a card, SIPs, an FD, a car loan, budgets and goals.
 * Handy for trying the app, taking screenshots or working on the UI.
 *
 *   npm run db:seed-demo -- you@example.com          (sign in once first, so the user exists)
 *   npm run db:seed-demo -- you@example.com --wipe   (removes the demo data again)
 *
 * It only seeds an account with no accounts yet, and --wipe only removes data
 * this script created, so it can't touch real records.
 */
import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });

const email = process.argv.slice(2).find((a) => !a.startsWith("--"));
const wipe = process.argv.includes("--wipe");
const dbUrl = process.env.SUPABASE_DB_URL;
if (!email || !dbUrl) {
  console.error(
    !email
      ? "Usage: npm run db:seed-demo -- you@example.com [--wipe]"
      : "SUPABASE_DB_URL is not set (see .env.example).",
  );
  process.exit(1);
}

const ACCOUNTS = [
  { key: "bank", name: "HDFC Savings", type: "bank", opening: 40_000 },
  { key: "cash", name: "Cash", type: "cash", opening: 3_000 },
  { key: "upi", name: "Paytm UPI", type: "wallet", opening: 1_500 },
  { key: "card", name: "Amazon Pay ICICI", type: "credit_card", opening: 0 },
];

// ─── dates (plain YYYY-MM-DD, India time) ────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const [TY, TM, TD] = today.split("-").map(Number);
const addDays = (date, n) => {
  const [y, m, d] = date.split("-").map(Number);
  return iso(y, m, d + n);
};

// Same numbers every run, so screenshots are reproducible.
let seed = 42;
const rand = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (lo, hi, step = 10) => Math.round((lo + rand() * (hi - lo)) / step) * step;
const pick = (list) => list[Math.floor(rand() * list.length)];

const paise = (rupees) => Math.round(rupees * 100);
const emiFor = (principal, annualRate, months) => {
  const r = annualRate / 12 / 100;
  return Math.round((principal * r * (1 + r) ** months) / ((1 + r) ** months - 1));
};

/** NAV on or before `date` from mfapi.in, to size the opening units. */
async function navOn(schemeCode, date) {
  const res = await fetch(`https://api.mfapi.in/mf/${schemeCode}`);
  const { data } = await res.json();
  const row = data.find((r) => r.date.split("-").reverse().join("-") <= date);
  return Number(row.nav);
}

const sql = postgres(dbUrl, { max: 1, ssl: dbUrl.includes("localhost") ? false : "require", onnotice() {} });

try {
  const [user] = await sql`select id from auth.users where lower(email) = lower(${email})`;
  if (!user) throw new Error(`No user with email ${email}. Sign in to the app once first.`);
  const uid = user.id;
  const existing = await sql`select name, created_at from public.accounts where user_id = ${uid}`;

  if (wipe) {
    const demoNames = new Set(ACCOUNTS.map((a) => a.name));
    const createdTogether = new Set(existing.map((a) => a.created_at.toISOString())).size === 1;
    if (existing.length === 0) {
      console.log("Nothing to wipe.");
    } else if (
      existing.length !== ACCOUNTS.length ||
      !createdTogether ||
      !existing.every((a) => demoNames.has(a.name))
    ) {
      throw new Error("This account has data that wasn't created by the demo seed. Not touching it.");
    } else {
      await sql.begin(async (tx) => {
        for (const table of [
          "goal_sources",
          "goals",
          "budgets",
          "category_rules",
          "transactions",
          "import_profiles",
          "import_batches",
          "recurring_rules",
          "holdings",
          "loans",
          "accounts",
        ]) {
          await tx`delete from ${tx("public." + table)} where user_id = ${uid}`;
        }
        await tx`update public.profiles set onboarded_at = null where id = ${uid}`;
      });
      console.log("✓ Demo data removed. Next visit starts with onboarding.");
    }
    process.exit(0);
  }

  if (existing.length > 0) {
    throw new Error("This account already has accounts. The demo seed only fills an empty one.");
  }

  const [{ month_start_day: payday }] = await sql`select month_start_day from public.profiles where id = ${uid}`;
  // Investments and the loan predate the six months of history, so the 12-month net-worth chart has a full year.
  const holdingsSince = iso(TY, TM - 13, 1);
  const ppfasNav = await navOn(122639, holdingsSince);
  const utiNav = await navOn(120716, holdingsSince);

  await sql.begin(async (tx) => {
    // Accounts in one statement, so they share created_at (that's how --wipe recognises them).
    const accountRows = await tx`
      insert into public.accounts ${tx(
        ACCOUNTS.map((a, i) => ({
          user_id: uid,
          name: a.name,
          type: a.type,
          opening_balance: paise(a.opening),
          sort: i,
        })),
      )}
      returning id, name`;
    const acct = Object.fromEntries(ACCOUNTS.map((a) => [a.key, accountRows.find((r) => r.name === a.name).id]));

    const cats = await tx`select id, name from public.categories where user_id = ${uid}`;
    const cat = Object.fromEntries(cats.map((c) => [c.name, c.id]));

    const holdingRows = await tx`
      insert into public.holdings ${tx([
        {
          user_id: uid,
          name: "Parag Parikh Flexi Cap Fund - Direct Plan - Growth",
          asset_class: "mutual_fund",
          scheme_code: 122639,
          opening_units: +(paise(1_80_000) / 100 / (ppfasNav * 0.9)).toFixed(4),
          opening_cost: paise(1_80_000),
          opening_date: holdingsSince,
          sort: 0,
        },
        {
          user_id: uid,
          name: "UTI Nifty 50 Index Fund - Direct Plan - Growth",
          asset_class: "mutual_fund",
          scheme_code: 120716,
          opening_units: +(paise(80_000) / 100 / (utiNav * 0.9)).toFixed(4),
          opening_cost: paise(80_000),
          opening_date: holdingsSince,
          sort: 1,
        },
      ])}
      returning id, name`;
    const [ppfas, uti] = holdingRows.map((h) => h.id);
    const [{ id: fd }] = await tx`
      insert into public.holdings (user_id, name, asset_class, opening_cost, fd_rate, fd_start, fd_maturity, fd_compounding, sort)
      values (${uid}, 'SBI Fixed Deposit', 'fd', ${paise(1_00_000)}, 7.1, ${addDays(today, -240)}, ${addDays(today, 125)}, 'quarterly', 2)
      returning id`;
    await tx`
      insert into public.holdings (user_id, name, asset_class, opening_cost, manual_value, manual_value_at, sort)
      values (${uid}, 'EPF', 'epf', ${paise(2_10_000)}, ${paise(2_42_500)}, ${today}, 3)`;

    // Banks round EMIs to the rupee.
    const loanEmi = Math.round(emiFor(paise(6_00_000), 9.2, 60) / 100) * 100;
    const firstEmi = iso(TY, TM - 14, 5);
    await tx`
      insert into public.loans (user_id, name, lender, principal, annual_rate, tenure_months, first_emi_date, emi)
      values (${uid}, 'Car loan', 'HDFC Bank', ${paise(6_00_000)}, 9.2, 60, ${firstEmi}, ${loanEmi})`;

    // Recurring rules: the history below already covers past dates, so each starts at its next date after today.
    const nextOn = (day) => (TD < day ? iso(TY, TM, day) : iso(TY, TM + 1, day));
    const rule = (r) => ({
      user_id: uid,
      frequency: "monthly",
      anchor_date: iso(TY, TM - 5, r.day),
      next_due: nextOn(r.day),
      mode: "auto",
      category_id: null,
      holding_id: null,
      to_account_id: null,
      name: r.name,
      type: r.type,
      amount: paise(r.amount),
      account_id: r.account,
      ...r.extra,
    });
    const RULES = [
      {
        name: "Salary",
        type: "income",
        amount: 1_42_000,
        account: acct.bank,
        day: payday,
        extra: { mode: "confirm", category_id: cat.Salary },
      },
      { name: "Rent", type: "expense", amount: 28_000, account: acct.bank, day: 5, extra: { category_id: cat.Rent } },
      { name: "Car loan EMI", type: "expense", amount: loanEmi / 100, account: acct.bank, day: 5 },
      {
        name: "Parents",
        type: "expense",
        amount: 10_000,
        account: acct.bank,
        day: 3,
        extra: { category_id: cat.Family },
      },
      {
        name: "Flexi Cap SIP",
        type: "invest",
        amount: 10_000,
        account: acct.bank,
        day: 7,
        extra: { holding_id: ppfas },
      },
      { name: "Nifty 50 SIP", type: "invest", amount: 5_000, account: acct.bank, day: 7, extra: { holding_id: uti } },
      {
        name: "Netflix",
        type: "expense",
        amount: 649,
        account: acct.card,
        day: 18,
        extra: { category_id: cat.Subscriptions },
      },
      {
        name: "Spotify",
        type: "expense",
        amount: 119,
        account: acct.card,
        day: 22,
        extra: { category_id: cat.Subscriptions },
      },
      {
        name: "Airtel Fiber",
        type: "expense",
        amount: 999,
        account: acct.bank,
        day: 12,
        extra: { category_id: cat["Bills & Utilities"] },
      },
    ];
    const ruleRows = await tx`insert into public.recurring_rules ${tx(RULES.map(rule))} returning id, name`;
    const ruleId = Object.fromEntries(ruleRows.map((r) => [r.name, r.id]));

    // ─── six months of history ──────────────────────────────────────────────
    const txns = [];
    const add = (t) =>
      t.date <= today &&
      txns.push({
        user_id: uid,
        type: t.type ?? "expense",
        amount: paise(t.amount),
        occurred_on: t.date,
        account_id: t.account,
        to_account_id: t.to ?? null,
        category_id: t.category ? cat[t.category] : null,
        holding_id: t.holding ?? null,
        note: t.note ?? null,
        source: t.rule ? "recurring" : "manual",
        recurring_id: t.rule ? ruleId[t.rule] : null,
        occurrence_date: t.rule ? t.date : null,
      });

    let cardSpentLastMonth = 0;
    for (let k = -5; k <= 0; k++) {
      const day = (d) => iso(TY, TM + k, d);
      const daysInMonth = new Date(Date.UTC(TY, TM + k, 0)).getUTCDate();
      let cardSpent = 0;
      const card = (t) => {
        if (t.date <= today) cardSpent += t.amount;
        add({ ...t, account: acct.card });
      };

      for (const r of RULES) {
        if (r.name === "Netflix" || r.name === "Spotify") {
          card({ date: day(r.day), amount: r.amount, category: "Subscriptions", note: r.name, rule: r.name });
          continue;
        }
        add({
          type: r.type,
          date: day(r.day),
          amount: r.amount,
          account: r.account,
          category: Object.entries(cat).find(([, id]) => id === r.extra?.category_id)?.[0],
          holding: r.extra?.holding_id,
          note: r.name === "Salary" ? "Salary credit" : r.name,
          rule: r.name,
        });
      }

      // Pay off last month's card bill, move cash around.
      if (cardSpentLastMonth > 0) {
        add({
          type: "transfer",
          date: day(15),
          amount: cardSpentLastMonth,
          account: acct.bank,
          to: acct.card,
          note: "Card bill",
        });
      }
      add({ type: "transfer", date: day(2), amount: 2_000, account: acct.bank, to: acct.cash, note: "ATM" });
      add({ type: "transfer", date: day(2), amount: 600, account: acct.bank, to: acct.upi, note: "Wallet top-up" });

      add({
        date: day(10),
        amount: between(1_600, 2_700),
        account: acct.bank,
        category: "Bills & Utilities",
        note: "BESCOM electricity",
      });
      add({ date: day(14), amount: 599, account: acct.bank, category: "Bills & Utilities", note: "Jio recharge" });
      add({ date: day(20), amount: 2_150, account: acct.bank, category: "Insurance", note: "Star Health premium" });

      for (let d = 1; d <= daysInMonth; d++) {
        const date = day(d);
        if (rand() < 0.38)
          add({
            date,
            amount: between(220, 880),
            account: acct.bank,
            category: "Food & Dining",
            note: pick(["Swiggy", "Zomato", "Swiggy", "Zomato", "Domino's"]),
          });
        if (rand() < 0.3)
          add({
            date,
            amount: between(40, 260),
            account: acct.cash,
            category: "Food & Dining",
            note: pick(["Chai", "Third Wave Coffee", "Chai", "Juice"]),
          });
        if (rand() < 0.33)
          add({
            date,
            amount: between(110, 460),
            account: acct.bank,
            category: "Transport",
            note: pick(["Uber", "Ola", "Rapido"]),
          });
        if (rand() < 0.12)
          card({
            date,
            amount: between(900, 3_200),
            category: "Groceries",
            note: pick(["BigBasket", "Blinkit", "Zepto", "DMart"]),
          });
        if (rand() < 0.07)
          card({
            date,
            amount: between(700, 5_800, 100),
            category: "Shopping",
            note: pick(["Amazon", "Myntra", "Flipkart", "Decathlon"]),
          });
        if (rand() < 0.04)
          add({
            date,
            amount: between(250, 1_400),
            account: acct.bank,
            category: "Health",
            note: pick(["Apollo Pharmacy", "1mg", "Practo"]),
          });
        if (rand() < 0.035)
          card({
            date,
            amount: between(500, 1_300),
            category: "Entertainment",
            note: pick(["PVR", "BookMyShow", "Steam"]),
          });
        if (rand() < 0.03)
          add({ date, amount: between(350, 900), account: acct.cash, category: "Personal care", note: "Haircut" });
        if (rand() < 0.2)
          add({ date, amount: between(30, 60, 5), account: acct.upi, category: "Transport", note: "Namma Metro" });
      }
      add({
        date: day(9),
        amount: between(1_800, 2_600, 100),
        account: acct.bank,
        category: "Transport",
        note: "Indian Oil fuel",
      });
      add({
        date: day(24),
        amount: between(1_800, 2_600, 100),
        account: acct.bank,
        category: "Transport",
        note: "HP petrol",
      });

      cardSpentLastMonth = cardSpent;
    }

    // A few one-offs that make the story interesting.
    add({
      date: iso(TY, TM - 3, 12),
      amount: 12_480,
      account: acct.card,
      category: "Travel",
      note: "IndiGo flights to Goa",
    });
    add({ date: iso(TY, TM - 3, 19), amount: 9_800, account: acct.card, category: "Travel", note: "Goa stay" });
    add({
      date: iso(TY, TM - 4, 21),
      type: "income",
      amount: 18_000,
      account: acct.bank,
      category: "Freelance",
      note: "Logo design",
    });
    add({
      date: iso(TY, TM - 1, 26),
      type: "income",
      amount: 22_500,
      account: acct.bank,
      category: "Freelance",
      note: "Website build",
    });
    add({
      date: iso(TY, TM - 2, 30),
      type: "income",
      amount: 1_240,
      account: acct.bank,
      category: "Interest",
      note: "Savings interest",
    });
    add({
      date: iso(TY, TM - 2, 8),
      amount: 2_500,
      account: acct.bank,
      category: "Gifts & Donations",
      note: "Wedding gift",
    });
    add({
      date: iso(TY, TM - 1, 15),
      amount: 7_999,
      account: acct.card,
      category: "Shopping",
      note: "Croma headphones",
    });

    await tx`insert into public.transactions ${tx(txns)}`;

    await tx`
      insert into public.budgets ${tx(
        [
          ["Food & Dining", 9_000],
          ["Groceries", 8_000],
          ["Transport", 6_000],
          ["Shopping", 6_000],
          ["Entertainment", 2_000],
        ].map(([name, limit]) => ({ user_id: uid, category_id: cat[name], monthly_limit: paise(limit) })),
      )}`;

    const goals = await tx`
      insert into public.goals ${tx([
        {
          user_id: uid,
          name: "Emergency fund",
          emoji: "🛟",
          kind: "emergency",
          target_amount: paise(3_60_000),
          target_date: null,
          manual_saved: 0,
          sort: 0,
        },
        {
          user_id: uid,
          name: "Japan trip",
          emoji: "🗾",
          kind: "custom",
          target_amount: paise(2_50_000),
          target_date: iso(TY + 1, TM + 4, 1),
          manual_saved: paise(45_000),
          sort: 1,
        },
        {
          user_id: uid,
          name: "New MacBook",
          emoji: "💻",
          kind: "custom",
          target_amount: paise(1_60_000),
          target_date: iso(TY, TM + 6, 1),
          manual_saved: 0,
          sort: 2,
        },
      ])}
      returning id, name`;
    const goal = Object.fromEntries(goals.map((g) => [g.name, g.id]));
    await tx`
      insert into public.goal_sources ${tx([
        { user_id: uid, goal_id: goal["Emergency fund"], holding_id: fd, account_id: null },
        { user_id: uid, goal_id: goal["New MacBook"], holding_id: uti, account_id: null },
      ])}`;

    await tx`update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where id = ${uid}`;
    console.log(`✓ Seeded ${txns.length} transactions, 4 accounts, 4 investments, a loan, 5 budgets and 3 goals.`);
  });
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
