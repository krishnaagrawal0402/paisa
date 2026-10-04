import { redirect } from "next/navigation";
import { QuickAddProvider } from "@/components/quick-add/quick-add";
import { MobileHeader, Sidebar, TabBar } from "@/components/shell/nav";
import { ToastProvider } from "@/components/ui/toast";
import { getAccounts, getCategories, getCategoryRules, getProfile } from "@/lib/data";
import { getCurrentUser } from "@/lib/supabase/server";
import { getHoldings } from "@/lib/wealth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // proxy.ts already redirects signed-out visitors; this is the authoritative check.
  if (!(await getCurrentUser())) redirect("/login");
  const [profile, accounts, categories, rules, allHoldings] = await Promise.all([
    getProfile(),
    getAccounts({ includeArchived: true }),
    getCategories(),
    getCategoryRules(),
    getHoldings(),
  ]);
  // First visit: a short setup instead of an empty dashboard.
  if (!profile.onboardedAt && accounts.length === 0) redirect("/welcome");
  const holdings = allHoldings
    .filter((h) => !h.archived)
    .map(({ id, name, asset_class }) => ({ id, name, asset_class }));

  return (
    <ToastProvider>
      <QuickAddProvider
        accounts={accounts.filter((a) => !a.archived)}
        categories={categories}
        rules={rules}
        holdings={holdings}
      >
        <Sidebar />
        <MobileHeader />
        <div className="md:pl-64">
          <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-32 md:px-8 md:pt-10 md:pb-12">{children}</main>
        </div>
        <TabBar />
      </QuickAddProvider>
    </ToastProvider>
  );
}
