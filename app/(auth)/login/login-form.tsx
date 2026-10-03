"use client";

import { ArrowLeft, Mail } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { login } from "./actions";

export function LoginForm({ googleEnabled, initialError }: { googleEnabled: boolean; initialError?: string }) {
  const [current, action, pending] = useActionState(login, { step: "email", error: initialError });

  return (
    <AnimatePresence mode="wait" initial={false}>
      {current.step === "email" ? (
        <motion.div
          key="email"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
        >
          <form action={action} className="space-y-3">
            <label htmlFor="email" className="sr-only">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              defaultValue={current.email}
              required
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={pending}>
              <Mail className="size-4" />
              {pending ? "Sending…" : "Email me a sign-in link"}
            </Button>
          </form>

          {googleEnabled && (
            <>
              <div className="text-subtle my-5 flex items-center gap-3 text-xs">
                <span className="bg-line h-px flex-1" /> or <span className="bg-line h-px flex-1" />
              </div>
              <Button
                type="button"
                variant="glass"
                className="w-full"
                onClick={() =>
                  createClient().auth.signInWithOAuth({
                    provider: "google",
                    options: { redirectTo: `${window.location.origin}/auth/callback` },
                  })
                }
              >
                <GoogleIcon /> Continue with Google
              </Button>
            </>
          )}

          {current.error && <p className="text-expense mt-4 text-sm">{current.error}</p>}
        </motion.div>
      ) : (
        <motion.div
          key="code"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
        >
          <p className="text-muted text-sm">
            We sent a link and a 6-digit code to <span className="text-fg">{current.email}</span>. Tap the link on this
            device, or enter the code:
          </p>
          <form action={action} className="mt-4 space-y-3">
            <label htmlFor="code" className="sr-only">
              6-digit code
            </label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              className="text-center text-2xl tracking-[0.5em]"
              required
              autoFocus
            />
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Checking…" : "Sign in"}
            </Button>
          </form>
          {current.error && <p className="text-expense mt-4 text-sm">{current.error}</p>}
          <form action={action}>
            <button
              name="intent"
              value="restart"
              className="text-muted hover:text-fg mt-5 inline-flex items-center gap-1.5 text-sm"
            >
              <ArrowLeft className="size-4" /> Use a different email
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}
