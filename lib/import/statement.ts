import type { Paise } from "@/lib/money";

/**
 * Turning a bank statement (rows of cells, from CSV or Excel) into transactions.
 * Pure functions; the file is read in the browser and never uploaded.
 */

export type Cell = string;

export type DateFormat = "dmy" | "mdy" | "ymd" | "dmony";

export type Mapping = {
  headerRow: number;
  date: number;
  description: number;
  /** Separate withdrawal/deposit columns (most Indian bank exports)… */
  debit: number | null;
  credit: number | null;
  /** …or one signed amount column, optionally with a Dr/Cr column. */
  amount: number | null;
  drcr: number | null;
  /** For a single amount column with no Dr/Cr: which sign means money out. */
  outflowSign: "negative" | "positive";
  dateFormat: DateFormat;
};

export type StatementRow = {
  line: number;
  date: string;
  description: string;
  type: "income" | "expense";
  amount: Paise;
};

const norm = (cell: Cell | undefined) =>
  (cell ?? "")
    .toLowerCase()
    .replace(/\(.*?\)|[.:*#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const COLUMN_NAMES = {
  date: ["txn date", "transaction date", "tran date", "date", "posting date", "value date", "value dt", "txn dt"],
  description: [
    "narration",
    "description",
    "particulars",
    "transaction details",
    "transaction remarks",
    "remarks",
    "details",
    "merchant",
  ],
  debit: [
    "withdrawal amt",
    "withdrawal amount",
    "withdrawals",
    "withdrawal",
    "debit amount",
    "debit",
    "dr amount",
    "paid out",
    "debits",
  ],
  credit: [
    "deposit amt",
    "deposit amount",
    "deposits",
    "deposit",
    "credit amount",
    "credit",
    "cr amount",
    "paid in",
    "credits",
  ],
  amount: ["transaction amount", "amount", "amt", "txn amount"],
  drcr: ["dr/cr", "cr/dr", "dr / cr", "debit/credit", "transaction type", "type"],
} as const;

/** Index of the column whose header best matches one of `names` (earlier names win). */
function findColumn(header: Cell[], names: readonly string[], exclude: (number | null)[] = []): number | null {
  const cells = header.map(norm);
  for (const name of names) {
    const exact = cells.findIndex((c, i) => c === name && !exclude.includes(i));
    if (exact >= 0) return exact;
  }
  for (const name of names) {
    const partial = cells.findIndex((c, i) => c.includes(name) && !exclude.includes(i));
    if (partial >= 0) return partial;
  }
  return null;
}

/** Statements often start with account details; the header is the first row naming a date and an amount column. */
export function findHeaderRow(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const row = rows[i];
    const hasDate = findColumn(row, COLUMN_NAMES.date) !== null;
    const hasMoney =
      findColumn(row, COLUMN_NAMES.debit) !== null ||
      findColumn(row, COLUMN_NAMES.credit) !== null ||
      findColumn(row, COLUMN_NAMES.amount) !== null;
    if (hasDate && hasMoney) return i;
  }
  return 0;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Parse a date cell in the given format to YYYY-MM-DD, or null. Time parts are ignored. */
export function parseDateCell(value: Cell, format: DateFormat): string | null {
  const v = value
    .trim()
    .split(/[ T]\d{1,2}:\d{2}/)[0]
    .trim();
  if (format === "dmony") {
    const m = v.match(/^(\d{1,2})[\s/-]([a-z]{3,9})[\s/,-]+(\d{2,4})$/i);
    const month = m ? MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) : -1;
    return m && month >= 0 ? validDate(Number(m[3]), month + 1, Number(m[1])) : null;
  }
  const parts = v.match(/^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/);
  if (!parts) return null;
  const [a, b, c] = parts.slice(1).map(Number);
  if (format === "ymd") return parts[1].length === 4 ? validDate(a, b, c) : null;
  if (parts[3].length !== 2 && parts[3].length !== 4) return null;
  return format === "dmy" ? validDate(c, b, a) : validDate(c, a, b);
}

/** Pick the format that parses every sample. Ambiguous dd/mm vs mm/dd defaults to day-first (India). */
export function detectDateFormat(samples: Cell[]): DateFormat {
  const values = samples
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
  const order: DateFormat[] = ["ymd", "dmony", "dmy", "mdy"];
  return order.find((f) => values.length > 0 && values.every((v) => parseDateCell(v, f) !== null)) ?? "dmy";
}

