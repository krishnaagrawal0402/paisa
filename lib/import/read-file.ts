import Papa from "papaparse";
import type { Cell } from "@/lib/import/statement";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Reads a bank statement into rows of text cells, entirely in the browser.
 * CSV via Papa Parse; XLS/XLSX via SheetJS (loaded only when needed).
 */
export async function readStatementFile(file: File): Promise<Cell[][]> {
  if (file.size > MAX_BYTES) throw new Error("That file is over 10 MB. Export a shorter date range.");
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") {
    const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: false });
    return parsed.data.map((row) => row.map((cell) => String(cell ?? "").trim()));
  }

  if (/\.(xlsx?|xlsm|ods)$/.test(name)) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // raw: false gives what the bank's spreadsheet shows; real date cells come out as yyyy-mm-dd.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      dateNF: "yyyy-mm-dd",
      defval: "",
    });
    return rows.map((row) => row.map((cell) => String(cell ?? "").trim()));
  }

  throw new Error("Use a CSV, XLS or XLSX file. Most banks offer one of these under 'Download statement'.");
}
