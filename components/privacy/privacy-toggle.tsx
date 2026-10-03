"use client";

import { Eye, EyeOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { PRIVACY_KEY } from "@/lib/privacy";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

const isPrivate = () => document.documentElement.classList.contains("privacy");

function toggle() {
  const on = document.documentElement.classList.toggle("privacy");
  try {
    localStorage.setItem(PRIVACY_KEY, on ? "1" : "0");
  } catch {
    // Storage blocked: the toggle still works for this page view.
  }
}

/** Eye button that blurs every amount on screen (for using the app in public). */
export function PrivacyToggle({ className, withLabel = false }: { className?: string; withLabel?: boolean }) {
  const on = useSyncExternalStore(subscribe, isPrivate, () => false);
  const Icon = on ? EyeOff : Eye;
  const label = on ? "Show amounts" : "Hide amounts";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={withLabel ? undefined : label}
      title={label}
      className={cn("text-muted hover:text-fg transition-colors", className)}
    >
      <Icon className={withLabel ? "size-[18px]" : "size-5"} />
      {withLabel && label}
    </button>
  );
}
