import { ChevronRight, Download, LogOut } from "lucide-react";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { getProfile } from "@/lib/data";
import { getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { DeleteAccount } from "./delete-account";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Settings" };

const LINKS = [
  { href: "/wealth", emoji: "🏦", label: "Accounts", hint: "Banks, cards, cash and wallets" },
  { href: "/settings/categories", emoji: "🏷️", label: "Categories", hint: "Rename, add or archive" },
  { href: "/import", emoji: "📄", label: "Import bank statement", hint: "CSV, XLS or XLSX. Read in your browser" },
];

export default async function SettingsPage() {
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>

      <Card>
        <CardLabel>Profile</CardLabel>
        <p className="text-muted mt-1 text-sm">{user?.email}</p>
        <ProfileForm
          displayName={profile.displayName}
          monthStartDay={profile.monthStartDay}
          savingsTargetPct={profile.savingsTargetPct}
        />
      </Card>

      <ul className="glass divide-line divide-y overflow-hidden">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:bg-glass-hover flex items-center gap-3 px-4 py-3.5 transition-colors">
              <span className="bg-glass-hover grid size-9 place-items-center rounded-full">{l.emoji}</span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{l.label}</span>
                <span className="text-muted block text-xs">{l.hint}</span>
              </span>
              <ChevronRight className="text-subtle size-4" />
            </Link>
          </li>
        ))}
      </ul>

      <Card>
        <CardLabel>Your data</CardLabel>
        <p className="text-muted mt-1 text-sm">
          It&apos;s yours. Take a full copy anytime, or a spreadsheet of every transaction.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/api/export" download className={buttonClass("glass", "h-10 px-4")}>
            <Download className="size-4" /> Everything (JSON)
          </a>
          <a href="/api/export?format=csv" download className={buttonClass("glass", "h-10 px-4")}>
            <Download className="size-4" /> Transactions (CSV)
          </a>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <form action={signOut}>
          <Button variant="glass" className="h-10 px-4">
            <LogOut className="size-4" /> Sign out
          </Button>
        </form>
        <DeleteAccount />
      </div>
    </div>
  );
}
