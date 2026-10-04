"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { deleteMyAccount } from "./actions";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteMyAccount, {});
  const [typed, setTyped] = useState("");

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} className="text-expense hover:text-expense h-10 px-4">
        <Trash2 className="size-4" /> Delete my account
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Delete your account?">
        <form action={action} className="space-y-4">
          <p className="text-muted text-sm">
            This permanently erases your accounts, transactions, investments, loans, budgets and goals, and your login.
            It can&apos;t be undone. Download an export first if you might want it back.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="confirm" className="text-muted text-sm">
              Type <span className="text-fg font-mono">delete</span> to confirm
            </label>
            <Input
              id="confirm"
              name="confirm"
              autoFocus
              autoComplete="off"
              autoCapitalize="none"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          {state.error && (
            <p role="alert" className="text-expense text-sm">
              {state.error}
            </p>
          )}
          <Button
            type="submit"
            disabled={pending || typed.trim().toLowerCase() !== "delete"}
            className="bg-expense w-full shadow-none hover:shadow-none"
          >
            {pending ? "Deleting…" : "Delete everything"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
