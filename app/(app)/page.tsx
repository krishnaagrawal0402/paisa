import { ArrowDownLeft, ArrowUpRight, PiggyBank, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Amount } from "@/components/money/amount";
import { Card, CardLabel } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function PulsePage() {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("display_name").single();

  // Real numbers arrive with the ledger (M1) and dashboard (M2). Zero state for now.
  const month = { income: 0, spent: 0, invested: 0 };
  const saved = month.income - month.spent;
  const monthLabel = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date());

  return (
    <div className="space-y-5">
      <header>
        <p className="text-muted text-sm">{monthLabel}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          Hey {profile?.display_name ?? "there"} 👋
        </h1>
      </header>

      <Card className="relative overflow-hidden p-6 md:p-8">
        <div aria-hidden className="bg-income/10 absolute -top-24 -right-16 size-64 rounded-full blur-3xl" />
        <CardLabel>Net worth</CardLabel>
        <p className="glow-income mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
          <Amount paise={0} />
        </p>
        <p className="text-muted mt-2 text-sm">Add your accounts and current balances to see this come alive.</p>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Stat label="Income" icon={<ArrowDownLeft className="size-4" />} tone="text-income" paise={month.income} />
        <Stat label="Spent" icon={<ArrowUpRight className="size-4" />} tone="text-expense" paise={month.spent} />
        <Stat label="Invested" icon={<TrendingUp className="size-4" />} tone="text-invest" paise={month.invested} />
        <Stat label="Saved" icon={<PiggyBank className="size-4" />} tone="text-save" paise={saved} />
      </div>

      <Card className="flex items-start gap-4">
        <div className="bg-save/15 text-save grid size-10 shrink-0 place-items-center rounded-full">
          <Sparkles className="size-5" />
        </div>
        <div>
          <p className="font-medium">You&apos;re all set up</p>
          <p className="text-muted mt-1 text-sm">
            Next: add your bank accounts, cards and cash, then start logging. Check{" "}
            <Link href="/settings" className="text-save underline-offset-4 hover:underline">
              Settings
            </Link>{" "}
            for your profile.
          </p>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, icon, tone, paise }: { label: string; icon: React.ReactNode; tone: string; paise: number }) {
  return (
    <Card className="p-4 md:p-5">
      <div className={`flex items-center gap-1.5 ${tone}`}>
        {icon}
        <CardLabel className="text-inherit">{label}</CardLabel>
      </div>
      <p className="mt-3 text-xl font-semibold tracking-tight md:text-2xl">
        <Amount paise={paise} compact />
      </p>
    </Card>
  );
}
