#!/usr/bin/env node
/**
 * Shows the LAYOUT of a statement PDF (CAS from NSDL/CDSL, a bank statement…)
 * with the personal data masked, so a parser can be written for that format
 * without anyone sharing a real statement.
 *
 *   npm run cas:layout -- ~/Downloads/NSDL_CAS_Sep2026.pdf
 *
 * Everything runs on your computer. The PDF password is asked for in the
 * terminal, never stored, never printed. The output file goes next to the PDF.
 *
 * Masked: every digit (→ 9, keeping commas, dots and dashes so number and date
 * formats stay visible), PAN numbers, email addresses, and any extra words you
 * list (your name, street, city). NOT masked: headings, month names, and the
 * names of funds/companies. Read the output before sharing it.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run cas:layout -- path/to/statement.pdf");
  process.exit(1);
}

// Answers can also be piped in (one per line), for scripting and tests.
let piped;
async function pipedLine(question) {
  if (!piped) {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    piped = text.split(/\r?\n/);
  }
  process.stdout.write(`${question}\n`);
  return piped.shift() ?? "";
}

async function ask(question) {
  if (!process.stdin.isTTY) return pipedLine(question);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

/** Reads a line without echoing it (for the PDF password). */
function askHidden(question) {
  if (!process.stdin.isTTY) return pipedLine(question);
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") process.exit(130); // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function open(data) {
  try {
    return await getDocument({ data: data.slice(), isEvalSupported: false, verbosity: 0 }).promise;
  } catch (error) {
    if (error?.name !== "PasswordException") throw error;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const password = await askHidden(
      attempt === 1 ? "PDF password (usually your PAN in capitals; not shown): " : "Wrong password, try again: ",
    );
    try {
      return await getDocument({ data: data.slice(), password, isEvalSupported: false, verbosity: 0 }).promise;
    } catch (error) {
      if (error?.name !== "PasswordException") throw error;
    }
  }
  console.error("Couldn't open the PDF.");
  process.exit(1);
}

function masker(extraWords) {
  const words = extraWords
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
    .map((w) => new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"));
  return (text) => {
    let t = text
      .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, "AAAAA9999A") // PAN
      .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "someone@example.com");
    for (const re of words) t = t.replace(re, "XXXX");
    return t.replace(/\d/g, "9");
  };
}

/** Groups a page's text pieces into lines (by y), left to right, keeping each piece's x position. */
function pageLines(items) {
  const pieces = items
    .filter((it) => it.str && it.str.trim())
    .map((it) => ({ x: it.transform[4], y: it.transform[5], size: Math.abs(it.transform[3]), text: it.str }));
  pieces.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const p of pieces) {
    const line = lines.find((l) => Math.abs(l.y - p.y) <= 2);
    if (line) line.pieces.push(p);
    else lines.push({ y: p.y, pieces: [p] });
  }
  for (const l of lines) l.pieces.sort((a, b) => a.x - b.x);
  return lines.sort((a, b) => b.y - a.y);
}

const data = new Uint8Array(await readFile(file));
const pdf = await open(data);

const extra = await ask("Extra words to hide, comma-separated (your name, street, city; Enter to skip): ");
const mask = masker(extra.split(","));

const out = [
  `# Layout of ${path.basename(file).replace(/\d/g, "9")}, ${pdf.numPages} pages`,
  "# Each line: [x position] text … (font size in braces when it isn't body text). Digits are all 9s.",
  "",
];
for (let n = 1; n <= pdf.numPages; n++) {
  const page = await pdf.getPage(n);
  const { width, height } = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  out.push(`=== page ${n} (${Math.round(width)}×${Math.round(height)}) ===`);
  for (const line of pageLines(content.items)) {
    out.push(
      line.pieces
        .map((p) => {
          const size = Math.round(p.size);
          return `[${String(Math.round(p.x)).padStart(3)}]${size && (size < 7 || size > 10) ? `{${size}}` : ""} ${mask(p.text.trim())}`;
        })
        .join("   "),
    );
  }
  out.push("");
}

const target = path.join(path.dirname(path.resolve(file)), `${path.parse(file).name}.layout.txt`);
await writeFile(target, out.join("\n"));
console.log(`\n✓ Wrote ${target}`);
console.log("  Open it and check nothing personal is left (search for your name, address and email) before sharing.");
