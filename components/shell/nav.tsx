"use client";

import { Activity, Gauge, Plus, Settings, Target, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, LogoMark } from "@/components/brand/logo";
import { PrivacyToggle } from "@/components/privacy/privacy-toggle";
import { useQuickAdd } from "@/components/quick-add/quick-add";
import { cn } from "@/lib/cn";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { href: "/", label: "Pulse", icon: Gauge },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/wealth", label: "Wealth", icon: TrendingUp },
  { href: "/plan", label: "Plan", icon: Target },
];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

/** Desktop: fixed left sidebar. */
export function Sidebar() {
  const isActive = useIsActive();
  const { openNew } = useQuickAdd();
  return (
    <aside className="border-line bg-bg/40 fixed inset-y-0 left-0 hidden w-64 flex-col border-r px-4 py-6 backdrop-blur-xl md:flex">
      <Link href="/" className="px-2">
        <Logo />
      </Link>

      <button
        type="button"
        onClick={() => openNew()}
        className="bg-income text-bg mt-8 flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold shadow-[0_0_24px_rgb(61_255_154/0.35)] transition hover:brightness-110"
      >
        <Plus className="size-4" strokeWidth={2.5} /> Add transaction
      </button>

      <nav className="mt-6 flex flex-1 flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
              isActive(href) ? "bg-glass-hover text-fg" : "text-muted hover:bg-glass hover:text-fg",
            )}
          >
            <Icon className={cn("size-[18px]", isActive(href) && "text-income")} />
            {label}
          </Link>
        ))}
      </nav>

      <PrivacyToggle withLabel className="hover:bg-glass flex h-11 items-center gap-3 rounded-xl px-3 text-sm" />
      <Link
        href="/settings"
        className={cn(
          "flex h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
          isActive("/settings") ? "bg-glass-hover text-fg" : "text-muted hover:bg-glass hover:text-fg",
        )}
      >
        <Settings className="size-[18px]" /> Settings
      </Link>
    </aside>
  );
}

/** Mobile: top bar with logo + settings. */
export function MobileHeader() {
  return (
    <header className="pt-safe border-line bg-bg/60 sticky top-0 z-20 border-b backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="size-8" />
        </Link>
        <div className="flex items-center">
          <PrivacyToggle className="grid size-10 place-items-center rounded-full" />
          <Link
            href="/settings"
            aria-label="Settings"
            className="text-muted hover:text-fg grid size-10 place-items-center rounded-full"
          >
            <Settings className="size-5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Mobile: bottom tab bar with the raised + button in the middle. */
export function TabBar() {
  const isActive = useIsActive();
  const { openNew } = useQuickAdd();
  const [left, right] = [NAV.slice(0, 2), NAV.slice(2)];

  const tab = ({ href, label, icon: Icon }: NavItem) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] transition-colors",
        isActive(href) ? "text-fg" : "text-subtle",
      )}
    >
      <Icon className={cn("size-[22px]", isActive(href) && "text-income drop-shadow-[0_0_8px_rgb(61_255_154/0.6)]")} />
      {label}
    </Link>
  );

  return (
    <nav className="pb-safe border-line bg-bg/70 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur-xl md:hidden">
      <div className="flex items-end px-2">
        {left.map(tab)}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            onClick={() => openNew()}
            aria-label="Add transaction"
            className="from-income to-save text-bg -mt-6 grid size-14 place-items-center rounded-full bg-linear-to-br shadow-[0_0_28px_rgb(61_255_154/0.5)] transition active:scale-95"
          >
            <Plus className="size-7" strokeWidth={2.5} />
          </button>
        </div>
        {right.map(tab)}
      </div>
    </nav>
  );
}
