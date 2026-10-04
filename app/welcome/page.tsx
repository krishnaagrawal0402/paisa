import { redirect } from "next/navigation";
import { getProfile } from "@/lib/data";
import { getCurrentUser } from "@/lib/supabase/server";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getProfile();
  if (profile.onboardedAt) redirect("/");

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-lg px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-10">
      <Onboarding initialName={profile.displayName || user.email.split("@")[0]} initialPayday={profile.monthStartDay} />
    </main>
  );
}
