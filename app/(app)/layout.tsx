import { redirect } from "next/navigation";
import { MobileHeader, Sidebar, TabBar } from "@/components/shell/nav";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // proxy.ts already redirects signed-out visitors; this is the authoritative check.
  if (!(await getCurrentUser())) redirect("/login");

  return (
    <>
      <Sidebar />
      <MobileHeader />
      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-32 md:px-8 md:pt-10 md:pb-12">{children}</main>
      </div>
      <TabBar />
    </>
  );
}
