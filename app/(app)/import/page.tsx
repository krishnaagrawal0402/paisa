import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Importer } from "@/components/import/importer";
import { getAccounts, getCategories, getCategoryRules, getRecentImports } from "@/lib/data";

export const metadata = { title: "Import statement" };

export default async function ImportPage() {
  const [accounts, categories, rules, recent] = await Promise.all([
    getAccounts(),
    getCategories(),
    getCategoryRules(),
    getRecentImports(),
  ]);
  return (
    <div className="space-y-5">
      <header>
        <Link href="/activity" className="text-muted hover:text-fg inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4" /> Activity
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Import a bank statement</h1>
      </header>
      <Importer accounts={accounts} categories={categories} rules={rules} recent={recent} />
    </div>
  );
}
