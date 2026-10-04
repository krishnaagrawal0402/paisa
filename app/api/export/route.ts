import Papa from "papaparse";
import { NextResponse, type NextRequest } from "next/server";
import { appConfig } from "@/config/app";
import { todayIn } from "@/lib/month";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * Everything you've put in, as a download.
 *   /api/export            → one JSON file with every table (amounts in paise)
 *   /api/export?format=csv → transactions as a spreadsheet-friendly CSV (amounts in rupees)
 */

// Table → a stable sort key, so paging never skips or repeats a row.
const TABLES: Record<string, string[]> = {
  accounts: ["created_at", "id"],
  categories: ["created_at", "id"],
  transactions: ["occurred_on", "created_at", "id"],
  recurring_rules: ["created_at", "id"],
  holdings: ["created_at", "id"],
  loans: ["created_at", "id"],
  budgets: ["created_at", "id"],
  goals: ["created_at", "id"],
  goal_sources: ["id"],
  category_rules: ["created_at", "id"],
  import_profiles: ["account_id"],
  import_batches: ["created_at", "id"],
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Reads a whole table, past the API's per-request row cap. */
async function readAll(supabase: Supabase, table: string) {
  const rows: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let query = supabase.from(table).select("*");
    for (const column of TABLES[table]) query = query.order(column);
    const { data, error } = await query.range(from, from + page - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < page) return rows;
  }
}

export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) return new NextResponse("Sign in first", { status: 401 });
  const supabase = await createClient();
  const stamp = todayIn(appConfig.timeZone);
  const slug = appConfig.name.toLowerCase();

  if (request.nextUrl.searchParams.get("format") === "csv") {
    const [transactions, accounts, categories, holdings] = await Promise.all([
      readAll(supabase, "transactions"),
      readAll(supabase, "accounts"),
      readAll(supabase, "categories"),
      readAll(supabase, "holdings"),
    ]);
    const name = (rows: Record<string, unknown>[]) => {
      const byId = new Map(rows.map((r) => [r.id, r.name as string]));
      return (id: unknown) => (id ? (byId.get(id) ?? "") : "");
    };
    const [account, category, holding] = [name(accounts), name(categories), name(holdings)];
    const csv = Papa.unparse(
      transactions.map((t) => ({
        date: t.occurred_on,
        type: t.type,
        amount: (Number(t.amount) / 100).toFixed(2),
        account: account(t.account_id),
        to_account: account(t.to_account_id),
        category: category(t.category_id),
        investment: holding(t.holding_id),
        units: t.units ?? "",
        note: t.note ?? "",
        source: t.source,
      })),
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-transactions-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const { data: profile } = await supabase.from("profiles").select("*").single();
  const names = Object.keys(TABLES);
  const tables = await Promise.all(names.map((t) => readAll(supabase, t)));
  const body = {
    app: appConfig.name,
    exported_at: new Date().toISOString(),
    note: "Amounts are in paise (₹1 = 100).",
    profile,
    ...Object.fromEntries(names.map((t, i) => [t, tables[i]])),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
