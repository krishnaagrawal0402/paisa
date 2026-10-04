import { suggestCategory, type CategoryRule } from "@/lib/categorize";
import type { Paise } from "@/lib/money";
import { addDays } from "@/lib/month";
import { parseAmount } from "@/lib/parse/amount";
import type { Account, Category, TransactionType } from "@/lib/types";

/**
 * "450 swiggy dinner yesterday hdfc" → expense ₹450 · Food & Dining · HDFC · yesterday.
 * Rule-based on purpose: instant, free, offline and fully testable.
 */

export type NLContext = { accounts: Account[]; categories: Category[]; rules: CategoryRule[]; today: string };

export type NLResult = {
  type: TransactionType;
  amount: Paise | null;
  categoryId: string | null;
  accountId: string | null;
  toAccountId: string | null;
  date: string | null;
  note: string | null;
};

const INCOME_WORDS = new Set([
  "got",
  "received",
  "receive",
  "credited",
  "credit",
  "salary",
  "refund",
  "cashback",
  "earned",
  "income",
  "bonus",
  "interest",
  "dividend",
  "reimbursement",
  "+",
]);
const TRANSFER_WORDS = new Set([
  "moved",
  "move",
  "transfer",
  "transferred",
  "withdrew",
  "withdraw",
  "withdrawal",
  "atm",
]);
const FILLER = new Set([
  "on",
  "for",
  "at",
  "via",
  "using",
  "from",
  "paid",
  "pay",
  "spent",
  "spend",
  "bought",
  "buy",
  "to",
  "in",
  "the",
  "a",
  "an",
  "of",
  "with",
  "rs",
  "rs.",
  "inr",
  "₹",
  "and",
  "my",
  "by",
]);
const GENERIC_ACCOUNT_WORDS = new Set([
  "bank",
  "account",
  "savings",
  "saving",
  "current",
  "card",
  "credit",
  "debit",
  "wallet",
  "a/c",
]);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const pad = (n: number) => String(n).padStart(2, "0");

function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** A day+month (maybe year) that's not in the future: "3 Oct" in January means last October. */
function pastDate(today: string, day: number, month: number, year?: number): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const [ty] = today.split("-").map(Number);
  let y = year ? (year < 100 ? 2000 + year : year) : ty;
  let candidate = `${y}-${pad(month)}-${pad(day)}`;
  if (!year && candidate > today) candidate = `${--y}-${pad(month)}-${pad(day)}`;
  const check = new Date(`${candidate}T00:00:00Z`);
  return check.getUTCDate() === day ? candidate : null; // rejects 31 Feb
}

type Token = { raw: string; low: string; used: boolean };

function parseDateTokens(tokens: Token[], today: string): string | null {
  const low = tokens.map((t) => t.low);
  const take = (...idx: number[]) => idx.forEach((i) => (tokens[i].used = true));
  const monthIndex = (word: string) => MONTHS.indexOf(word.slice(0, 3));
  const dayNumber = (word: string) => {
    const m = word.match(/^(\d{1,2})(st|nd|rd|th)?$/);
    return m ? Number(m[1]) : null;
  };

  for (let i = 0; i < low.length; i++) {
    const w = low[i];
    if (w === "today") return (take(i), today);
    if (w === "yesterday" || w === "yday") {
      if (low[i - 2] === "day" && low[i - 1] === "before") return (take(i - 2, i - 1, i), addDays(today, -2));
      return (take(i), addDays(today, -1));
    }
    if (/^\d{1,2}$/.test(w) && /^days?$/.test(low[i + 1] ?? "") && low[i + 2] === "ago") {
      return (take(i, i + 1, i + 2), addDays(today, -Number(w)));
    }
    // dd/mm, dd-mm, dd/mm/yy(yy)
    const dm = w.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?$/);
    if (dm) {
      const date = pastDate(today, Number(dm[1]), Number(dm[2]), dm[3] ? Number(dm[3]) : undefined);
      if (date) return (take(i), date);
    }
    // "3 oct", "3rd october"
    const day = dayNumber(w);
    if (day !== null && i + 1 < low.length && monthIndex(low[i + 1]) >= 0 && /^[a-z]+$/.test(low[i + 1])) {
      const date = pastDate(today, day, monthIndex(low[i + 1]) + 1);
      if (date) return (take(i, i + 1), date);
    }
    // "oct 3"
    if (
      /^[a-z]+$/.test(w) &&
      w.length >= 3 &&
      monthIndex(w) >= 0 &&
      i + 1 < low.length &&
      dayNumber(low[i + 1]) !== null
    ) {
      const date = pastDate(today, dayNumber(low[i + 1])!, monthIndex(w) + 1);
      if (date) return (take(i, i + 1), date);
    }
    // "on 3rd" / "3rd" (an ordinal suffix or a preceding "on" marks it as a day, not an amount)
    const ordinal = w.match(/^(\d{1,2})(st|nd|rd|th)$/);
    if (ordinal || (low[i - 1] === "on" && /^\d{1,2}$/.test(w))) {
      // This month's date, or last month's if that day hasn't come yet.
      const [ty, tm] = today.split("-").map(Number);
      const d = Number(ordinal ? ordinal[1] : w);
      const thisMonth = pastDate(today, d, tm, ty);
      const [py, pm] = addDays(`${ty}-${pad(tm)}-01`, -1)
        .split("-")
        .map(Number);
      const date = thisMonth && thisMonth <= today ? thisMonth : pastDate(today, d, pm, py);
      if (date) return (take(i), date);
    }
    // weekdays: "friday", "last fri"
    const wd = WEEKDAYS.indexOf(w.slice(0, 3));
    if (wd >= 0 && /^[a-z]+$/.test(w) && (w.length === 3 || w.endsWith("day"))) {
      const isLast = low[i - 1] === "last";
      let back = (weekdayOf(today) - wd + 7) % 7;
      if (back === 0 && isLast) back = 7;
      if (isLast) take(i - 1);
      return (take(i), addDays(today, -back));
    }
  }
  return null;
}

