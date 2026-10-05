"use client";

import { KeyRound } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setPassword } from "./actions";

/** Set or change the password for "Sign in with a password" (the installed phone app can't open email links). */
export function PasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(setPassword, {});

  return (
    <form action={action} className="mt-4 space-y-3">
      {/* Lets password managers file the new password under the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="new-password" className="text-muted text-sm">
            New password
          </label>
          <Input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirm-password" className="text-muted text-sm">
            Type it again
          </label>
          <Input
            id="confirm-password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="glass" disabled={pending} className="h-10 px-4">
          <KeyRound className="size-4" /> {pending ? "Saving…" : "Save password"}
        </Button>
        {state.ok && <span className="text-income text-sm">Saved ✓ You can now sign in with it.</span>}
        {state.error && (
          <span role="alert" className="text-expense text-sm">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
