import { cn } from "@/lib/cn";

type ChipProps = React.ComponentProps<"button"> & { selected?: boolean; tone?: "income" | "expense" | "save" };

const SELECTED = {
  income: "border-income/60 bg-income/15 text-fg",
  expense: "border-expense/60 bg-expense/15 text-fg",
  save: "border-save/60 bg-save/15 text-fg",
};

/** Pill-shaped toggle used for categories, accounts and dates. */
export function Chip({ selected = false, tone = "save", className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-all active:scale-95",
        selected ? SELECTED[tone] : "border-line bg-glass text-muted hover:bg-glass-hover hover:text-fg",
        className,
      )}
      {...props}
    />
  );
}

/** Segmented control (Expense / Income / Transfer). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; activeClass: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="border-line bg-glass grid auto-cols-fr grid-flow-col gap-1 rounded-full border p-1"
      role="radiogroup"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 rounded-full text-sm font-medium transition-all",
            value === o.value ? o.activeClass : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
