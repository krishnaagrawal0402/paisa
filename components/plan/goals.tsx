"use client";

import confetti from "canvas-confetti";
import { LifeBuoy, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/form-fields";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { deleteGoal, markGoalAchieved, saveGoal } from "@/lib/actions/plan";
import { cn } from "@/lib/cn";
import { ASSET_CLASSES, type AssetClass } from "@/lib/finance/holdings";
import { formatCompactINR, formatRupees } from "@/lib/money";
import { parseAmount } from "@/lib/parse/amount";
import type { GoalSource, GoalView } from "@/lib/plan";
import { ACCOUNT_TYPES, type Account } from "@/lib/types";

export type SourceOption =
  | { kind: "account"; id: string; name: string; account: Account }
  | { kind: "holding"; id: string; name: string; assetClass: AssetClass };

type Editing = GoalView | "new" | "emergency" | null;

type Emergency = { avgEssentialMonthly: number; months: number; suggestedTarget: number; covered: number | null };

const monthYear = (date: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );

export function Goals({
  goals,
  sources,
  emergency,
}: {
  goals: GoalView[];
  sources: SourceOption[];
  emergency: Emergency;
}) {
  const [editing, setEditing] = useState<Editing>(null);
  const emergencyGoal = goals.find((g) => g.kind === "emergency");
  const others = goals.filter((g) => g.kind !== "emergency");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Goals</h2>
        <Button variant="glass" className="h-10 px-4" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> New goal
        </Button>
      </div>

      {emergencyGoal ? (
        <GoalCard goal={emergencyGoal} emergency={emergency} onSelect={() => setEditing(emergencyGoal)} />
      ) : (
        <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="bg-save/15 text-save grid size-11 shrink-0 place-items-center rounded-full">
            <LifeBuoy className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Build an emergency fund</p>
            <p className="text-muted mt-0.5 text-sm">
              {emergency.avgEssentialMonthly > 0 ? (
                <>
                  {emergency.months} months of your essentials (
                  <span className="money">{formatRupees(emergency.avgEssentialMonthly)}</span>/mo for rent, groceries,
                  bills…) is{" "}
                  <span className="money text-fg font-medium">{formatRupees(emergency.suggestedTarget)}</span>.
                </>
              ) : (
                "A cushion of 6 months of essential spending, for a job loss or a hospital bill. Log a few months of spending and Paisa will suggest the amount."
              )}
            </p>
          </div>
          <Button onClick={() => setEditing("emergency")} className="shrink-0">
            Set it up
          </Button>
        </Card>
      )}

      {others.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {others.map((g) => (
            <GoalCard key={g.id} goal={g} emergency={emergency} onSelect={() => setEditing(g)} />
          ))}
        </div>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New goal" : editing === "emergency" ? "Emergency fund" : "Goal"}
      >
        {editing !== null && (
          <GoalForm
            key={typeof editing === "string" ? editing : editing.id}
            goal={typeof editing === "string" ? null : editing}
            kind={
              editing === "emergency" || (typeof editing !== "string" && editing.kind === "emergency")
                ? "emergency"
                : "custom"
            }
            sources={sources}
            emergency={emergency}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  );
}

function Ring({ share, reached }: { share: number; reached: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" aria-hidden>
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="6"
        className={reached ? "stroke-income/15" : "stroke-save/15"}
      />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - share)}
        className={cn("transition-[stroke-dashoffset] duration-700", reached ? "stroke-income" : "stroke-save")}
      />
    </svg>
  );
}

function GoalCard({ goal, emergency, onSelect }: { goal: GoalView; emergency: Emergency; onSelect: () => void }) {
  const celebrated = useRef(false);

  // First time a goal is seen reached: celebrate once and remember it.
  useEffect(() => {
    if (!goal.reached || goal.achieved_at || celebrated.current) return;
    celebrated.current = true;
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 }, disableForReducedMotion: true });
    void markGoalAchieved(goal.id);
  }, [goal.reached, goal.achieved_at, goal.id]);

  const isEmergency = goal.kind === "emergency";
  let detail: React.ReactNode;
  if (goal.reached) detail = <span className="text-income">🎉 Reached</span>;
  else if (goal.monthlyNeeded !== null && goal.target_date)
    detail = (
      <>
        <span className="money">{formatRupees(goal.monthlyNeeded)}</span>/mo to make it by {monthYear(goal.target_date)}
      </>
    );
  else if (goal.overdue) detail = <span className="text-warn">Target date passed</span>;
  else if (goal.eta) detail = <>~{monthYear(goal.eta)} at your recent saving pace</>;
  else detail = "Link an account or investment, or add what you've saved";

  return (
    <button
      type="button"
      onClick={onSelect}
      className="glass hover:bg-glass-hover flex w-full items-center gap-4 p-4 text-left transition-colors"
    >
      <div className="relative">
        <Ring share={goal.share} reached={goal.reached} />
        <span className="absolute inset-0 grid place-items-center text-xl">{goal.emoji}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{goal.name}</p>
        <p className="mt-0.5 text-sm tabular-nums">
          <span className="money font-semibold">{formatCompactINR(goal.current)}</span>
          <span className="text-muted">
            {" "}
            of <span className="money">{formatCompactINR(goal.target_amount)}</span> · {Math.round(goal.share * 100)}%
          </span>
        </p>
        {isEmergency && emergency.covered !== null && (
          <p className="text-save mt-0.5 text-xs">
            {emergency.covered.toFixed(1)} of {emergency.months} months of essentials covered
          </p>
        )}
        <p className="text-muted mt-0.5 truncate text-xs">{detail}</p>
      </div>
    </button>
  );
}