/** "1,23,456.78", "₹ 500", "(1,200.00)", "-45", "500.00 Dr" → signed paise; null if not a number. */
export function parseMoneyCell(value: Cell | undefined): Paise | null {
  if (value === undefined) return null;
  let v = value.trim();
  if (!v || v === "-") return null;
  let sign = 1;
  if (/^\(.*\)$/.test(v)) {
    sign = -1;
    v = v.slice(1, -1);
  }
  if (/\bdr\.?$/i.test(v)) sign = -1;
  v = v.replace(/₹|inr|rs\.?|\b(dr|cr)\.?$/gi, "").replace(/[,\s]/g, "");
  if (v.startsWith("-")) {
    sign *= -1;
    v = v.slice(1);
  } else if (v.startsWith("+")) v = v.slice(1);
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  return sign * Math.round(Number(v) * 100);
}

export function guessMapping(rows: Cell[][]): Mapping {
  const headerRow = findHeaderRow(rows);
  const header = rows[headerRow] ?? [];
  const date = findColumn(header, COLUMN_NAMES.date) ?? 0;
  const description = findColumn(header, COLUMN_NAMES.description, [date]) ?? 1;
  const debit = findColumn(header, COLUMN_NAMES.debit, [date, description]);
  const credit = findColumn(header, COLUMN_NAMES.credit, [date, description, debit]);
  const split = debit !== null && credit !== null;
  const amount = split ? null : findColumn(header, COLUMN_NAMES.amount, [date, description]);
  const drcr = split ? null : findColumn(header, COLUMN_NAMES.drcr, [date, description, amount]);
  const body = rows.slice(headerRow + 1);
  return {
    headerRow,
    date,
    description,
    debit: split ? debit : null,
    credit: split ? credit : null,
    amount: split ? null : (amount ?? debit ?? credit),
    drcr,
    outflowSign: "negative",
    dateFormat: detectDateFormat(body.map((r) => r[date]).filter((v) => /\d/.test(v ?? ""))),
  };
}

/** Rows that have a valid date and a non-zero amount become transactions; the rest (totals, balances) are skipped. */
export function buildRows(rows: Cell[][], m: Mapping): { rows: StatementRow[]; skipped: number } {
  const out: StatementRow[] = [];
  let skipped = 0;
  rows.slice(m.headerRow + 1).forEach((row, i) => {
    const date = parseDateCell(row[m.date] ?? "", m.dateFormat);
    const description = (row[m.description] ?? "").trim();
    let type: "income" | "expense" | null = null;
    let amount = 0;

    if (m.debit !== null && m.credit !== null) {
      const out = Math.abs(parseMoneyCell(row[m.debit]) ?? 0);
      const inn = Math.abs(parseMoneyCell(row[m.credit]) ?? 0);
      if (out > 0) [type, amount] = ["expense", out];
      else if (inn > 0) [type, amount] = ["income", inn];
    } else if (m.amount !== null) {
      const value = parseMoneyCell(row[m.amount]) ?? 0;
      if (value !== 0) {
        amount = Math.abs(value);
        if (m.drcr !== null && /^\s*(dr|d|debit|withdrawal)/i.test(row[m.drcr] ?? "")) type = "expense";
        else if (m.drcr !== null && /^\s*(cr|c|credit|deposit)/i.test(row[m.drcr] ?? "")) type = "income";
        else type = value < 0 === (m.outflowSign === "negative") ? "expense" : "income";
      }
    }

    if (!date || !type || amount <= 0) {
      skipped++;
      return;
    }
    out.push({ line: m.headerRow + 2 + i, date, description, type, amount });
  });
  return { rows: out, skipped };
}

// ─── fingerprints & duplicates ───────────────────────────────────────────────

/** cyrb53: small, fast, well-distributed 53-bit string hash. */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * A stable fingerprint per statement line. Two identical lines on the same day
 * (two ₹20 chais) get #1 and #2, so both import, and re-importing adds neither.
 */
export function fingerprints(rows: StatementRow[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const key = `${r.date}|${r.type}|${r.amount}|${r.description.toLowerCase().replace(/\s+/g, " ").trim()}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return `v1:${cyrb53(`${key}#${n}`)}`;
  });
}

export type Existing = { occurred_on: string; type: string; amount: Paise; import_hash: string | null };

const dayDiff = (a: string, b: string) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/**
 * "imported": this exact line came in before. "possible": an entry typed by hand
 * with the same amount and type within 2 days (each existing entry matches once).
 */
export function findDuplicates(
  rows: StatementRow[],
  hashes: string[],
  existing: Existing[],
): ("imported" | "possible" | null)[] {
  const imported = new Set(existing.map((e) => e.import_hash).filter(Boolean));
  const manual = existing.filter((e) => !e.import_hash).map((e) => ({ ...e, used: false }));
  return rows.map((row, i) => {
    if (imported.has(hashes[i])) return "imported";
    const match = manual.find(
      (e) => !e.used && e.type === row.type && e.amount === row.amount && dayDiff(e.occurred_on, row.date) <= 2,
    );
    if (match) {
      match.used = true;
      return "possible";
    }
    return null;
  });
}
