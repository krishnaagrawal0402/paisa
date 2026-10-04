"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

const keyFor = (month: string) => `paisa:report-seen:${month}`;

function read(month: string) {
  try {
    return localStorage.getItem(keyFor(month)) === "1";
  } catch {
    return false;
  }
}

/** "Your September report is ready" for the first days of a new month, until opened or dismissed (per device). */
export function ReportReady({ monthKey, monthName }: { monthKey: string; monthName: string }) {
  const seen = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener("paisa:report-seen", onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener("paisa:report-seen", onChange);
      };
    },
    () => read(monthKey),
    () => true,
  );
  if (seen) return null;

  const markSeen = () => {
    try {
      localStorage.setItem(keyFor(monthKey), "1");
    } catch {
      // Storage blocked: the banner just shows again next time.
    }
    window.dispatchEvent(new Event("paisa:report-seen"));
  };

  return (
    <div className="glass border-invest/40 flex items-center gap-3 p-4">
      <span className="bg-invest/15 text-invest grid size-10 shrink-0 place-items-center rounded-full">
        <Sparkles className="size-5" />
      </span>
      <Link href={`/report/${monthKey}`} onClick={markSeen} className="min-w-0 flex-1">
        <p className="font-medium">Your {monthName} report is ready</p>
        <p className="text-muted text-sm">Score, highlights and a story to share.</p>
      </Link>
      <button
        type="button"
        onClick={markSeen}
        aria-label="Dismiss"
        className="text-muted hover:text-fg grid size-9 place-items-center rounded-full"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
