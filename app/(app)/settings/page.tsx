import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardLabel } from "@/components/ui/card";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("display_name, month_start_day").single();

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Settings</h1>

      <Card>
        <CardLabel>Profile</CardLabel>
        <p className="text-muted mt-1 text-sm">{user?.email}</p>
        <ProfileForm displayName={profile?.display_name ?? ""} monthStartDay={profile?.month_start_day ?? 1} />
      </Card>

      <form action={signOut}>
        <Button variant="glass" className="w-full md:w-auto">
          <LogOut className="size-4" /> Sign out
        </Button>
      </form>
    </div>
  );
}
