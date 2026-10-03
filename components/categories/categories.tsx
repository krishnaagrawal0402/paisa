"use client";

import { Archive, ArchiveRestore, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { saveCategory, setCategoryArchived } from "@/lib/actions/ledger";
import { cn } from "@/lib/cn";
import type { Category, CategoryKind } from "@/lib/types";

type Editing = Category | { new: CategoryKind } | null;

export function Categories({ categories }: { categories: Category[] }) {
  const [kind, setKind] = useState<CategoryKind>("expense");
  const [editing, setEditing] = useState<Editing>(null);
  const ofKind = categories.filter((c) => c.kind === kind).sort((a, b) => a.sort - b.sort);
  const active = ofKind.filter((c) => !c.archived);
  const archived = ofKind.filter((c) => c.archived);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: "expense", label: "Expense", activeClass: "bg-expense text-bg" },
              { value: "income", label: "Income", activeClass: "bg-income text-bg" },
            ]}
          />
        </div>
        <Button variant="glass" className="h-11 px-4" onClick={() => setEditing({ new: kind })}>
          <Plus className="size-4" /> Add
        </Button>
      </div>

      <CategoryRows categories={active} onSelect={setEditing} />

      {archived.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted px-1 text-xs font-medium tracking-[0.08em] uppercase">Archived</p>
          <div className="opacity-60">
            <CategoryRows categories={archived} onSelect={setEditing} />
          </div>
        </div>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing && "id" in editing ? "Edit category" : "New category"}
      >
        {editing !== null && (
          <CategoryForm
            key={"id" in editing ? editing.id : `new-${editing.new}`}
            category={"id" in editing ? editing : null}
            kind={"id" in editing ? editing.kind : editing.new}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

function CategoryRows({ categories, onSelect }: { categories: Category[]; onSelect: (c: Category) => void }) {
  return (
    <ul className="glass divide-line divide-y overflow-hidden">
      {categories.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => onSelect(c)}
            className="hover:bg-glass-hover flex w-full items-center gap-3 px-4 py-3 text-left transition-colors"
          >
            <span className="bg-glass-hover grid size-9 shrink-0 place-items-center rounded-full">{c.emoji}</span>
            <span className="flex-1 text-sm font-medium">{c.name}</span>
            {c.is_essential && (
              <span className="text-save bg-save/10 rounded-full px-2 py-0.5 text-[11px]">Essential</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function CategoryForm({
  category,
  kind,
  onDone,
}: {
  category: Category | null;
  kind: CategoryKind;
  onDone: () => void;
}) {
  const toast = useToast();
  const [emoji, setEmoji] = useState(category?.emoji ?? "📦");
  const [name, setName] = useState(category?.name ?? "");
  const [essential, setEssential] = useState(category?.is_essential ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveCategory({
        id: category?.id,
        name,
        kind,
        emoji,
        is_essential: kind === "expense" && essential,
      });
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: category ? "Category saved" : `${emoji} ${name.trim()} added` });
    });
  }

  function archive() {
    if (!category) return;
    startTransition(async () => {
      const result = await setCategoryArchived(category.id, !category.archived);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: category.archived ? "Category restored" : "Category archived" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex gap-3">
        <div className="w-20 space-y-2">
          <label htmlFor="cat-emoji" className="text-muted text-xs font-medium tracking-[0.08em] uppercase">
            Icon
          </label>
          <Input
            id="cat-emoji"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={16}
            className="text-center text-xl"
          />
        </div>
        <div className="flex-1 space-y-2">
          <label htmlFor="cat-name" className="text-muted text-xs font-medium tracking-[0.08em] uppercase">
            Name
          </label>
          <Input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="Pets"
            required
            autoFocus={!category}
          />
        </div>
      </div>

      {kind === "expense" && (
        <label className="border-line bg-glass flex cursor-pointer items-start gap-3 rounded-2xl border p-4">
          <input
            type="checkbox"
            checked={essential}
            onChange={(e) => setEssential(e.target.checked)}
            className="accent-save mt-0.5 size-4"
          />
          <span>
            <span className="block text-sm font-medium">Essential spend</span>
            <span className="text-muted block text-xs">Rent, groceries, bills… Used to size your emergency fund.</span>
          </span>
        </label>
      )}

      {error && <p className="text-expense text-sm">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : category ? "Save" : "Add category"}
      </Button>

      {category && (
        <Button type="button" variant="ghost" onClick={archive} disabled={pending} className={cn("h-10 w-full")}>
          {category.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
          {category.archived ? "Unarchive" : "Archive (keeps past transactions)"}
        </Button>
      )}
    </form>
  );
}
