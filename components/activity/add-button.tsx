"use client";

import { Plus } from "lucide-react";
import { useQuickAdd } from "@/components/quick-add/quick-add";
import { Button } from "@/components/ui/button";
import type { TransactionType } from "@/lib/types";

export function AddTransactionButton({ label = "Add transaction", type }: { label?: string; type?: TransactionType }) {
  const { openNew } = useQuickAdd();
  return (
    <Button onClick={() => openNew(type)}>
      <Plus className="size-4" strokeWidth={2.5} /> {label}
    </Button>
  );
}