const sameSource = (a: GoalSource, b: { kind: "account" | "holding"; id: string }) =>
  b.kind === "account" ? a.account_id === b.id : a.holding_id === b.id;

function GoalForm({
  goal,
  kind,
  sources,
  emergency,
  onDone,
}: {
  goal: GoalView | null;
  kind: "custom" | "emergency";
  sources: SourceOption[];
  emergency: Emergency;
  onDone: () => void;
}) {
  const toast = useToast();
  const isEmergency = kind === "emergency";
  const [emoji, setEmoji] = useState(goal?.emoji ?? (isEmergency ? "🛟" : "🎯"));
  const [name, setName] = useState(goal?.name ?? (isEmergency ? "Emergency fund" : ""));
  const [target, setTarget] = useState(
    goal
      ? String(goal.target_amount / 100)
      : isEmergency && emergency.suggestedTarget
        ? String(emergency.suggestedTarget / 100)
        : "",
  );
  const [date, setDate] = useState(goal?.target_date ?? "");
  const [manual, setManual] = useState(goal?.manual_saved ? String(goal.manual_saved / 100) : "");
  const [linked, setLinked] = useState<GoalSource[]>(goal?.sources ?? []);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (option: SourceOption) =>
    setLinked((current) =>
      current.some((s) => sameSource(s, option))
        ? current.filter((s) => !sameSource(s, option))
        : [
            ...current,
            option.kind === "account"
              ? { account_id: option.id, holding_id: null }
              : { account_id: null, holding_id: option.id },
          ],
    );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseAmount(target);
    if (!amount) return setError("Enter the target amount");
    const saved = manual.trim() ? parseAmount(manual) : 0;
    if (saved === null) return setError("'Saved elsewhere' should be a number");
    startTransition(async () => {
      const result = await saveGoal({
        id: goal?.id,
        name,
        emoji,
        kind,
        target_amount: amount,
        target_date: date || null,
        manual_saved: saved,
        sources: linked,
      });
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: goal ? "Goal saved" : `${emoji} ${name} added` });
    });
  }

  function remove() {
    if (!goal) return;
    if (!confirmDelete) return setConfirmDelete(true);
    startTransition(async () => {
      const result = await deleteGoal(goal.id);
      if (!result.ok) return setError(result.error);
      onDone();
      toast.show({ message: "Goal deleted" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex gap-3">
        <label className="w-20 space-y-1.5">
          <span className="text-muted block text-xs">Icon</span>
          <Input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={16}
            className="text-center text-xl"
          />
        </label>
        <label className="flex-1 space-y-1.5">
          <span className="text-muted block text-xs">Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Goa trip, new laptop…"
            maxLength={40}
            required
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-muted text-xs">Target</span>
          <div className="relative">
            <span className="text-muted pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">₹</span>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              inputMode="decimal"
              placeholder="1.5L"
              className="pl-9 tabular-nums"
            />
          </div>
        </label>
        <label className="block space-y-1.5">
          <span className="text-muted text-xs">By (optional)</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="[color-scheme:dark]" />
        </label>
      </div>
      {isEmergency && emergency.avgEssentialMonthly > 0 && (
        <p className="text-subtle -mt-3 text-xs">
          Suggested: {emergency.months} × <span className="money">{formatRupees(emergency.avgEssentialMonthly)}</span>{" "}
          of essential spending a month (categories marked Essential).
        </p>
      )}

      {sources.length > 0 && (
        <Field label="Counts the money in">
          <div className="flex flex-wrap gap-2">
            {sources.map((o) => (
              <Chip key={`${o.kind}-${o.id}`} selected={linked.some((s) => sameSource(s, o))} onClick={() => toggle(o)}>
                <span aria-hidden>
                  {o.kind === "account" ? ACCOUNT_TYPES[o.account.type].emoji : ASSET_CLASSES[o.assetClass].emoji}
                </span>
                <span className="max-w-48 truncate">{o.name}</span>
              </Chip>
            ))}
          </div>
          <p className="text-subtle text-xs">
            Progress follows their live balance, so there&apos;s nothing extra to log.
          </p>
        </Field>
      )}

      <label className="block space-y-1.5">
        <span className="text-muted text-xs">Saved elsewhere (optional)</span>
        <div className="relative">
          <span className="text-muted pointer-events-none absolute top-1/2 left-4 -translate-y-1/2">₹</span>
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="pl-9 tabular-nums"
          />
        </div>
      </label>

      {error && <p className="text-expense text-sm">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : goal ? "Save" : isEmergency ? "Start my emergency fund" : "Add goal"}
      </Button>
      {goal && (
        <Button
          type="button"
          variant="ghost"
          onClick={remove}
          disabled={pending}
          className={cn("text-expense hover:text-expense h-10 w-full", confirmDelete && "bg-expense/15")}
        >
          <Trash2 className="size-4" /> {confirmDelete ? "Tap again" : "Delete goal"}
        </Button>
      )}
    </form>
  );
}
