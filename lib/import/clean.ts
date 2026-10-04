/**
 * Turns bank statement narrations into a readable merchant:
 *   "UPI/DR/412345678901/SWIGGY/YESB/swiggy@ybl/Payment"              → "Swiggy"
 *   "UPI-ZEPTO MARKETPLACE PRIVATE LIMITED-ZEPTO@YBL-YESB0YBLUPI-4123…" → "Zepto Marketplace"
 *   "POS 512345XXXXXX1234 AMAZON PAY IN"                               → "Amazon Pay"
 *   "ATM WDL/HSR LAYOUT/…"                                              → "ATM withdrawal"
 * Formats differ per bank; this strips the common noise rather than parsing
 * any one bank exactly, and falls back to the original text.
 */

const NOISE_WORDS = new Set([
  "upi",
  "dr",
  "cr",
  "p2m",
  "p2a",
  "payment",
  "pay",
  "pos",
  "neft",
  "imps",
  "rtgs",
  "ach",
  "nach",
  "ecs",
  "mmt",
  "inb",
  "bil",
  "onl",
  "to",
  "from",
  "ref",
  "na",
  "txn",
  "transfer",
  "trf",
  "by",
  "via",
  "debit",
  "credit",
  "card",
  "purchase",
  "mob",
  "mobile",
  "net",
  "netbanking",
  "ib",
  "billpay",
  "autopay",
  "si",
  "mandate",
  "collect",
  "request",
  "intent",
]);

// UPI handles / bank short codes that show up as their own segment.
const BANK_CODES =
  /^(yesb|hdfc|icic|sbin|utib|kkbk|pytm|ibkl|barb|cnrb|punb|idfb|indb|fdrl|ubin|ybl|okaxis|okhdfcbank|okicici|oksbi|paytm|apl|ibl|axl|axb|airp|jio|fbl)$/i;
const NOISE_PHRASES = /(payment from phone|sent using paytm|upi intent|paid via|bank limited|bank ltd|\bbank\b$)/i;
const COMPANY_SUFFIX = /\s+(private|pvt|limited|ltd|llp|inc|india|in|co|company|services|technologies|online)\.?$/i;

function titleCase(text: string) {
  return text.toLowerCase().replace(/(^|\s)([a-z])/g, (m) => m.toUpperCase());
}

/** A single word that's never part of a merchant name. */
function isNoiseWord(word: string): boolean {
  const w = word.replace(/[.,:]+$/, "");
  if (!w) return true;
  if (NOISE_WORDS.has(w.toLowerCase()) || BANK_CODES.test(w)) return true;
  if (/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(w)) return true; // IFSC
  if (/\d{5,}/.test(w)) return true; // reference numbers
  if (/^[x*\d]+$/i.test(w) && /\d/.test(w)) return true; // masked card numbers
  return w.includes("@"); // UPI id, used only as a fallback
}

/** A whole segment that carries no merchant ("YES BANK LIMITED", "PAYMENT FROM PHONE"). */
function isNoiseSegment(segment: string): boolean {
  return NOISE_PHRASES.test(segment) || segment.split(" ").every(isNoiseWord);
}

export function cleanDescription(narration: string): string {
  const original = narration.replace(/\s+/g, " ").trim();
  if (!original) return "";
  if (/\b(atm|atw|nwd)\b|cash wdl|cash withdrawal/i.test(original)) return "ATM withdrawal";

  // Human-written text (mixed case, no reference numbers or separators) is already readable.
  if (!/[/|]|\d{5,}/.test(original) && original !== original.toUpperCase()) return original;

  const segments = original
    .split(/[/|]|(?<=\S)-(?=\S)|\s+-\s*|\s*-\s+/)
    .flatMap((seg) => seg.split(/\s{2,}/))
    .map((seg) => seg.trim());

  // Drop noise segments, then noise words inside the rest ("POS 5123XX AMAZON PAY IN" → "AMAZON IN").
  const cleaned = segments
    .filter((seg) => seg && !isNoiseSegment(seg))
    .map((seg) =>
      seg
        .split(" ")
        .filter((word) => !isNoiseWord(word))
        .join(" "),
    )
    .map((seg) => {
      let s = seg;
      while (COMPANY_SUFFIX.test(s)) s = s.replace(COMPANY_SUFFIX, "");
      return s.trim();
    })
    .filter((seg) => seg.length >= 2 && /[a-z]/i.test(seg));

  if (cleaned.length) {
    const merchant = cleaned[0];
    // Keep human-written mixed case ("Amazon Prime renewal"); tidy SHOUTING.
    return merchant === merchant.toUpperCase() ? titleCase(merchant) : merchant;
  }

  // Nothing but noise: try the UPI handle ("swiggy@ybl" → "Swiggy").
  const handle = original.match(/([a-z][a-z.]{2,})@[a-z]+/i);
  if (handle) return titleCase(handle[1].replace(/\./g, " ").trim());
  return original.length > 60 ? `${original.slice(0, 57)}…` : original;
}