function parseAmountTokens(tokens: Token[]): Paise | null {
  type Candidate = { value: Paise; idx: number[]; marked: boolean };
  const candidates: Candidate[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].used) continue;
    const w = tokens[i].low;
    const next = tokens[i + 1] && !tokens[i + 1].used ? tokens[i + 1].low : "";
    const prev = i > 0 ? tokens[i - 1].low : "";
    // "1.2 lakh", "5 k"
    const joined = parseAmount(`${w}${next}`);
    if (next && /^(k|l|lac|lakh|lakhs|cr|crore|crores)$/.test(next) && joined) {
      candidates.push({ value: joined, idx: [i, i + 1], marked: true });
      continue;
    }
    const value = parseAmount(w.replace(/^\+/, ""));
    if (value) {
      const marked = /[₹kl]|cr|rs/i.test(w) || prev === "rs" || prev === "rs." || prev === "₹" || prev === "inr";
      candidates.push({ value, idx: [i], marked });
    }
  }
  if (candidates.length === 0) return null;
  // Prefer an explicitly marked amount (₹, rs, k, L); otherwise the biggest number ("2 coffees 300" → 300).
  const pool = candidates.some((c) => c.marked) ? candidates.filter((c) => c.marked) : candidates;
  const best = pool.reduce((a, b) => (b.value > a.value ? b : a));
  best.idx.forEach((i) => (tokens[i].used = true));
  return best.value;
}

function accountWords(account: Account): string[] {
  return account.name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !GENERIC_ACCOUNT_WORDS.has(w));
}

function findAccounts(tokens: Token[], accounts: Account[]): { id: string; position: number }[] {
  const found: { id: string; position: number }[] = [];
  const claim = (id: string, i: number) => {
    if (!found.some((f) => f.id === id)) found.push({ id, position: i });
    tokens[i].used = true;
  };
  tokens.forEach((token, i) => {
    if (token.used) return;
    const w = token.low;
    const byName = accounts.filter((a) => accountWords(a).includes(w));
    if (byName.length === 1) return claim(byName[0].id, i);
    // Type words: "cash", "card"/"cc" pick the account if there's exactly one of that type.
    const type = w === "cash" ? "cash" : w === "card" || w === "cc" ? "credit_card" : null;
    const ofType = type ? accounts.filter((a) => a.type === type) : [];
    if (ofType.length === 1) claim(ofType[0].id, i);
  });
  return found.sort((a, b) => a.position - b.position);
}

export function parseNatural(input: string, ctx: NLContext): NLResult {
  const tokens: Token[] = input
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => ({ raw, low: raw.toLowerCase().replace(/[,!?]+$/, ""), used: false }));
  const lows = tokens.map((t) => t.low);

  const date = parseDateTokens(tokens, ctx.today);
  const amount = parseAmountTokens(tokens);
  const accounts = findAccounts(
    tokens,
    ctx.accounts.filter((a) => !a.archived),
  );

  const toIndex = lows.indexOf("to");
  const isTransfer =
    lows.some((w) => TRANSFER_WORDS.has(w)) ||
    (accounts.length >= 2 && toIndex > accounts[0].position && toIndex < accounts[1].position);
  const isIncome = !isTransfer && (input.trim().startsWith("+") || lows.some((w) => INCOME_WORDS.has(w)));
  const type: TransactionType = isTransfer ? "transfer" : isIncome ? "income" : "expense";

  const accountId = accounts[0]?.id ?? null;
  let toAccountId: string | null = null;
  if (type === "transfer") {
    toAccountId = accounts[1]?.id ?? null;
    // "atm 2000" / "withdrew 5k": from the bank to cash.
    if (lows.some((w) => ["atm", "withdrew", "withdraw", "withdrawal"].includes(w)) && !toAccountId) {
      const cash = ctx.accounts.filter((a) => a.type === "cash" && !a.archived);
      if (cash.length === 1 && cash[0].id !== accountId) toAccountId = cash[0].id;
    }
  }

  const remaining = tokens.filter((t) => !t.used && !FILLER.has(t.low) && !TRANSFER_WORDS.has(t.low));
  const noteText = remaining.map((t) => t.raw).join(" ");
  const match =
    type === "transfer"
      ? null
      : suggestCategory(noteText, { rules: ctx.rules, categories: ctx.categories, kind: type });

  // Drop pure type words from the note ("got", "received"), keep things like "salary".
  const noteWords = remaining.filter((t) => !(INCOME_WORDS.has(t.low) && t.low !== "salary" && t.low !== "refund"));
  const note = noteWords.length ? noteWords.map((t) => t.raw).join(" ") : null;

  return {
    type,
    amount,
    categoryId: match?.categoryId ?? null,
    accountId,
    toAccountId,
    date,
    note: note ? note.charAt(0).toUpperCase() + note.slice(1) : null,
  };
}
