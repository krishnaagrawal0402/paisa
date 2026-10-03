"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfile } from "./actions";

export function ProfileForm({ displayName, monthStartDay }: { displayName: string; monthStartDay: number }) {
  const [state, action, pending] = useActionState(updateProfile, {});

  return (
    <form action={action} className="mt-5 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="display_name" className="text-muted text-sm">
          Name
        </label>
        <Input id="display_name" name="display_name" defaultValue={displayName} maxLength={40} required />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="month_start_day" className="text-muted text-sm">
          Payday (your financial month starts on this day)
        </label>
        <select
          id="month_start_day"
          name="month_start_day"
          defaultValue={monthStartDay}
          className="border-line bg-glass text-fg focus:border-save/60 h-12 w-full rounded-2xl border px-4 text-base outline-none"
        >
          {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
            <option key={day} value={day} className="bg-bg-raised">
              {day === 1 ? "1st (calendar month)" : ordinal(day)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.ok && <span className="text-income text-sm">Saved ✓</span>}
        {state.error && <span className="text-expense text-sm">{state.error}</span>}
      </div>
    </form>
  );
}

function ordinal(n: number) {
  const suffix =
    n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
}
