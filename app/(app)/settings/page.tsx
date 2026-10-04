import { ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { getProfile } from "@/lib/data";
import { getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
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

      <form action={signOut}>
        <Button variant="glass" className="w-full md:w-auto">
          <LogOut className="size-4" /> Sign out
        </Button>
      </form>
    </div>
  );
}
