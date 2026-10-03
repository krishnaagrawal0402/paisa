"use client";

import { Plus } from "lucide-react";
import { useQuickAdd } from "@/components/quick-add/quick-add";
import { Button } from "@/components/ui/button";

export function AddTransactionButton({ label = "Add transaction" }: { label?: string }) {
  const { openNew } = useQuickAdd();
  return (
    <Button onClick={() => openNew()}>
      <Plus className="size-4" strokeWidth={2.5} /> {label}
    </Button>
  );
}
